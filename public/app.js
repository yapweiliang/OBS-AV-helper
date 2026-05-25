let CONFIG = null;
let X32_STATE = {};
let socket = null;

let serverConnected = false; // can this go to STATE or should that be X32_STATE?
let reconnectTimer = null;
let x32HeartbeatsMissed = null;  // number of poll cycles it has been silent

const WS_RECONNECT_MS = 5000;

// ----------------------------------------------------
// INIT
// ----------------------------------------------------

async function initialise() {

    CONFIG = await loadConfig();
    renderUI();
    connectWebSocket();
}

// ----------------------------------------------------
// CONFIG
// ----------------------------------------------------

async function loadConfig() {

    const res = await fetch("/api/config");
    if (!res.ok) {
        throw new Error("Config load failed");
    }
    return await res.json();
}

// ----------------------------------------------------
// WEBSOCKET
// ----------------------------------------------------

function connectWebSocket() {

    socket = new WebSocket(`ws://${window.location.host}`);

    socket.onopen = onSocketOpen;
    socket.onclose = onSocketClose;
    socket.onerror = onSocketError;
    socket.onmessage = onSocketMessage;
}

function onSocketMessage(event) {
    // event messages received from server.js
    const msg = JSON.parse(event.data);
console.log(msg);
    switch(msg.type) {
        case "x32StateChanged":
            X32_STATE = msg.state;
            updateUI();
            break;
        case "x32LoadSuccess":
            // TODO
            break;
        case "x32HeartbeatsMissed":
            x32HeartbeatsMissed = msg.state;
            updateX32ConnectionStatus();
            break;            
        default:
            console.warn("Unrecognised event message.", event);

    }
}

function onSocketOpen() {
    serverConnected = true;
    enableButtons();
    updateConnectionStatus();
}

function onSocketClose() {
    if (reconnectTimer) { return; }
    serverConnected = false;
    updateConnectionStatus();
    enableButtons(false);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, WS_RECONNECT_MS);
}

function onSocketError(err) {
    console.error("Socket Error:", err);
}

function updateConnectionStatus() {
    const el = document.getElementById( "serverStatus" );
    if (!el) return;
    el.textContent = serverConnected ? "Connected to server" : "Disconnected from server";
    // TODO beautify
}

function updateX32ConnectionStatus() {
    const el = document.getElementById( "x32Status" );
    if (!el) return;
    el.textContent = (x32HeartbeatsMissed==0) ? "Connected to X32" : "Not heard for a while";  // stale state...
    // TODO beautify
}

// ----------------------------------------------------
// RENDER UI
// ----------------------------------------------------

function renderUI() {

    renderButtons();
    renderIndicators();
    renderFaders();
}

// ----------------------------------------------------
// BUTTONS
// ----------------------------------------------------

function renderButtons() {

    const container = document.getElementById("buttons");
    container.innerHTML = "";

    for (const btn of CONFIG.ui.buttons) {

        const el = document.createElement("button");

        el.id = btn.id;
        el.textContent = btn.label;
        el.onclick = () => triggerAction(btn.signalId);

        container.appendChild(el);
    }
}

function enableButtons(enabled = true) {
    for (const btn of CONFIG.ui.buttons) {
        const el = document.getElementById(btn.id);
        el.disabled = !enabled;
        // btn.classList.....

    }
}

// ----------------------------------------------------
// INDICATORS
// ----------------------------------------------------

function renderIndicators() {

    const container = document.getElementById("indicators"); // same grid for now

    for (const ind of CONFIG.ui.indicators) {

        const el = document.createElement("div");

        el.id = ind.id;
        el.className = "indicator";
        el.innerHTML = `${ind.label}: <span class="label">value</span>`;

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// FADERS
// ----------------------------------------------------

function renderFaders() {

    const container = document.getElementById("indicators");

    for (const fdr of CONFIG.ui.faders) {

        const el = document.createElement("div");

        el.id = fdr.id;
        el.className = "fader";
        el.innerHTML = ` ${fdr.label}: <span class="label">value</span> `;

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// ACTIONS
// ----------------------------------------------------

async function triggerAction(signalId) {
    try {
        await fetch(`/x32/action/${signalId}`, { method: "POST" });
        flash(signalId);
    } catch (err) {
        console.error("Action failed:", err);
    }
}

// ----------------------------------------------------
// UI UPDATE (CORE BINDING)
// ----------------------------------------------------

function updateUI() {
    updateX32Buttons();
    updateX32Indicators();
    updateX32Faders();
}

// ----------------------------------------------------
// BUTTON STATE
// ----------------------------------------------------

function updateX32Buttons() {

    for (const btn of CONFIG.ui.buttons) {

        const el = document.getElementById(btn.id);
        if (!el) continue;

        const value = X32_STATE[btn.signalId];
        applyBooleanStyle(el, value);
    }
}

// ----------------------------------------------------
// INDICATOR STATE
// ----------------------------------------------------

function updateX32Indicators() {

    for (const ind of CONFIG.ui.indicators) {

        const el = document.getElementById(ind.id);
        if (!el) continue;

        const value = X32_STATE[ind.signalId];
        el.querySelector(".label").textContent = value;
        //applyIndicatorStyle(el, value);
    }
}

// ----------------------------------------------------
// FADER STATE
// ----------------------------------------------------

function updateX32Faders() {
    
    for (const fdr of CONFIG.ui.faders) {

        const el = document.getElementById(fdr.id);
        if (!el) continue;

        const value = X32_STATE[fdr.signalId];
        // TODO convert value to dB, or do the conversion at the display end?
        el.querySelector(".label").textContent = value;
    }
}

// ----------------------------------------------------
// STYLE HELPERS
// ----------------------------------------------------

function applyBooleanStyle(el, value) {
    // TODO rename as mute rather than on/off

    if (value === true) {

        el.classList.add("toggle-on");
        el.classList.remove("toggle-off");

    } else if (value === false) {

        el.classList.add("toggle-off");
        el.classList.remove("toggle-on");

    } else {

        el.classList.remove("toggle-on", "toggle-off");
    }
}

// ----------------------------------------------------
// FLASH
// ----------------------------------------------------

function flash(signalId) {

    const btn = CONFIG.ui.buttons.find(b => b.signalId === signalId);

    if (!btn) return;

    const el = document.getElementById(btn.id);

    if (!el) return;

    el.style.opacity = 0.4;

    setTimeout(() => {
        el.style.opacity = 1;
    }, 300);
}

// ----------------------------------------------------
// START
// ----------------------------------------------------

initialise();