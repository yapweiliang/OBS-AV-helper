const EventEmitter = require("node:events");
const osc = require("osc");

class X32 extends EventEmitter {

    constructor(config) {

        super();

        this.host = config.host;
        this.port = config.port;
        this.localPort = config.localPort;

        this.mappings = config.mappings || [];

        this.pollIntervalMs = config.pollIntervalMs || 10000;

        this.udp = null;
        this.pollTimer = null;

        // ------------------------------------------------
        // Build lookup tables
        // ------------------------------------------------

        this.mappingsByAddress = {};
        for (const mapping of this.mappings) {
            this.mappingsByAddress[ mapping.address ] = mapping;
        }

        // ------------------------------------------------
        // State
        // ------------------------------------------------

        this.state = {};
        for (const mapping of this.mappings) {
            this.state[mapping.key] = null;
        }
    }

    // ====================================================
    // Connect
    // ====================================================

    connect() {

        this.udp = new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: this.localPort,
            remoteAddress: this.host,
            remotePort: this.port
        });

        this.udp.on( "ready", () => this.onReady() );
        this.udp.on( "message", msg => this.onMessage(msg) );
        this.udp.on( "error", err => console.error( "OSC error:", err ) );

        this.udp.open();
    }

    onReady() {
        console.log( `X32 UDP ready -> ${this.host}:${this.port}` );
        this.poll();
        this.pollTimer = setInterval( () => this.poll(), this.pollIntervalMs );
    }

    // ====================================================
    // Polling
    // ====================================================

    poll() {
        console.log( "Polling X32..." );
        this.send("/xremote");
        for (const mapping of this.mappings) {            
            this.send( mapping.address );
        }
    }

    // ====================================================
    // Receive
    // ====================================================

    onMessage(message) {

        console.log( "OSC RX:", message.address, message.args );

        const mapping = this.mappingsByAddress[ message.address ];

        if (!mapping) { return; }

        let value = message.args?.[0];

        if (
            typeof value === "object" &&
            value !== null &&
            "value" in value
        ) {
            value = value.value;
        }

        value = Boolean(value);

        if ( this.state[mapping.key] === value ) { return; }

        this.state[mapping.key] = value;

        this.emit(              // what does this do?
            "stateChanged",
            this.getState()
        );
    }

    // ====================================================
    // Actions
    // ====================================================

    toggle(key) {

        const mapping = this.mappings.find( m => m.key === key );

        if (!mapping) { return; }

        const current = this.state[key];

        if (current === null) {
            console.warn( `Cannot toggle ${key}: state unknown` );
            return;
        }

        this.send( mapping.address, [ Number(!current) ] );
    }

    toggleSpeechMute() {

        this.toggle(
            "muteSpeech"
        );
    }

    toggleBandMute() {

        this.toggle(
            "muteBand"
        );
    }

    // ====================================================
    // OSC send
    // ====================================================

    send(address, args = []) {
        if (!this.udp) { return; }
        this.udp.send({ address, args });
    }

    // ====================================================
    // State
    // ====================================================

    getState() {
        return structuredClone(this.state);
    }

    // ====================================================
    // Cleanup
    // ====================================================

    disconnect() {

        if (this.pollTimer) {
            clearInterval( this.pollTimer );
        }

        if (this.udp) {
            this.udp.close();
        }
    }
}

module.exports = X32;