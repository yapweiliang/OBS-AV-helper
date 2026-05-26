const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const config = require("./config/config");
const X32 = require("./lib/x32");
const OBS = require("./lib/obs.js");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEBUG_PREFIX = "node server.js: ";
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

// ----------------------------------------------------
// API: config
// ----------------------------------------------------

app.get("/api/config", (req, res) => {

    //res.json(config); // also exposes x32
    res.json({ ui: config.ui }) // will keep same structure
    // res.json({ config.ui }) will need some rewriting in server.js
});

// ----------------------------------------------------
// API: actions (core of system)
// ----------------------------------------------------

app.post("/x32/action/:name", (req, res) => {
    // POST received from public/app.js

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

// ----------------------------------------------------
// WebSocket connection
// ----------------------------------------------------

wss.on("connection", ws => {
    console.log(DEBUG_PREFIX, "Browser connected");
    ws.send(JSON.stringify({ type: "x32StateChanged", state: x32.getState() })); // refresh state
    ws.send(JSON.stringify({ type: "x32HeartbeatsMissed", state: x32.getPollCyclesCounter() }));
});

// ----------------------------------------------------
// X32 → browser state updates
// ----------------------------------------------------

x32.on("stateChanged", state => {
    broadcastToBrowsers({ type: "x32StateChanged", state });
});

x32.on("loadSuccess", state => {
    broadcastToBrowsers({ type: "x32LoadSuccess", state });
});

x32.on("heartbeatsMissed", state => {
    broadcastToBrowsers({ type: "x32HeartbeatsMissed", state });
    // stale state logic should be in x32.js not here
});

// ----------------------------------------------------
// obs → browser state updates
// ----------------------------------------------------

// setCameraTallyColor
// highlightCameraPreset
// flashStatusText

// ----------------------------------------------------
// Start server
// ----------------------------------------------------

server.listen(LISTEN_PORT, () => {
    console.log(DEBUG_PREFIX, `Listening on http://localhost:${LISTEN_PORT}`);
});