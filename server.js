const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const config = require("./config/config");
const actions = require("./lib/actions");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

app.get("/api/config", (req, res) => {

    res.json({
        buttons: config.buttons
    });

});

wss.on("connection", (ws) => {

    console.log("Client connected");

    ws.on("message", async (message) => {

        const data = JSON.parse(message);

        if (data.type === "action") {

            const button = config.buttons.find(
                b => b.id === data.buttonId
            );

            if (!button) {
                return;
            }

            await actions.execute(button);

            ws.send(JSON.stringify({
                type: "actionComplete",
                buttonId: button.id
            }));
        }
    });

});

server.listen(3000, () => {

    console.log(
        "Listening on http://localhost:3000"
    );

});