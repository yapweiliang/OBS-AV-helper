const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const config = require("./config/config");
const X32 = require("./lib/x32");
const OBS = require("./lib/obs.js");
const CAMERA = require("./lib/camera.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEBUG_PREFIX = "[server.js]";
const LISTEN_PORT = 3000;

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// X32 and OBS 
// ----------------------------------------------------

const x32 = new X32(config.x32);
x32.connect();

const obs = new OBS(config.obs);
obs.connect();

const camera = new CAMERA(config.camera);
let activePreset = -1;

// ----------------------------------------------------
// API: read config
// ----------------------------------------------------

app.get("/api/config", (req, res) => {

    //res.json(config); // also exposes x32
    res.json({ 
        ui: config.ui
     }) // will keep same structure
    // res.json({ config.ui }) will need some rewriting in server.js
});

// ----------------------------------------------------
// API: INCOMING from HTTP POST
// ----------------------------------------------------

app.post("/x32/action/:name", (req, res) => {
    // POST received from public/app.js for X32

    const signalId = req.params.name;
    console.log( DEBUG_PREFIX, "ACTION:", signalId );

    try {
        x32.executeAction(signalId);
        res.json({ ok: true, action: signalId });

    } catch (err) {
        console.error( DEBUG_PREFIX, "Action error:", err );
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------
// WebSocket: push state to browser
// ----------------------------------------------------

function broadcastToBrowsers(obj) {

    const msg = JSON.stringify(obj);

    wss.clients.forEach(client => {
        if ( client.readyState === WebSocket.OPEN ) { client.send(msg); }
    });
}

function broadcastStatusTextToBrowsers(text, durationMs) {
    broadcastToBrowsers({ type: "flashStatusText", text: text, durationMs: durationMs });
    // TODO what happens if message omits durationMs - will the final function choose default duration?
}


// ----------------------------------------------------
// WebSocket: INCOMING from app.js
// ----------------------------------------------------

wss.on("connection", ws => {
    console.log(DEBUG_PREFIX, "Browser connected");
    ws.send(JSON.stringify({ type: "x32StateChanged", state: x32.getState() })); // refresh state
    ws.send(JSON.stringify({ type: "x32HeartbeatsMissed", state: x32.getPollCyclesCounter() }));

    ws.on("message", data => wsMessageHandler(data, ws));
});

async function wsMessageHandler(data, ws) {
    let msg;
    let e;
    try {
        msg = JSON.parse(data.toString());
    } catch (error) {
        console.error(DEBUG_PREFIX, "wsMessageHandler error:", error)
        return;
    }
    switch (msg.type) {

        // messages from app.js for other clients
        // --------------------------------------
        // (flashStatusText from obs.js and camera.js are handled separately)
        case "flashStatusText":
            broadcastToBrowsers({ type: "flashStatusText", text: msg.text, durationMs: msg.durationMs });
            break;

        // (highlightCameraPreset from obs.js is handled separately)
        case "highlightCameraPreset":
            highlightCameraPreset(msg.preset_id);
            break;

        // messages from app.js for camera.js
        // ----------------------------------
        case "callCameraPreset":
            e = await camera.callPreset(msg.preset_id);
            // TODO statusText update
            break;
        case "setCameraPreset":
            e = await camera.setPreset({ n: preset_id, name: preset_name });
            // TODO statusText update
            break;
        case "toggleAutoFocus":
            e = await camera.toggleAutoFocus();
            // TODO statusText update
            await refreshCameraUIStates();
            break;
        case "onePushFocus":
            // TODO statusText update in the form of  // this.emit("flashStatusText", `${msg} ${e ? OK_TEXT : FAILED_TEXT}`);
            e = await camera.onePushFocus();
            break;
        case "onePushWhiteBalance":
            e = await camera.onePushWhiteBalance();
            break;
        case "setFocusZone":
            // TODO block/warn if id==6
            e = await camera.setFocusZone(msg.id); // ignores id==6
            // TODO statusText update
            await refreshCameraUIStates();
            break;
        case "resetCamera":
            e = await camera.reloadCameraSettings();
            // TODO statusText update
            await refreshCameraUIStates();
            break;
        case "restartCamera":
            await doRebootCamera();
            await refreshCameraUIStates();
            break;
        case "wakeUpCamera":
            await doWakeupCamera();
            await refreshCameraUIStates();
            break;

        case "enableSetCameraPreset???":
            // TODO
            break;
        case "getCameraSettings":
            e = await camera.getCameraSettings();
            // reply only to the calling client
            ws.send(JSON.stringify({ type: "displayCameraSettings", text: e }))
            break;

        // messages from app.js for obs.js
        // -------------------------------
        case "callOBSScene":
            console.log(DEBUG_PREFIX, "PLACEHOLDER call OBS scene:", msg.sceneName);
            // TODO also to do the counterpart in obs.js
            break;            
        case "toggleParentsOverlay":
            console.log(DEBUG_PREFIX, "PLACEHOLDER toggleParent Overlay");
            // TODO update button status, if possible manage countdown here
            break;
        case "toggleCustomOverlay":
            console.log(DEBUG_PREFIX, "PLACEHOLDER toggle Custom Overlay");
            // TODO update button status, if possible manage countdown here
            break;
        case "configureOverlays":
            console.log(DEBUG_PREFIX, "PLACEHOLDER configure Overlay");
            // TODO remove this method, but give instructions on how to do on OBS
            // TODO instead obs.js to watch for overlay scene entry/exit and show/hide sources
            break;
        
        default:
            console.warn(DEBUG_PREFIX, "Unknown incoming message:", msg.type)
    }
}

// ----------------------------------------------------
// X32.js → server → browser
// ----------------------------------------------------

x32.on("stateChanged", state => {
    broadcastToBrowsers({ type: "x32StateChanged", state });
});

x32.on("loadSuccess", state => {
    broadcastToBrowsers({ type: "x32LoadSuccess", state });
});

x32.on("heartbeatsMissed", state => {
    broadcastToBrowsers({ type: "x32HeartbeatsMissed", state });
});

// ----------------------------------------------------
// obs.js → server → camera / browser
// ----------------------------------------------------

obs.on("obsConnectSuccess", state => {
    if (state) {
        doWakeupCamera();
    } else {
        broadcastStatusTextToBrowsers("Disconnected from OBS", 0);
    }
})

obs.on("setCameraTallyColor", state => {
    camera.setCameraTallyColor(state)
});

obs.on("updateOBSLiveStatus", (recordState, streamState) => {
    console.log(DEBUG_PREFIX, "PLACEHOLDER to show if OBS is live/recording", recordState, streamState);
    // TODO counterpart in app.js
});

obs.on("highlightCameraPreset", preset_id => {
    highlightCameraPreset(preset_id);
});

function highlightCameraPreset(preset_id) {
    // called from obs.on(...) or websocket
    activePreset = preset_id;
    broadcastToBrowsers({ type: "highlightCameraPreset", preset_id: preset_id});
}

// ----------------------------------------------------
// camera → server → browser
// ----------------------------------------------------

camera.on("updateClientTallyLightIndicator", color => {
    // this message is sent from camera.setCameraTallyColor()
    // because obs.js & server.js both can control Tally Light
    broadcastToBrowsers("updateClientTallyLightIndicator", color);
});

camera.on("updateClientFocusState", (mode, locked, zone) => {
    // TODO should this be called from camera.setFocusMode/setFocusZone
    // or from server.js (upon requesting change in Focus settings)
    broadcastToBrowsers({ type: "updateFocusState", focus_mode: mode, focus_locked: locked, focus_zone: zone}); // TODO the matching part in app.js
});

// ----------------------------------------------------
// camera helper functions
// ----------------------------------------------------

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function refreshCameraUIStates() {
    // dual purpose - to compile then send update to client UI, but also as a test if camera is responsive
    // TODO
    // read states
    // if successful, push to UI
    // if failure, return failure

    // this.callAPI(j_camera_get_output_info, GET_INFO);
}

async function doRebootCamera() {
    let msg = "Restarting camera takes a minute.";
    broadcastStatusTextToBrowsers(msg, 0); // 0 = leave this message on

    const e = await camera.rebootCamera();

    if (e) {
        broadcastStatusTextToBrowsers(`${msg}  Shutting down now...`, 0);
        await sleep(30000);         // PTZ startup 'dance' occurs at about 26 seconds
        broadcastStatusTextToBrowsers(`${msg}  Starting up...`, 0);
        await sleep(27000);         // total turnaround takes 62 seconds, countdown 5 seconds before
        msg = `${msg}  Nearly there<br>`;
        let i = 15;                 // but allow additional 10 seconds before giving up
        while (true) {
            msg = `${msg}.`;
            broadcastStatusTextToBrowsers(msg, 0);
            await sleep(1000);
            const cameraResponse = await refreshCameraUIStates();
            if (cameraResponse) {
                broadcastStatusTextToBrowsers("Camera on.  Please wait for image.");
                break;
            };
            i--;
            if (i <= 0) {
                broadcastStatusTextToBrowsers("Camera unresponsive.  Try restarting camera a different way.", 0);
                break;
            }
        }
    } else {
        broadcastStatusTextToBrowsers("Restart instruction failed.  Try restarting camera a different way.", 0);
    }
    return e;
};

async function doWakeupCamera() {
    broadcastStatusTextToBrowsers("Sending power_on instruction to camera.", 0);
    const e = await camera.wakeUpCamera();
    if (e) {
        broadcastStatusTextToBrowsers("Camera power_on OK.");
    } else {
        broadcastStatusTextToBrowsers("Camera unresponsive.  Try restarting it.", 0);
    };
    return e;    
};

// ----------------------------------------------------
// Start server
// ----------------------------------------------------

server.listen(LISTEN_PORT, () => {
    console.log(DEBUG_PREFIX, `Listening on http://localhost:${LISTEN_PORT}`);
});