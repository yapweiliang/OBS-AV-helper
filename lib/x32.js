const EventEmitter = require("node:events");
const osc = require("osc");

class X32 extends EventEmitter {

    constructor(config) {

        super();

        this.host = config.host;
        this.port = config.port;
        this.localPort = config.localPort;

        // timing
        this.lastPacketTime = 0;
        this.connectionCheckTimer = null;
        this.xremoteTimer = null;

        // state (always derived from real OSC feedback)
        this.state = {
            connected: false,
            muteSpeech: null,
            muteBand: null
        };

        this.udp = null;
    }

    // ------------------------------------------------------------
    // CONNECT / START
    // ------------------------------------------------------------

    connect() {

        this.udp = new osc.UDPPort({

            localAddress: "0.0.0.0",
            localPort: this.localPort,

            remoteAddress: this.host,
            remotePort: this.port
        });

        this.udp.on("ready", () => {

            console.log(
                `X32 UDP ready -> ${this.host}:${this.port}`
            );

            this.startHeartbeat();
            this.startConnectionMonitor();

            // initial "poke"
            this.sendXremote();
            this.queryInitialState();
        });

        this.udp.on("message", (msg) => {
            this.onMessage(msg);
        });

        this.udp.on("error", (err) => {
            console.error("X32 OSC error:", err);
        });

        this.udp.open();
    }

    // ------------------------------------------------------------
    // HEARTBEAT (/xremote)
    // ------------------------------------------------------------

    startHeartbeat() {

        if (this.xremoteTimer) return;

        this.xremoteTimer = setInterval(() => {
            this.sendXremote();
        }, 9000);
    }

    sendXremote() {

        this.send("/xremote");
    }

    // ------------------------------------------------------------
    // CONNECTION MONITOR
    // ------------------------------------------------------------

    startConnectionMonitor() {

        if (this.connectionCheckTimer) return;

        this.connectionCheckTimer = setInterval(() => {

            const alive =
                Date.now() - this.lastPacketTime < 15000;

            this.setConnectionState(alive);

        }, 1000);
    }

    setConnectionState(isConnected) {

        if (this.state.connected === isConnected) {
            return;
        }

        this.state.connected = isConnected;

        console.log(
            isConnected
                ? "X32 CONNECTED"
                : "X32 DISCONNECTED"
        );

        this.emit(
            isConnected ? "connected" : "disconnected"
        );

        this.emit("stateChanged", this.getState());

        // IMPORTANT:
        // when reconnecting, re-sync state
        if (isConnected) {
            this.queryInitialState();
        }
    }

    // ------------------------------------------------------------
    // OSC SEND
    // ------------------------------------------------------------

    send(address, args = []) {

        if (!this.udp) return;

        this.udp.send({
            address,
            args
        });
    }

    // ------------------------------------------------------------
    // INITIAL SYNC
    // ------------------------------------------------------------

    queryInitialState() {

        // safe to call repeatedly
        this.send("/dca/5/on");
        this.send("/config/mute/6");
    }

    // ------------------------------------------------------------
    // RECEIVE OSC
    // ------------------------------------------------------------

    onMessage(message) {

        this.lastPacketTime = Date.now();

        // first packet = "we are alive"
        if (!this.state.connected) {
            this.setConnectionState(true);
        }

        // DEBUG (keep for now)
        console.log(
            "OSC RX:",
            message.address,
            message.args
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

    // ------------------------------------------------------------
    // STATE MANAGEMENT
    // ------------------------------------------------------------

    updateState(key, value) {

        if (this.state[key] === value) return;

        this.state[key] = value;

        this.emit("stateChanged", this.getState());
    }

    getState() {

        return structuredClone(this.state);
    }

    // ------------------------------------------------------------
    // PUBLIC ACTIONS (used later by UI)
    // ------------------------------------------------------------

    toggleSpeechMute() {

        if (this.state.muteSpeech === null) return;

        this.send(
            "/dca/5/on",
            [Number(!this.state.muteSpeech)]
        );
    }

    toggleBandMute() {

        if (this.state.muteBand === null) return;

        this.send(
            "/config/mute/6",
            [Number(!this.state.muteBand)]
        );
    }

    // ------------------------------------------------------------
    // CLEANUP (future use)
    // ------------------------------------------------------------

    disconnect() {

        if (this.xremoteTimer) {
            clearInterval(this.xremoteTimer);
        }

        if (this.connectionCheckTimer) {
            clearInterval(this.connectionCheckTimer);
        }

        if (this.udp) {
            this.udp.close();
        }
    }
}

module.exports = X32;