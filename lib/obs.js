const EventEmitter = require("node:events");
const { OBSWebSocket } = require('obs-websocket-js');

const DEBUG_PREFIX = "[obs.js]";
function debugPrefix() { return `${new Date().toLocaleTimeString()} ${DEBUG_PREFIX}` };
const OBS_RECONNECT_DELAY_S = 5;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class OBS extends EventEmitter {

  constructor(config, sceneNames) {

    super();

    this.OBS_WS_URL = `ws://${config.host || "localhost"}:${config.port || 4455}`
    this.OBS_WS_PASSWORD = config.password || "";

    this.PTZ_ACTION_DEVICE_ID = config.PTZ_ACTION_DEVICE_ID || 1;

    this.OVERLAY_SCENENAME = config.OVERLAY_SCENENAME || "---OVERLAY---";
    this.PARENTS_OVERLAY_SOURCENAME = config.PARENTS_OVERLAY_SOURCENAME || "parents_overlay";
    this.CUSTOM_OVERLAY_SOURCENAME = config.CUSTOM_OVERLAY_SOURCENAME || "custom_overlay";

    this.obs = null;

    this.obsConnectSuccess = false;   // this is used to test whether obs is connected
    this.obsConnectReport = null;     // this shall be a text summary of connection status/problem (e.g. authentication)
    this.obsScenesReport = null;      // this shall be an array of mismatching/misspelled scenes (or empty array if none)
    this.connecting = false;          // status of connect()
    this.disconnecting = false;       // status of disconnect()

    this.overlayCache = {};
    this.b_recordState = false;
    this.b_streamState = false;

    this.lastScene = null;            // this is for the overlay scene helper
    this.sceneNames = sceneNames;     // scene names passed from CONFIG.ui.obsScenes

    this.onSceneChanged = this.onSceneChanged.bind(this);
    this.onStreamStateChanged = this.onStreamStateChanged.bind(this);
    this.onRecordStateChanged = this.onRecordStateChanged.bind(this);
    this.onceExitStarted = this.onceExitStarted.bind(this);
  }

  // ====================================================
  // CONNECT
  // ====================================================

  async connect() {
    if (this.connecting) { return false; }
    this.connecting = true;
    this.disconnecting = false;

    try {
      this.obs = new OBSWebSocket();
      const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(this.OBS_WS_URL, this.OBS_WS_PASSWORD);
      console.log(debugPrefix(), `Connected to OBS websocket server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`);

      await this.updateOutputStates();
      this.obs.on('CurrentProgramSceneChanged', this.onSceneChanged);
      this.obs.on('StreamStateChanged', this.onStreamStateChanged);   // Tally to follow stream state, because sending both will
      this.obs.on('RecordStateChanged', this.onRecordStateChanged);   // probably need camera message queuing.
      this.obs.once('ExitStarted', this.onceExitStarted);
      this.obs.on('ConnectionClosed', () => {
        this.obsConnectSuccess = false;
        this.obsConnectReport = 'Disconnected from OBS';
        this.emit('obsConnectSuccess', false); // intention to say something in status text
        console.log(debugPrefix(), 'Disconnected from OBS');
        this.scheduleReconnect();
      });

      this.obsConnectSuccess = true;

    } catch (error) {
      this.obsConnectSuccess = false;
      if (error.code == 4009) {
        this.obsConnectReport = 'OBS websocket authentication failed.  Please check OBS password in config.js, then restart Node server.';
        console.error(debugPrefix(), `OBS websocket authentication failed.  Please check OBS websocket password in config.  Error code: ${error.code} Error message: ${error.message}`);
        this.scheduleReconnect();
      } else {
        this.obsConnectReport = 'Failed to connect to OBS websocket.  (See log file for more details)';
        console.error(debugPrefix(), `Failed to connect to OBS websocket. Error code: ${error.code} Error message: ${error.message}`);
        this.scheduleReconnect();
      }

    } finally {
      this.connecting = false;
    }

    if (this.obsConnectSuccess) {
      this.obsConnectReport = 'Connected to OBS';
      await sleep(500); // try slight delay to ensure OBS can respond to the next request
      await this.updateOverlayCacheAndScenesReport();
      this.emit('obsConnectSuccess', true); // intention to power_on the camera at this point
    }
    return this.obsConnectSuccess
  };

  async disconnect() {
    // called on server.js shutdown
    console.log(debugPrefix(), `disconnect(); this.connecting: ${this.connecting}`);
    this.disconnecting = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.obs) {
      this.obs.removeAllListeners();
      try { await this.obs.disconnect(); } catch { }
      this.obs = null;
    }

    this.obsConnectSuccess = false;
  }

  async reconnect() {
    console.log(debugPrefix(), "hello from reconnect()");
    // TODO do we really need a manual reconnect?
    await this.disconnect();
    return await this.connect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.disconnecting) return; // to handle the situation when server is aborted whilst awaiting obs connection

    console.log(debugPrefix(), `Will try connecting [await this.connect()] in ${OBS_RECONNECT_DELAY_S} seconds...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();   // creates fresh OBSWebSocket
      } catch (e) {
        this.scheduleReconnect();
      }
    }, OBS_RECONNECT_DELAY_S * 1000);
  }

  // ====================================================
  // helper functions
  // ====================================================

  isLiveOutput() {
    return this.b_recordState || this.b_streamState;
  }

  async updateOutputStates() {
    try {
      const resRecord = await this.obs.call('GetRecordStatus');
      const resStream = await this.obs.call('GetStreamStatus');
      this.b_streamState = resStream.outputActive;
      this.b_recordState = resRecord.outputActive;
    } catch (error) {
      console.error(debugPrefix(), `updateOutputStates failed. Error: ${error.message}`)
    }
  };

  // ====================================================
  // OBS event handling
  // ====================================================

  async onSceneChanged(event) {
    console.log(debugPrefix(), 'Current scene: ', event.sceneName)
    this.emit('highlightOBSScene', event.sceneName);

    if (true) {
      // Tally Light management
      if (event.sceneName != this.OVERLAY_SCENENAME) {
        this.emit('setCameraTallyColor', this.isLiveOutput() ? "red" : "green");
      }
      // hopefully not too excessive, may need to consider message queuing for camera API if so
    }

    if (true) {
      // OVERLAY scene entry/exit management
      if (event.sceneName == this.OVERLAY_SCENENAME) {
        // on entry
        this.lastScene = event.sceneName;
        this.emit('overlaySceneSelected'); // calls resetOverlayButtons
        for (const sourceName of [this.PARENTS_OVERLAY_SOURCENAME, this.CUSTOM_OVERLAY_SOURCENAME]) {
          await this.setSourceVisible(sourceName, true);
        }
      } else if (this.lastScene == this.OVERLAY_SCENENAME) {
        // on exit
        this.lastScene = event.sceneName;
        await this.updateOverlayCacheAndScenesReport(); // also hides the sources
      }
    }

    try {
      // Determine PTZ preset, and highlight the matching row
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: event.sceneName });
      let ptz_action_found = false;
      for (const item of sceneItems) {
        const sourceName = item.sourceName;
        const sourceKind = item.inputKind;
        const sourceEnabled = item.sceneItemEnabled;
        if (sourceKind == 'ptz_action_source' && sourceEnabled == true) { // verify source kind, and source enabled
          const settings = await this.obs.call('GetInputSettings', { inputName: sourceName });
          const device_id = settings.inputSettings.device_id;
          const ptz_action = settings.inputSettings.action;
          const preset_id = settings.inputSettings.preset_id + 1;         // offset +1 for correct pelco address
console.log(debugPrefix(), `ptz_action device_id: ${device_id} action: ${ptz_action} preset_id: ${preset_id}`);
          if (device_id == this.PTZ_ACTION_DEVICE_ID && ptz_action == 2) {     // verify device_id and action (2 = RECALL)
            this.emit('highlightCameraPreset', preset_id);
            ptz_action_found = true;
            break;
          }
        }
      }
      if (!ptz_action_found) {
        this.emit('highlightCameraPreset', -1);
      }
    } catch (error) {
      console.error(debugPrefix(), `onSceneChanged failed in PTZ highlight. Error: ${error.message}`)
    }
  };

  async onStreamStateChanged(event) {
    if (this.b_streamState != event.outputActive) {
      this.b_streamState = event.outputActive;
      console.log(debugPrefix(), `Stream State changed to:${event.outputState} outputActive:${event.outputActive} Live:${this.isLiveOutput()}`);
      this.emit('setCameraTallyColor', this.isLiveOutput() ? "red" : "green");
      this.emit('updateOBSLiveStatus', this.b_recordState, this.b_streamState);
    };
  };

  async onRecordStateChanged(event) {
    if (this.b_recordState != event.outputActive) {
      this.b_recordState = event.outputActive;
      console.log(debugPrefix(), `Record State changed to:${event.outputState} outputActive:${event.outputActive} Live:${this.isLiveOutput()}`);
      // await App.Camera.setCameraTallyColor( this.isLiveOutput() ? "red" : "green");
      // would need message queuing if tally is set here as well as onStreamStateChange
      this.emit('updateOBSLiveStatus', this.b_recordState, this.b_streamState);
    };
  };

  async onceExitStarted() {
    console.log(debugPrefix(), 'exit started');
    this.emit("exitStarted"); // server.js to manage next steps, e.g. camera light/power
  };

  // ====================================================
  // overlay management
  // ====================================================

  async unhideOverlaySceneSource() {
    // as we depend on the overlay scene being a source in all the relevent scenes
    // this unhides the overlay scene source in case it has been inadvertently hidden
    if (!this.obsConnectSuccess) return;
    try {
      const { sceneName } = await this.obs.call('GetCurrentProgramScene');
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: sceneName });
      for (const item of sceneItems) {
        if (item.sourceName == this.OVERLAY_SCENENAME) {
          await this.obs.call('SetSceneItemEnabled', {
            sceneName: sceneName,
            sceneItemId: item.sceneItemId,
            sceneItemEnabled: true
          });
          return true;
        }
      }
    } catch (error) {
      console.error(debugPrefix(), `Failed to unhide OVERLAY SCENE source. Error: ${error.message}`)
    }
  }

  async updateOverlayCacheAndScenesReport() {
    // called when:
    // - obs connected
    // - scene changed away from OVERLAY_SCENENAME

    if (!this.obsConnectSuccess) return;
    try {
      const { scenes } = await this.obs.call('GetSceneList');
      const obsScenesSet = new Set(scenes.map(scene => scene.sceneName));
      const overlayExists = obsScenesSet.has(this.OVERLAY_SCENENAME);

      // also: generate a list of invalid scene names
      this.obsScenesReport = this.sceneNames.filter( sceneName => !obsScenesSet.has(sceneName));
      if (this.obsScenesReport > 0) {
        console.warn(debugPrefix(), `WARNING: The following ${this.obsScenesReport.length} scene names in config.js are not found in OBS:\n${JSON.stringify(this.obsScenesReport)}`);
      }

      if (!overlayExists) {
        throw new Error(`WARNING: Overlay Scene "${this.OVERLAY_SCENENAME}" missing or spelt wrongly in OBS`);
      }

      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: this.OVERLAY_SCENENAME });

      this.overlayCache = {};
      for (const item of sceneItems) {
         this.overlayCache[item.sourceName] = { sceneItemId: item.sceneItemId };
        // Force hidden on startup
        await this.setSourceVisible(item.sourceName, false);
      }

      console.log(debugPrefix(), `Overlay cache initialised with source names "${Object.keys(this.overlayCache)}"`, this.overlayCache);
      for (const sourceName of [this.PARENTS_OVERLAY_SOURCENAME, this.CUSTOM_OVERLAY_SOURCENAME]) {
        if (!(sourceName in this.overlayCache)) {
          console.warn(debugPrefix(), `WARNING: "${this.OVERLAY_SCENENAME}" does not contain "${sourceName}"`)
        }
      }

      return true;
    } catch (error) {
      console.error(debugPrefix(), `Failed to update overlay cache. Error: ${error.message}`,  this.overlayCache);
    }
  }

  getOverlayCacheSourceNames() {
    return Object.keys(this.overlayCache)
  }

  async setSourceVisible(sourceName, visible) {
    if (!this.obsConnectSuccess) return;
    try {
      const cached = this.overlayCache[sourceName];

      if (!cached) {
        console.warn(debugPrefix(), 'Source not cached:', sourceName);
        return;
      }

      await this.obs.call('SetSceneItemEnabled', {
        sceneName: this.OVERLAY_SCENENAME,
        sceneItemId: cached.sceneItemId,
        sceneItemEnabled: visible
      });

    } catch (error) {
      console.error(debugPrefix(), "setSourceVisible", error.message);
    }
  }

  async setTextSourceText(sourceName, text) {
    if (!this.obsConnectSuccess) return;
    try {
      await this.obs.call('SetInputSettings', { inputName: sourceName, inputSettings: { text } });

    } catch (error) {
      console.error(debugPrefix(), "setTextSourceText", error.message);
    }
  }

  async getTextSourceText(sourceName) {
    if (!this.obsConnectSuccess) return;
    try {
      const response = await this.obs.call('GetInputSettings', { inputName: sourceName });
      return response.inputSettings.text || '';

    } catch (error) {
      console.error(debugPrefix(), "getTextSourceText", error.message);
    }
  }

  // ====================================================
  // scene get/call
  // ====================================================

  async getCurrentProgramScene() {
    if (!this.obsConnectSuccess) return;
    try {
      const response = await this.obs.call('GetCurrentProgramScene');
      return response.sceneName || '';

    } catch (error) {
      console.error(debugPrefix(), "getCurrentProgramScene", error.message)
    }
  }

  async setCurrentProgramScene(sceneName) {
    if (!this.obsConnectSuccess) return;
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName: sceneName });
    } catch (error) {
      if (error.code == 600) {
        console.error(debugPrefix(), `setCurrentProgramScene "${sceneName}" scene not found`);
      } else {
        console.error(debugPrefix(), "setCurrentProgramScene", error.message)
      }
      return error.code;
    }
  }

}

module.exports = OBS;