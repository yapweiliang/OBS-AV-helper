let CONFIG = null;
let STATE = {};
let socket = null;

// ----------------------------------------------------
// INIT
// ----------------------------------------------------

async function initialise() {

    CONFIG = await loadConfig();
    renderUI();
    initWebSocket();
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

function initWebSocket() {

    socket = new WebSocket(`ws://${window.location.host}`);

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") {
            STATE = msg.state;
            updateUI();
        }
    };
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

// ----------------------------------------------------
// INDICATORS
// ----------------------------------------------------

function renderIndicators() {

    const container = document.getElementById("buttons"); // same grid for now

    for (const ind of CONFIG.ui.indicators) {

        const el = document.createElement("div");

        el.id = ind.id;
        el.className = "indicator";
        el.innerHTML = `
            ${ind.label}
            <span class="label">value</span>
        `;

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// FADERS
// ----------------------------------------------------

function renderFaders() {

    const container = document.getElementById("buttons"); // same grid for now

    for (const fdr of CONFIG.ui.faders) {

        const el = document.createElement("div");

        el.id = fdr.id;
        el.className = "fader";
        el.innerHTML = `
            ${fdr.label}
            <span class="label">value</span>
        `;

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// ACTIONS
// ----------------------------------------------------

async function triggerAction(signalId) {
    try {
        await fetch(`/action/${signalId}`, { method: "POST" });
        flash(signalId);
    } catch (err) {
        console.error("Action failed:", err);
    }
}

// ----------------------------------------------------
// UI UPDATE (CORE BINDING)
// ----------------------------------------------------

function updateUI() {
    updateButtons();
    updateIndicators();
    updateFaders();
}

// ----------------------------------------------------
// BUTTON STATE
// ----------------------------------------------------

function updateButtons() {

    for (const btn of CONFIG.ui.buttons) {

        const el = document.getElementById(btn.id);
        if (!el) continue;

        const value = STATE[btn.signalId];
        applyBooleanStyle(el, value);
    }
}

// ----------------------------------------------------
// INDICATOR STATE
// ----------------------------------------------------

function updateIndicators() {

    for (const ind of CONFIG.ui.indicators) {

        const el = document.getElementById(ind.id);
        if (!el) continue;

        const value = STATE[ind.signalId];
        el.querySelector(".label").textContent = value;
        applyIndicatorStyle(el, value);
    }
}

// ----------------------------------------------------
// FADER STATE
// ----------------------------------------------------

function updateFaders() {
    
    for (const fdr of CONFIG.ui.faders) {

        const el = document.getElementById(fdr.id);
        if (!el) continue;

        const value = STATE[fdr.signalId];
        // TODO convert value to dB
        el.querySelector(".label").textContent = value;
    }
}

// ----------------------------------------------------
// STYLE HELPERS
// ----------------------------------------------------

function applyBooleanStyle(el, value) {

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

// indicator uses same logic for now (can diverge later)
function applyIndicatorStyle(el, value) {

    if (value === true) {

        el.style.background = "#4caf50";
        el.style.color = "white";

    } else if (value === false) {

        el.style.background = "#ccc";
        el.style.color = "black";

    } else {

        el.style.background = "";
        el.style.color = "";
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