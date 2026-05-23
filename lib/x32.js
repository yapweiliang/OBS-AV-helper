const EventEmitter = require("node:events");
const osc = require("osc");

class X32 extends EventEmitter {

    constructor(config) {

        super();

        this.host = config.host;
        this.port = config.port;
        this.localPort = config.localPort;

        this.lastPacketTime = 0;

        this.state = {
            connected: false,
            muteSpeech: null,
            muteBand: null
        };
    }

    connect() {

        this.udpPort = new osc.UDPPort({

            localAddress: "0.0.0.0",
            localPort: this.localPort,

            remoteAddress: this.host,
            remotePort: this.port

        });

        this.udpPort.on("ready", () => {

            console.log(
                `X32 UDP ready (${this.host}:${this.port})`
            );

            this.sendXremote();
            this.queryInitialState();

            this.heartbeatTimer = setInterval(
                () => this.sendXremote(),
                9000
            );

            this.connectionTimer = setInterval(
                () => this.checkConnection(),
                1000
            );
        });

        this.udpPort.on(
            "message",
            msg => this.onMessage(msg)
        );

        this.udpPort.on(
            "error",
            err => console.error("X32 OSC error:", err)
        );

        this.udpPort.open();
    }

    send(address, args = []) {

        this.udpPort.send({
            address,
            args
        });
    }

    sendXremote() {

        this.send("/xremote");
    }

    queryInitialState() {

        this.send("/dca/5/on");
        this.send("/config/mute/6");
    }

    onMessage(message) {

        this.lastPacketTime = Date.now();

        this.updateConnection(true);

        console.log(
            "OSC RX:",
            message.address,
            message.args
        );
        console.log(
            JSON.stringify(message, null, 2)
        );

        switch (message.address) {

            case "/dca/5/on":

                this.updateState(
                    "muteSpeech",
                    Boolean(message.args[0])
                );

                break;

            case "/config/mute/6":

                this.updateState(
                    "muteBand",
                    Boolean(message.args[0])
                );

                break;
        }
    }

    updateState(key, value) {

        if (this.state[key] === value) {
            return;
        }

        this.state[key] = value;

        this.emit(
            "stateChanged",
            this.getState()
        );
    }

    checkConnection() {

        const connected =
            Date.now() - this.lastPacketTime < 15000;

        this.updateConnection(connected);
    }

    updateConnection(connected) {

        if (
            this.state.connected === connected
        ) {
            return;
        }

        this.state.connected = connected;

        console.log(
            connected
                ? "X32 connected"
                : "X32 disconnected"
        );

        this.emit(
            connected
                ? "connected"
                : "disconnected"
        );

        this.emit(
            "stateChanged",
            this.getState()
        );
    }

    getState() {

        return structuredClone(
            this.state
        );
    }

    toggleSpeechMute() {

        if (this.state.muteSpeech === null) {
            return;
        }

        this.send(
            "/dca/5/on",
            [Number(!this.state.muteSpeech)]
        );
    }

    toggleBandMute() {

        if (this.state.muteBand === null) {
            return;
        }

        this.send(
            "/config/mute/6",
            [Number(!this.state.muteBand)]
        );
    }
}

module.exports = X32;