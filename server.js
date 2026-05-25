const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const config = require("./config/config");
const X32 = require("./lib/x32");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DEBUG_PREFIX = "node server.js: ";
const LISTEN_PORT = 3000;

let x32StateMayBeStale = null;
const DECLARE_X32_STALE_THRESHOLD = 3; // after how many poll cycles (each = 10s) to declare

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// X32
// ----------------------------------------------------

const x32 = new X32(config.x32);
x32.connect();

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
    if (state > DECLARE_X32_STALE_THRESHOLD) {
        broadcastToBrowsers({ type: "x32StateChanged", state: {} });
        x32StateMayBeStale = true;
    }
    if (state === 0 && x32StateMayBeStale) {
        x32StateMayBeStale = false;
        broadcastToBrowsers({ type: "x32StateChanged", state: x32.getState() });
    }
});


// ----------------------------------------------------
// Start server
// ----------------------------------------------------

server.listen(LISTEN_PORT, () => {
    console.log(DEBUG_PREFIX, `Listening on http://localhost:${LISTEN_PORT}`);
});