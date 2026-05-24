const { sign } = require("node:crypto");
const EventEmitter = require("node:events");
const osc = require("osc");

const DEBUG_PREFIX = "module x32.js: ";
const POLL_CYCLES_THRESHOLD = 3;

const POLL_SIGNAL_TYPES = ["toggle", "fader"];

class X32 extends EventEmitter {

    constructor(config) {

        super();

        this.host = config.host;
        this.port = config.port;
        this.localPort = config.localPort;

        this.pollIntervalMs = config.pollIntervalMs || 10000;

        this.signals = config.signals || {};

        this.udp = null;
        this.pollTimer = null;
        this.pollCyclesCounter = 0;

        // Build lookup table for incoming OSC
        this.signalsByAddress = {};
        for (const [name, signal] of Object.entries(this.signals)) {
            if (POLL_SIGNAL_TYPES.includes(signal.type) && signal.address) {
                this.signalsByAddress[signal.address] = {
                    name,
                    type: signal.type,
                    invert: signal.invert
                };
            }
        }

        // Initialise states
        this.state = {};
        for (const [name, signal] of Object.keys(this.signals)) {
            if (POLL_SIGNAL_TYPES.includes(signal.type)) {
                this.state[name] = null;
            }
        }
    }

    // ====================================================
    // CONNECT
    // ====================================================

    connect() {

        this.udp = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: this.localPort,
            remoteAddress: this.host,
            remotePort: this.port
        });

        this.udp.on("ready", () => this.onReady());
        this.udp.on("message", msg => this.onMessage(msg));
        this.udp.on("error", err => console.error(DEBUG_PREFIX, "OSC error:", err));

        this.udp.open();
    }

    onReady() {

        console.log(DEBUG_PREFIX, `X32 UDP ready -> ${this.host}:${this.port}`);

        this.poll();

        this.pollTimer = setInterval(
            () => this.poll(),
            this.pollIntervalMs
        );
    }

    // ====================================================
    // POLLING
    // ====================================================

    poll() {

        this.send("/xremote");
        this.pollCyclesCounter++;

        // poll signals (toggles, faders)
        for (const signal of Object.values(this.signals)) {
            if (POLL_SIGNAL_TYPES.includes(signal.type) && signal.address) {
                this.send(signal.address);
            }
        }

        setTimeout(() => {

            if (this.pollCyclesCounter >= POLL_CYCLES_THRESHOLD) {
                // optional: emit disconnected state
            }

        }, 10); // 1 ms delay not consistently sufficient, let's use 10 ms
    }

    // ====================================================
    // OSC RECEIVE
    // ====================================================

    onMessage(message) {

        this.pollCyclesCounter = 0;

        console.log( DEBUG_PREFIX, "OSC RX:", message.address, message.args );

        const address = message.address;

        if (address === "/load") {
            this.handleLoadResponse(message.args);
            return;
        }

        const signal = this.signalsByAddress[address];
        if (!signal) return;    // ignore, if this is not in our list        

        let value = message.args?.[0];
        if (typeof value === "object" && value?.value !== undefined) { value = value.value; }

        switch (signal.type) {

            case "toggle":
                value = Boolean(value);
                if (signal.invert) value = !value;
                // no break, continue to fader

            case "fader":
                if (this.state[signal.name] !== value) {
                    this.state[signal.name] = value;
                    this.emit("stateChanged", this.getState());
                }
                break;

            default:
                console.warn(DEBUG_PREFIX,`Unrecognised signal type "${signal.type}"`);
        }
    }

    // ====================================================
    // ACTION EXECUTION
    // ====================================================

    executeAction(signalId) {

        const signal = this.signals[signalId];

        if (!signal) {
            console.warn(DEBUG_PREFIX, "Unknown signal:", signalId);
            return;
        }

        switch (signal.type) {

            case "snippet":
                this.send("/load", [ "snippet", { type: "i", value: signal.snippet } ]);
                break;

            case "toggle":
                const current = this.state[signalId];

                if (current === null) {
                    console.warn(DEBUG_PREFIX, "Unknown state:", signalId);
                    return;
                }

                const next = !current;
                const payload = signal.invert ? Number(current) : Number(next);

                this.send(signal.address, [ { type: "i", value: payload } ]);

                // X32 does not seem to echo back the Fader and Mute commands or Mute Group.
                // Neither does the X32 Emulator (even though its log screen implies it does)
                setTimeout(() => { this.send(signal.address); }, 0);

                break;

            case "fader":
                // no intention for this to be an action
                console.warn(DEBUG_PREFIX, "signal.type 'fader' is not intended as an action");
        }
    }

    // ====================================================
    // LOAD RESPONSE
    // ====================================================

    handleLoadResponse(args) {

        let type = args?.[0];
        let result = args?.[1];

        if (typeof type === "object") type = type.value;
        if (typeof result === "object") result = result.value;

        this.emit("loadResponse", {
            type,
            success: Boolean(result)
        });
    }

    // ====================================================
    // SEND
    // ====================================================

    send(address, args = []) {
        if (!this.udp) return;
        this.udp.send({ address, args });
    }

    // ====================================================
    // STATE
    // ====================================================

    getState() {
        return structuredClone(this.state);
    }

    // ====================================================
    // Cleanup
    // ====================================================

    disconnect() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.udp) this.udp.close();
    }
}

module.exports = X32;