const EventEmitter = require("node:events");
const osc = require("osc");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class X32 extends EventEmitter {

    constructor(config) {

        super();

        this.host = config.host;
        this.port = config.port;
        this.localPort = config.localPort;

        this.actions = config.actions || {};

        this.pollIntervalMs = config.pollIntervalMs || 10000;

        this.udp = null;
        this.pollTimer = null;

        // ------------------------------------------------
        // Build lookup table for incoming OSC
        // ------------------------------------------------

        this.actionsByAddress = {};
        for (const [name, action] of Object.entries(this.actions)) {
            if ( action.type === "toggle" && action.address ) {
                this.actionsByAddress[ action.address ] = { name, ...action };
            }
        }

        // ------------------------------------------------
        // State
        // ------------------------------------------------

        this.state = {};
        for (const [name, action] of Object.entries(this.actions)) {
            if (action.type === "toggle") {
                this.state[name] = null;
            }
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
    // Poll X32
    // ====================================================

    poll() {

        this.send("/xremote");
// pause a bit ?
        for (const action of Object.values(this.actions)) {
            if ( action.type === "toggle" && action.poll ) {
                this.send( action.address );
            }
        }
    }

    // ====================================================
    // Receive OSC
    // ====================================================

    onMessage(message) {
        console.log( "OSC RX:", message.address, message.args );

        if (message.address === "/load") {
            this.handleLoadResponse( message.args );
            return;
        }

        const action = this.actionsByAddress[ message.address ];

        if (!action) { return; } // ignore, if this is not in our list

        let value = message.args?.[0];

        // osc.js sometimes wraps values
        if (
            typeof value === "object" &&
            value !== null &&
            "value" in value
        ) {
            value = value.value;
        }

        value = Boolean(value);
        if (action.invertState) { 
            value = !value; 
        }

        if ( this.state[action.name] === value ) { return; }

        this.state[action.name] = value;

        this.emit(              // what does this do?
            "stateChanged",
            this.getState()
        );
    }

    // ====================================================
    // handle Load (snippet) response
    // ====================================================

    handleLoadResponse(args) {

        let type = args?.[0];
        let result = args?.[1];

        if (
            typeof type === "object" &&
            type !== null &&
            "value" in type
        ) {
            type = type.value;
        }

        if (
            typeof result === "object" &&
            result !== null &&
            "value" in result
        ) {
            result = result.value;
        }

        console.log( `Load response: ${type} => ${result}` );

        this.emit( "loadResponse", { type, success: Boolean(result) } );
    }    

    // ====================================================
    // Execute configured action
    // ====================================================

    executeAction(actionName) {

        const action = this.actions[actionName];

        if (!action) {
            console.warn( `Unknown action: ${actionName}` );
            return;
        }

        switch (action.type) {

            case "toggle":
                this.executeToggle(actionName);
                break;

            case "snippet":
                this.executeSnippet( action );
                break;

            default:

                console.warn( `Unsupported action type: ${action.type}` );
        }
    }

    // ====================================================
    // Toggle
    // ====================================================

    executeToggle(actionName) {
        const action = this.actions[actionName];
        const current = this.state[actionName];

        if (current === null) {
            console.warn( `Cannot toggle ${actionName}: state unknown` );
            return;
        }

        if (action.invertState) { 
            this.send( action.address, [ { type: "i", value: Number(current) } ] );
        } else {
            this.send( action.address, [ { type: "i", value: Number(!current) } ] );
        }

        // X32 does not seem to echo back the Fader and Mute commands or Mute Group. Or at least the X32 Emulator...
        this.send(action.address); // therefore send another query [ ] TODO test with real X32
        //setTimeout(() => { this.send(action.address); }, 50);
    }

    // ====================================================
    // Snippet
    // ====================================================

    executeSnippet(action) {
        const snippet = action.snippet;

        console.log(`Loading snippet ${snippet}`);

        this.send( "/load", [ "snippet", { type: "i", value: snippet } ] );
    }

    // ====================================================
    // OSC Send
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
        if (this.pollTimer) { clearInterval(this.pollTimer); }
        if (this.udp) { this.udp.close(); }
    }
}

module.exports = X32;