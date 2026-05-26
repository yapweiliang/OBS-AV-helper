const EventEmitter = require("node:events");
const { OBSWebSocket } = require('obs-websocket-js');

const DEBUG_PREFIX = "module obs.js: ";
const OBS_RECONNECT_DELAY_S = 5;

class OBS extends EventEmitter {

  constructor(config) {

    super();

    this.OBS_WS_URL = `ws://${config.host || "localhost"}:${config.port || 4455}`
    this.OBS_WS_PASSWORD = config.password || "";

    this.PTZ_ACTION_DEVICE_ID = config.PTZ_ACTION_DEVICE_ID || 1;

    this.OVERLAY_SCENENAME = config.OVERLAY_SCENENAME || "---OVERLAY---";
    this.PARENTS_OVERLAY_SOURCENAME = config.PARENTS_OVERLAY_SOURCENAME || "parents_overlay";
    this.CUSTOM_OVERLAY_SOURCENAME = config.CUSTOM_OVERLAY_SOURCENAME || "custom_overlay";

    this.obs = null;

    this.obsConnectSuccess = false;
    this.connecting = false;

    this.overlayCache = {};
    this.b_recordState = false;
    this.b_streamState = false;

    this.lastScene = null;

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

    try {
      this.obs = new OBSWebSocket();
      const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(this.OBS_WS_URL, this.OBS_WS_PASSWORD);
      console.log(DEBUG_PREFIX, `Connected to OBS websocket server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`);

      await this.updateOutputStates();
      this.obs.on('CurrentProgramSceneChanged', this.onSceneChanged);
      this.obs.on('StreamStateChanged', this.onStreamStateChanged);   // Tally to follow stream state, because sending both will 
      this.obs.on('RecordStateChanged', this.onRecordStateChanged);   // probably need camera message queuing.
      this.obs.once('ExitStarted', this.onceExitStarted);
      this.obs.on('ConnectionClosed', () => {
        this.obsConnectSuccess = false;
        const e = 'Disconnected from OBS'
        this.emit('flashStatusText', { text: e, timeout: 0 });
        console.log(DEBUG_PREFIX, e);
        this.scheduleReconnect();
      });

      this.obsConnectSuccess = true;
    } catch (error) {
      console.error(DEBUG_PREFIX, `Failed to connect to OBS websocket. Error code: ${error.code} Error message: ${error.message}`);
      this.obsConnectSuccess = false;
      this.scheduleReconnect();
      return;
    } finally {
      this.connecting = false;
    }

    if (this.obsConnectSuccess) {
      await this.updateOverlayCache();
    }
    return this.obsConnectSuccess
  };

  async disconnect() {
    if (!this.obs) { return; }
    console.log(DEBUG_PREFIX, "hello from disconnect()");
    this.obs.removeAllListeners();

    try {
      await this.obs.disconnect();
    } catch {
    }

    this.obs = null;
    this.obsConnectSuccess = false;
  }

  async reconnect() {
    console.log(DEBUG_PREFIX, "hello from reconnect()");
    // TODO do we really need a manual reconnect?
    await this.disconnect();
    return await this.connect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(DEBUG_PREFIX, `Will try connecting [await this.connect()] in ${OBS_RECONNECT_DELAY_S} seconds...`);
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
      console.log(DEBUG_PREFIX, `updateOutputStates failed. Error:${error.message}`)
    }
  };

  // ====================================================
  // OBS event handling
  // ====================================================

  async onSceneChanged(event) {
    console.log(DEBUG_PREFIX, 'Current scene: ', event.sceneName)
    if (true) {
      // Tally Light management
      if (event.sceneName != this.OVERLAY_SCENENAME) {
        this.emit('setCameraTallyColor', this.isLiveOutput() ? "red" : "green");
      }
      
      // hopefully not too excessive, may need to consider message queuing for camera API if so
      
      // GetSourceActive --> this does not seem to equate to visibility in the program/preview
    }

    if (false) {
      // exit from OVERLAY scene management?
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
          const preset_id = settings.inputSettings.preset_id + 1;         // offset +1 for correct pelco address? TODO check
console.log(DEBUG_PREFIX, `ptz_action device_id: ${device_id} action: ${ptz_action} preset_id: ${preset_id}`);
          if (device_id == this.PTZ_ACTION_DEVICE_ID && ptz_action == 2) {     // verify device_id and action (2 = RECALL)
            this.emit('highlightCameraPreset', {preset_id, timeout: -1}); // -1 means leave highlight on (but the set button will still timeout)
            ptz_action_found = true;
            break;
          }
        }
      }
      if (!ptz_action_found) {
        this.emit('highlightCameraPreset', {preset_id: -1, timeout: 0}); // timeout may be irrelevant shall we omit it?
      }
    } catch (error) {
      console.log(DEBUG_PREFIX, `onSceneChanged failed in PTZ highlight. Error:${error.message}`)
    }
  };

  async onStreamStateChanged(event) {
    if (this.b_streamState != event.outputActive) {    
      this.b_streamState = event.outputActive;
      console.log(DEBUG_PREFIX, `Stream State changed to:${event.outputState} outputActive:${event.outputActive} Live:${this.isLiveOutput()}`);
      this.emit('setCameraTallyColor', this.isLiveOutput() ? "red" : "green");
    };
  };

  async onRecordStateChanged(event) {
    if (this.b_recordState != event.outputActive) {
      this.b_recordState = event.outputActive;
      console.log(DEBUG_PREFIX, `Record State changed to:${event.outputState} outputActive:${event.outputActive} Live:${this.isLiveOutput()}`);
      // await App.Camera.setCameraTallyColor( this.isLiveOutput() ? "red" : "green");
      // would need message queuing if tally is set here as well as onStreamStateChange
    };
  };

  async onceExitStarted() {
    console.log(DEBUG_PREFIX, 'exit started');
    // CONSIDER turn off tally light
    // CONSIDER power off

    this.emit('setCameraTallyColor', "blue"); // lets try and see if there is enough time to send this :-)
  };

  // ====================================================
  // overlay management
  // ====================================================
async showOverlayScene() {
    if (this.isLiveOutput()) {
      console.log(DEBUG_PREFIX, 'showOverlayScene not allowed during Live Stream');
      return;
    }
    try {
      const { sceneName } = await this.obs.call('GetCurrentProgramScene');

      if (sceneName == this.OVERLAY_SCENENAME && (this.lastScene)) {
        await this.updateOverlayCache(); // also hides the sources // TODO should we move/duplicate this logic to onSceneChanged[away from OVERLAY]?
        await this.obs.call('SetCurrentProgramScene', { sceneName: this.lastScene });  
        this.lastScene = null;
        return false;
      }

      this.lastScene = sceneName;
      await this.obs.call('SetCurrentProgramScene', { sceneName: this.OVERLAY_SCENENAME });
      for (const sourceName of [this.PARENTS_OVERLAY_SOURCENAME, this.CUSTOM_OVERLAY_SOURCENAME]) {
        await this.setSourceVisible(sourceName, true);
      }
      return true;
      
    } catch (error) {
      console.log(DEBUG_PREFIX, `Failed to show OVERLAY scene. Error:${error.message}`)
    }
  }

  async unhideOverlaySceneSource() {
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
      console.log(DEBUG_PREFIX, `Failed to unhide OVERLAY SCENE source. Error:${error.message}`)
    }
  }

  async updateOverlayCache() {
    try {
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: this.OVERLAY_SCENENAME });

      for (const item of sceneItems) {
         this.overlayCache[item.sourceName] = { sceneItemId: item.sceneItemId };
        // Force hidden on startup
        await this.setSourceVisible(item.sourceName, false);
      }

      for (const sourceName of [this.PARENTS_OVERLAY_SOURCENAME, this.CUSTOM_OVERLAY_SOURCENAME]) {        
        if (!(sourceName in  this.overlayCache)) {
          console.warn(DEBUG_PREFIX, `${this.OVERLAY_SCENENAME}" does not contain "${sourceName}"`)
        }
      }
      console.log(DEBUG_PREFIX, `Overlay cache initialised with source names "${Object.keys( this.overlayCache)}"`,  this.overlayCache);
      return true;
    } catch (error) {
      console.log(DEBUG_PREFIX, `Failed to update overlay cache. Error:${error.message}`,  this.overlayCache);
    }
  }

  getOverlayCacheSourceNames() {
    return Object.keys(this.overlayCache)
  }

  async setSourceVisible(sourceName, visible) {

        const cached = this.overlayCache[sourceName];

        if (!cached) {
            console.warn(DEBUG_PREFIX, 'Source not cached:', sourceName);
            return;
        }

        await this.obs.call('SetSceneItemEnabled', {
            sceneName: this.OVERLAY_SCENENAME,
            sceneItemId: cached.sceneItemId,
            sceneItemEnabled: visible
        });
    }

    async setTextSourceText(sourceName, text) {
      await this.obs.call('SetInputSettings', { inputName: sourceName, inputSettings: { text } });
    }

    async getTextSourceText(sourceName) {
      const response = await this.obs.call('GetInputSettings', { inputName: sourceName });
      return response.inputSettings.text || '';
    }
}

module.exports = OBS;