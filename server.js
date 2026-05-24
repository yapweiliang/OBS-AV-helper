const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const config = require("./config/config");
const X32 = require("./lib/x32");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

app.use(express.json());

// IMPORTANT: serve frontend correctly
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

    res.json({
        buttons: config.buttons
    });
});

// ----------------------------------------------------
// API: actions (core of system)
// ----------------------------------------------------

app.post("/action/:name", (req, res) => {

    const actionName =
        req.params.name;

    console.log(
        "ACTION:",
        actionName
    );

    try {

        x32.executeAction(actionName);

        res.json({
            ok: true,
            action: actionName
        });

    } catch (err) {

        console.error(
            "Action error:",
            err
        );

        res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});

// ----------------------------------------------------
// WebSocket: push state to browser
// ----------------------------------------------------

function broadcast(obj) {

    const msg =
        JSON.stringify(obj);

    wss.clients.forEach(client => {

        if (
            client.readyState === WebSocket.OPEN
        ) {
            client.send(msg);
        }
    });
}

// ----------------------------------------------------
// WebSocket connection
// ----------------------------------------------------

wss.on("connection", ws => {

    console.log("Browser connected");

    ws.send(JSON.stringify({
        type: "state",
        state: x32.getState()
    }));
});

// ----------------------------------------------------
// X32 → browser state updates
// ----------------------------------------------------

x32.on("stateChanged", state => {

    broadcast({
        type: "state",
        state
    });
});

// Optional later:
// x32.on("loadResponse", ...)

// ----------------------------------------------------
// Start server
// ----------------------------------------------------

server.listen(3000, () => {

    console.log(
        "Listening on http://localhost:3000"
    );
});