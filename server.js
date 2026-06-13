/*
    OUTLINE

    - modules/libraries
    - constants
    - object initiation
    - helpers for authentication
    - middleware stuff
        - root, public
        - protected
            - get /api/config
            - post /x32/action/:name
    - websocket authentication and connection
    - websocket push to browsers (helpers)
    - websocket INCOMING from app.js

    - set up X32/OBS/Camera (Emitter)    
    - X32 (Emitter)     - INCOMING
    - OBS (Emitter)     - INCOMING
    - obs helper functions (overlay)
    - CAMERA (Emitter)  - INCOMING
    - camera helper functions

    - shutdown support
    - START SERVER
*/

// modules
require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const crypto = require("crypto");               // for Daily Code authentication
const session = require("express-session");     // for Daily Code authentication

// more modules
const CONFIG = require("./config/config");
const X32 = require("./lib/x32");
const OBS = require("./lib/obs.js");
const CAMERA = require("./lib/camera.js");

// constants
const DEBUG_PREFIX = "[server.js]";
const LISTEN_PORT = 3000;

// constants - for Daily Code authentication
// const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ2346789";
const CODE_ALPHABET = "23456789"; // simplify to numeric (see also login.html)
const CODE_LENGTH = 4; // also update limit on login.html
const AUTH_SECRET =  process.env.AUTH_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

// object initiation
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true }); // require Daily Code first.  ( Server({ server }) automatically allows websocket upgrade)

// ----------------------------------------------------
// HELPERS for authentication
// ----------------------------------------------------

function isLocal(req) {
    const ip = (req.socket?.remoteAddress || "").replace("::ffff:", "");
    return ( ip === "::1" || ip === "127.0.0.1" );
}

function getDailyCode() {

    // set 2am as the threshold for the day
    const thisDay = new Date();
    if (thisDay.getHours() < 2) { thisDay.setDate(thisDay.getDate() - 1); }
    const dateString = thisDay.toISOString().slice(0, 10);

    const hash = crypto.createHash("sha256").update(AUTH_SECRET + dateString).digest();

    // convert first bytes into readable chars
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        const index = hash[i] % CODE_ALPHABET.length;
        code += CODE_ALPHABET[index];
    }
    return code;
}

function requireAuth(req, res, next) {
    if (isLocal(req)) {
        return next();
    }
    if (req.session?.authenticated) {
        return next();
    }
    return res.status(401).sendFile(LOGIN_PAGE);
}

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

const LOGIN_PAGE = path.join(__dirname, "frontend", "login", "login.html");
const INDEX_PAGE = path.join(__dirname, "frontend", "app", "index.html");

// global middleware
const sessionParser = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
});
app.use(sessionParser)
app.use(express.json());

// root redirect
app.get("/", requireAuth, (req, res) => { res.sendFile(INDEX_PAGE); });

// public resources
app.use( "/assets", express.static(path.join(__dirname, "frontend/assets")) );
app.use( "/login",  express.static(path.join(__dirname, "frontend/login")) );
app.use( "/help",   express.static(path.join(__dirname, "frontend/help")) );

// public API (login/logout)
app.get("/login", (req, res) => { res.sendFile(LOGIN_PAGE); });
app.post("/login", (req, res) => {
    const submittedCode = (req.body.code || "").toUpperCase().trim();
    if (submittedCode !== getDailyCode()) {
        console.log(DEBUG_PREFIX, `Invalid code submitted from ip: "${req.ip}" for host: "${req.host}"`);
        return res.status(403).json({ success: false });
    }
    req.session.authenticated = true;
    console.log(DEBUG_PREFIX, `Client (ip: "${req.ip}") authenticated, for host "${req.host}"`);
    res.json({ success: true });
});

// for testing purposes, as there is no real need to logout
app.get("/logout",  (req, res) => { req.session.destroy(() => { res.sendFile(LOGIN_PAGE); }); });
app.post("/logout", (req, res) => { req.session.destroy(() => { res.sendFile(LOGIN_PAGE); }); });

// local retrieval of daily code
app.get("/daily-code", (req, res) => {
    if (!isLocal(req)) { 
        return res.status(403).end(); // 403 = forbidden
    }
    res.json({ code: getDailyCode() });
});

// Protected resources
// -------------------
app.use("/app", requireAuth, express.static(path.join(__dirname, "frontend/app")));

app.get("/api/config", requireAuth, (req, res) => {
    // return only the portion below for the client app.js
    res.json({ 
        ui: CONFIG.ui
     }) 
    // { ui: CONFIG.ui } will keep same structure as res.json(CONFIG) without exposing the rest
    // { CONFIG.ui } will need some rewriting in app.js, but will be cleaner there
});

app.get("/camera/getSettings", requireAuth, async (req, res) => {
    const e = await camera.getCameraSettings();
    if (e) {
        res.json({text: JSON.stringify(e)})
    } else {
        res.json({text: "unable to obtain settings from camera"})
    }
});

app.post("/x32/action/:name", requireAuth, processX32Post);

function processX32Post(req, res, next) {
    // POST received from public/app.js for X32

    const signalId = req.params.name;
    console.log( DEBUG_PREFIX, "X32 ACTION:", signalId );

    if (CONFIG.x32.signals[signalId].type == "snippet") {
        const btnId = CONFIG.ui.buttons.find(p => p.signalId === signalId)?.id;
        broadcastToAllClients({ type: "dimX32SnippetButton", btnId: btnId });
    }

    try {
        x32.executeAction(signalId);
        res.json({ ok: true, action: signalId });

    } catch (err) {
        console.error( DEBUG_PREFIX, "Action error:", err );
        res.status(500).json({ ok: false, error: err.message });
    }
};

// final 404 handling
// ------------------
app.use((req, res) => res.status(404).send("Not found"));

// ====================================================
// WebSocket: authentication and connection
// ====================================================

server.on("upgrade", (req, socket, head) => {
    sessionParser(req, {}, () => {
        if (!isLocal(req) && !req.session?.authenticated) {
            console.log(DEBUG_PREFIX, `Rejected websocket (remoteAddress: ${req.socket.remoteAddress})`);
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, ws => {
            wss.emit("connection", ws, req);
        });
    });
});

wss.on("connection", (ws, req) => onConnection(ws, req));

async function onConnection(ws, req) {
    console.log(DEBUG_PREFIX, "Browser connected");
    // send X32 state
    ws.send(JSON.stringify({ type: "x32StateChanged", state: x32.getState() })); // refresh state
    ws.send(JSON.stringify({ type: "x32HeartbeatsMissed", state: x32.getPollCyclesCounter() }));

    // send camera state
    ws.send(JSON.stringify({ type: "updateClientTallyLightIndicator", color: await camera.getCameraTallyColor() }));
    ws.send(JSON.stringify({ type: "highlightCameraPreset", preset_id: activePreset }));
    // TODO send also other focus states

    // send obs state
    ws.send(JSON.stringify({ type: "updateOBSConnectionStatus", state: obs.obsConnectSuccess }));
    ws.send(JSON.stringify({ type: "updateOBSLiveStatus", recordState: obs.b_recordState, streamState: obs.b_streamState }));
    if (obs.obsConnectSuccess) {        
        ws.send(JSON.stringify({ type: "highlightOBSScene", sceneName: await obs.getCurrentProgramScene()  }));
    }
    resetOverlayButtons();

    // declare message handler
    ws.on("message", data => wsMessageHandler(data, ws));
}

// ----------------------------------------------------
// WebSocket: OUTGOING push to client browsers
// ----------------------------------------------------

function broadcastToAllClients(obj) {
    const msg = JSON.stringify(obj);
    wss.clients.forEach(client => {
        if ( client.readyState === WebSocket.OPEN ) { client.send(msg); }
    });
}

function broadcastStatusTextToAllClients(text, durationMs) {
    broadcastToAllClients({ type: "flashStatusText", text: text, durationMs: durationMs });
}

function broadcastStatusTextToClient(ws, text, durationMs) {
    ws.send(JSON.stringify({ type: "flashStatusText", text: text, durationMs: durationMs }));
}

// ----------------------------------------------------
// WebSocket: INCOMING messaging from app.js
// ----------------------------------------------------

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
        // nothing here, unless we want client-to-client messaging?


        // messages from app.js for camera.js
        // ----------------------------------
        case "callCameraPreset":
            e = await camera.callPreset(msg.preset_id);
            highlightCameraPreset(camera.lastSelectedPreset); // development environment in camera.js will ignore failure
            // TODO statusText update
            break;
        case "setCameraPreset":
            e = await camera.setPreset(msg.preset_id, msg.preset_name);
            highlightCameraPreset(camera.lastSelectedPreset); // development environment in camera.js will ignore failure
            // TODO statusText update
            break;
        case "toggleAutoFocus":
            e = await camera.toggleAutoFocus();
            if (e!=null) {
                const res = await refreshCameraFocusMode(); // reads then pushes to client
            }
            // TODO statusText update
            break;
        case "onePushFocus":
            e = await camera.onePushFocus();
            if (e!=null) {
                const res = refreshCameraFocusMode(); // reads then pushes to client
            }
            // TODO statusText update
            break;
        case "onePushWhiteBalance":
            e = await camera.onePushWhiteBalance();
            // TODO statusText update
            break;
        case "setFocusZone":
            if (msg.id == 6) {
                broadcastStatusTextToClient(ws, "point zone should not be used.  Ignoring.")
                ws.send(JSON.stringify({
                    type: "updateClientFocusState"
                })) // no additional data implies no changes, but force revert to existing value
            } else {
                e = await camera.setFocusZone(msg.id); // returns focusZoneId or null; does not block id=6
                refreshCameraFocusZone(e);
                // broadcastToBrowsers({ type: "updateClientFocusState", focus_zone: e });
                // TODO statusText update, e==null = failure
            }
            break;
        case "resetCamera":
            // TODO can we disable camera buttons temporarily?
            highlightCameraPreset(-1);
            e = await camera.reloadCameraSettings();
            // TODO statusText update
            await refreshCameraAllStates();
            break;
        case "restartCamera":
            // TODO can we disable camera buttons temporarily?
            highlightCameraPreset(-1);
            await doRebootCamera();
            await refreshCameraAllStates();
            break;
        case "wakeUpCamera":
            // TODO can we disable camera buttons temporarily?
            await doWakeupCamera();
            await refreshCameraAllStates();
            break;

        // messages from app.js for obs.js
        // -------------------------------
        case "callOBSScene":
            obs.setCurrentProgramScene(msg.sceneName);
            break;            
        case "toggleParentsOverlay":
            if (await obs.getCurrentProgramScene() != CONFIG.obs.OVERLAY_SCENENAME) {
                toggleParentsOverlay();
            } 
            break;
        case "toggleCustomOverlay":
            if (await obs.getCurrentProgramScene() != CONFIG.obs.OVERLAY_SCENENAME) {
                toggleCustomOverlay(ws);
            }
            break;
        case "doCustomOverlay":
            doCustomOverlay(msg.newText);
            break;
        case "toggleStreamStartStop":
            console.log(DEBUG_PREFIX, "PLACEHOLDER toggle stream startstop");
            // TODO update button status
            break;
        
        default:
            console.warn(DEBUG_PREFIX, "Unknown incoming message:", msg.type)
    }
}

// ====================================================
// X32 and OBS and CAMERA
// ====================================================

const x32 = new X32(CONFIG.x32);
x32.connect();

const obs = new OBS(CONFIG.obs);
obs.connect();

const camera = new CAMERA(CONFIG.camera);
let activePreset = -1;

// ----------------------------------------------------
// X32.js → server → browser
// ----------------------------------------------------

x32.on("stateChanged", state => {
    broadcastToAllClients({ type: "x32StateChanged", state });
});

x32.on("snippetLoadSuccess", state => {
    broadcastToAllClients({ type: "x32SnippetLoadSuccess", state });
});

x32.on("heartbeatsMissed", state => {
    broadcastToAllClients({ type: "x32HeartbeatsMissed", state });
});

// ----------------------------------------------------
// obs.js → server → camera / browser
// ----------------------------------------------------

obs.on("obsConnectSuccess", async state =>  {
    if (state) {
        broadcastToAllClients({ type: "updateOBSConnectionStatus", state: obs.obsConnectSuccess });
        broadcastToAllClients({ type: "highlightOBSScene", sceneName: await obs.getCurrentProgramScene() });
        doWakeupCamera();
        // TODO validate scenes/sources - check that these actually exist and enable/disable?
    } else {
        broadcastToAllClients({ type: "updateOBSConnectionStatus", state: obs.obsConnectSuccess });
        broadcastToAllClients({ type: "highlightOBSScene", sceneName: "" });
        broadcastStatusTextToAllClients("Disconnected from OBS", 0);
        resetOverlayButtons();
    }
})

obs.on("setCameraTallyColor", state => {
    camera.setCameraTallyColor(state) // this will also broadcast to clients
});

obs.on("updateOBSLiveStatus", (recordState, streamState) => {
    broadcastToAllClients({ type: "updateOBSLiveStatus", recordState: recordState, streamState: streamState});
});

obs.on("highlightCameraPreset", preset_id => {
    highlightCameraPreset(preset_id);
});

obs.on("highlightOBSScene", sceneName => {
    broadcastToAllClients({ type: "highlightOBSScene", sceneName: sceneName});
});

obs.on("overlaySceneSelected", () => {
    resetOverlayButtons();
});

obs.on("exitStarted", async () => {
    await camera.setCameraTallyColor('blue');
    const e = await camera.shutdownCamera();
    console.log(DEBUG_PREFIX, `Camera shutdown when OBS exitStarted ${(e) ? "OK" : "failed"}`);
    // server shutdown will try camera.shutdownCamera again
});

function highlightCameraPreset(preset_id) {
    activePreset = preset_id;
    broadcastToAllClients({ type: "highlightCameraPreset", preset_id: activePreset});
};

// ....................................................
// OBS helper functions
// ....................................................

const OBS_OVERLAYS = {
    [CONFIG.obs.PARENTS_OVERLAY_SOURCENAME]: {
        buttonId: CONFIG.ui.overlays.parents.btnId,
        buttonBaseText: CONFIG.ui.overlays.parents.label,
        durationMs: CONFIG.ui.DEFAULT_OVERLAY_TIMEOUT_SECONDS * 1000,
        timer: null,
        countdownInterval: null,
        expiresAt: 0
    },
    [CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME]: {
        buttonId: CONFIG.ui.overlays.custom.btnId,
        buttonBaseText: CONFIG.ui.overlays.custom.label,
        durationMs: CONFIG.ui.DEFAULT_OVERLAY_TIMEOUT_SECONDS * 1000,
        timer: null,
        countdownInterval: null,
        expiresAt: 0
    }
}

function toggleParentsOverlay() {
    // called by message from app.js
    toggleOverlay(CONFIG.obs.PARENTS_OVERLAY_SOURCENAME);
};

async function toggleCustomOverlay(ws) {
    // called by message from app.js
    const overlay = OBS_OVERLAYS[CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME];
    const currentlyActive = overlay.expiresAt > Date.now();

    if (currentlyActive) {
        toggleOverlay(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME, true); // this also resets the button
    } else {
        const oldText = await obs.getTextSourceText(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME);
        ws.send(JSON.stringify({ type: "getCustomOverlayText", oldText: oldText }));
        // listen elsewhere for response, which then calls doCustomOverlay()
    }
};

async function doCustomOverlay(newText) {
    // called by message from app.js when new text entered on inputtext dialog
    await obs.setTextSourceText(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME, newText);
    toggleOverlay(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME);
}

async function toggleOverlay( sourceName, reset = false ) {
    const overlay = OBS_OVERLAYS[sourceName];
    const currentlyActive = overlay.expiresAt > Date.now();

    async function resetOverlayButton() {
        overlay.timer = null;
        overlay.countdownInterval = null;
        overlay.expiresAt = 0;

        updateOverlayButtonClass(sourceName);
        updateOverlayButtonText(sourceName);

        await obs.setSourceVisible(sourceName, false);  // Toggle OFF
    }

    if (currentlyActive || reset) {
        clearTimeout(overlay.timer);
        clearInterval(overlay.countdownInterval);
        resetOverlayButton();
        return;
    }

    await obs.unhideOverlaySceneSource();
    await obs.setSourceVisible(sourceName, true);             // Toggle ON

    overlay.expiresAt = Date.now() + overlay.durationMs;

    updateOverlayButtonClass(sourceName);
    updateOverlayButtonText(sourceName);

    // Countdown updater
    overlay.countdownInterval = setInterval(() => { updateOverlayButtonText(sourceName); }, 1000);

    // Remove countdown when expired
    overlay.timer = setTimeout(async () => {
        clearInterval(overlay.countdownInterval);
        resetOverlayButton();
    }, overlay.durationMs);
}

function refreshOverlayButtons() {
    updateOverlayButtonClass(CONFIG.obs.PARENTS_OVERLAY_SOURCENAME);
    updateOverlayButtonClass(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME);
    // if expanding, then forEach sourcename in config.ui.overlays ... 
}

function resetOverlayButtons() {
    // to be called if OBS overlay scene is selected, 
    // or when obs disconnected
    // or when app.js connects
    toggleOverlay(CONFIG.obs.PARENTS_OVERLAY_SOURCENAME, true);
    toggleOverlay(CONFIG.obs.CUSTOM_OVERLAY_SOURCENAME, true);
}

function updateOverlayButtonClass(sourceName) {
    const overlay = OBS_OVERLAYS[sourceName];
    const remainingMs = overlay.expiresAt - Date.now();
    if (remainingMs <= 0) {
        broadcastToAllClients({ type: "updateOverlayButtonClass", btnId: overlay.buttonId, state: false });
    } else {
        broadcastToAllClients({ type: "updateOverlayButtonClass", btnId: overlay.buttonId, state: true });
    }
}

function updateOverlayButtonText(sourceName) {
    const overlay = OBS_OVERLAYS[sourceName];
    const remainingMs = overlay.expiresAt - Date.now();

    if (remainingMs <= 0) {
        broadcastToAllClients({ type: "updateOverlayButtonText", btnId: overlay.buttonId, 
            text: overlay.buttonBaseText });
        return;
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    broadcastToAllClients({ type: "updateOverlayButtonText", btnId: overlay.buttonId, 
        text: `${overlay.buttonBaseText.split(" ")[0]}... (${timeString})` });
}

// ----------------------------------------------------
// camera → server → browser
// ----------------------------------------------------

camera.on("updateClientTallyLightIndicator", color => {
    // this message is sent from camera.setCameraTallyColor()
    // because obs.js & server.js both can control Tally Light

    // optionally intercept color=="black" and change it (for failed camera API call)
    broadcastToAllClients({ type: "updateClientTallyLightIndicator", color: color});
});

camera.on("updateClientFocusState", (mode, locked, zone) => {
    // TODO should this be called from camera.setFocusMode/setFocusZone
    // or from server.js (upon requesting change in Focus settings)
    broadcastToAllClients({ type: "updateClientFocusState", focus_mode: mode, focus_locked: locked, focus_zone: zone});
});

// ....................................................
// camera helper functions
// ....................................................

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function refreshCameraFocusZone(res) {
    res ??= await camera.getFocusZone()
    broadcastToAllClients({ type: "updateClientFocusState", focus_zone: res });
    return res;
}

async function refreshCameraFocusMode() {
    const res = await camera.summariseFocusMode(); // expect { mode: null, locked: null } if failure
    broadcastToAllClients({ type: "updateClientFocusState", focus_mode: res.mode, focus_locked: res.locked });
    return res;
}

async function refreshCameraTallyColor() {
    const res = await camera.getCameraTallyColor();
    broadcastToAllClients({ type: "updateClientTallyLightIndicator", color: res});
    return res;
}

async function refreshCameraAllStates() {
    await refreshCameraFocusZone();
    await refreshCameraFocusMode();
    await refreshCameraTallyColor();
    // TODO how to return failure?
    // TODO shall we do away with this, and call individually?
    // TODO how to use as a test for camera responsiveness?
    
    // this.callAPI(j_camera_get_output_info, GET_INFO);
}

async function doRebootCamera() {
    let msg = "Restarting camera takes a minute.";
    broadcastStatusTextToAllClients(msg, 0); // 0 = leave this message on

    const e = await camera.rebootCamera();

    if (e) {
        broadcastStatusTextToAllClients(`${msg}  Shutting down now...`, 0);
        await sleep(30000);         // PTZ startup 'dance' occurs at about 26 seconds
        broadcastStatusTextToAllClients(`${msg}  Starting up...`, 0);
        await sleep(27000);         // total turnaround takes 62 seconds, countdown 5 seconds before
        msg = `${msg}  Nearly there<br>`;
        let i = 15;                 // but allow additional 10 seconds before giving up
        while (true) {
            msg = `${msg}.`;
            broadcastStatusTextToAllClients(msg, 0);
            await sleep(1000);
            const cameraResponse = await refreshCameraAllStates(); // TODO use different function to test
            if (cameraResponse) {
                broadcastStatusTextToAllClients("Camera on.  Please wait for image.");
                break;
            };
            i--;
            if (i <= 0) {
                broadcastStatusTextToAllClients("Camera unresponsive.  Try restarting camera a different way.", 0);
                break;
            }
        }
    } else {
        broadcastStatusTextToAllClients("Restart instruction failed.  Try restarting camera a different way.", 0);
    }
    return e;
};

async function doWakeupCamera() {
    broadcastStatusTextToAllClients("Sending power_on instruction to camera.", 0);
    const e = await camera.wakeUpCamera();
    if (e) {
        broadcastStatusTextToAllClients("Camera power_on OK.");
    } else {
        broadcastStatusTextToAllClients("Camera unresponsive.  Try restarting it.", 0);
    };
    return e;    
};

// ====================================================
// Shutdown
// ====================================================

let shuttingDown = false;
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown(signal) {
    let e;
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(DEBUG_PREFIX, `${signal} received. ------------------------------\n`);

    // stuff we want to do on [windows] shutdown
    e = await camera.shutdownCamera();
    console.log(DEBUG_PREFIX, `Camera shutdown ${(e) ? "OK" : "failed"}`);
    resetOverlayButtons();

    // other cleanup
    obs.disconnect();
    x32.disconnect();
    wss.clients.forEach(client => client.close());
    wss.close();
    server.close();

    await sleep(50);
    console.log(DEBUG_PREFIX, "Remaining processes by end of shutdown:", process._getActiveHandles().map(h => h.constructor.name));
    // process.exit(0); // apparently not needed
}

// ====================================================
// Start server
// ====================================================

server.listen(LISTEN_PORT, () => {
    console.log(DEBUG_PREFIX, `Listening on http://localhost:${LISTEN_PORT}`);
    console.log(DEBUG_PREFIX, `Today's access code: ${getDailyCode()}`);
});