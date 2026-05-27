let CONFIG = null;

let socket = null;          // node server socket

// X32 states
let X32_STATE = {};

// PresetsTable states
let CAMERA_PRESETS = null;
//let activePreset = -1; // -1 means no active preset
let setButtonTimeoutHandle = null;
let rowHighlightTimeoutHandle = null;
let showAllPresets = false;

// Connectivity states
let serverConnected = false; // can this go to STATE or should that be X32_STATE?
let reconnectTimer = null;
let x32HeartbeatsMissedCounter = 0;  // number of poll cycles it has been silent

const WS_RECONNECT_MS = 5000;   // 

const PRESETS_TABLE_CONTAINER_ELEMENTID = "presetTableInlineContainer";
let PRESETS_TABLE_MINIMUM_ROWS;
let PRESETS_TABLE_TIMEOUT_MS;

const defaultFlashTimeoutDurationMs = 5000;
let flashStatusTextTimeoutID = null;
const eid_statusTextArea = document.getElementById('statusTextArea');
const eid_statusText = document.getElementById('statusText');
const nothingToFlash = ""; // what to display when the message is cleared

/*
    OUTLINE

    - init & config loading
    - ACTIONS    
    - websocket stuff and connectivity indicators and incoming-message handling

    - render UI (overall)
    - render X32 UI stuff
    - render Camera UI
    - update UI (overall)
    - update X32 UI
    - update Camera UI
    - style helpers
    - flash
*/



// ----------------------------------------------------
// INIT & CONFIG
// ----------------------------------------------------

async function initialise() {

    CONFIG = await loadConfig();
    CAMERA_PRESETS = CONFIG.ui.cameraPresets || null;
    PRESETS_TABLE_MINIMUM_ROWS = CONFIG.ui.PRESETS_TABLE_MINIMUM_ROWS || 2;
    PRESETS_TABLE_TIMEOUT_MS = (CONFIG.ui.DISABLE_SET_BUTTONS_AFTER_S || 30) * 1000;

    const container = document.getElementById(PRESETS_TABLE_CONTAINER_ELEMENTID);
    if (container) {
        container.addEventListener("click", presetsTableActions);
    };

    renderUI();
    connectWebSocket();
}

async function loadConfig() {

    const res = await fetch("/api/config");
    if (!res.ok) {
        throw new Error("Config load failed");
    }
    return await res.json();
}

// ----------------------------------------------------
// ACTIONS
// ----------------------------------------------------
// options:
// - await fetch("/path/to/endpoint/message", { method: "POST" });
//   - for X32 actions
// - socket.emit("message")
//   - for UI actions
//   - for Camera actions

async function triggerX32Action(signalId) {
    try {
        await fetch(`/x32/action/${signalId}`, { method: "POST" });
    } catch (err) {
        console.error("POST-ing x32 action failed:", err);
    }
}

function triggerOBSScene(sceneName) {
    socket.send(JSON.stringify({ type: "callOBSScene", sceneName: sceneName}));
}


function presetsTableActions(event) {
    if (event.target.id === "togglePresets") {
        showAllPresets = !showAllPresets;
        renderPresetsTable(); // TODO with the active Preset?
        return;
    };

    // not sure if closest button is needed - apparently clicking inside a text-span might not be deemed a button???
    // const btn = event.target.closest("button");
    // if (!btn) return;

    const action = event.target.dataset.action;
    const id = Number(event.target.dataset.id);

    if (action === "call") {
        socket.send(JSON.stringify({ type: "callCameraPreset", preset_id: id})); // App.Camera.callPreset(id);
        socket.send(JSON.stringify({ type: "enableSetCameraPreset", preset_id: id})); // enableSetButton(id);
        socket.send(JSON.stringify({ type: "highlightCameraPreset", preset_id: id})); // //highlightCameraPreset(id);  also sets activePreset   
        return;
    }

    if (action === "set") {
        if (!event.target.disabled) {
            socket.send(JSON.stringify({ 
                type: "setCameraPreset", 
                preset_id: id, 
                preset_name: CAMERA_PRESETS.find(p => p.PresetNumber === id)?.PresetName
            }));
        }
        return;
    }
}

// ----------------------------------------------------
// WEBSOCKET to node server, and other connectivity
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
    // expect type, state, text, timeout
    const msg = JSON.parse(event.data);

    switch(msg.type) {
        // X32-related messages
        case "x32StateChanged":
            X32_STATE = msg.state;
            updateUI();
            break;
        case "x32LoadSuccess":
            // TODO report snippet load success
            console.log("x32LoadSuccess PLACEHOLDER");
            break;
        case "x32HeartbeatsMissed":
            x32HeartbeatsMissedCounter = msg.state;
            updateX32ConnectionStatus();
            break;

        // camera-related messages    
        case "highlightCameraPreset":
            highlightCameraPreset(msg.preset_id)            
            break;
        case "enableSetCameraPreset":
            console.log("enableSetCameraPreset PLACEHOLDER")
            break;
        case "updateClientTallyLightIndicator":
            console.log("PLACEHOLDER tally light set to: ", msg.color);
            break;

        // ui/status messages
        case "flashStatusText":
            flashStatusText(msg.text, msg.durationMs);
            break;
        case "displayCameraSettings":
            // TODO
            break;

        default:
            console.warn("Unrecognised event message.", event);

    }
}

function onSocketOpen() {
    serverConnected = true;
    enableX32Buttons();
    updateServerConnectionStatus();
}

function onSocketClose() {
    if (reconnectTimer) { return; }
    serverConnected = false;
    updateServerConnectionStatus();
    enableX32Buttons(false);
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, WS_RECONNECT_MS);
}

function onSocketError(err) {
    console.error("Socket Error:", err);
}

// ----------------------------------------------------

function updateServerConnectionStatus() {
    const el = document.getElementById( "serverStatus" );
    if (!el) return;
    el.textContent = serverConnected ? "Connected to server" : "Disconnected from server";
    // TODO beautify
}

function updateX32ConnectionStatus() {
    const el = document.getElementById( "x32Status" );
    if (!el) return;
    el.textContent = (x32HeartbeatsMissedCounter==0) ? "Connected to X32" : "Not heard for a while";  // stale state...
    // TODO beautify
}

function updateCameraConnectionStatus() {
    // TODO, maybe model similarly to X32
}

// ----------------------------------------------------
// RENDER UI
// ----------------------------------------------------

function renderUI() {

    renderX32Buttons();
    renderX32Indicators();
    renderX32Faders();
    renderPresetsTable();
    renderOBSButtons();
}

// ----------------------------------------------------
// X32 UI
// ----------------------------------------------------

function renderX32Buttons() {

    const container = document.getElementById("x32Buttons");
    container.innerHTML = "";

    for (const btn of CONFIG.ui.buttons) {

        const el = document.createElement("button");

        el.id = btn.id;
        el.textContent = btn.label;
        el.onclick = () => triggerX32Action(btn.signalId);

        container.appendChild(el);
    }
}

function renderX32Indicators() {

    const container = document.getElementById("x32Indicators"); // same grid for now

    for (const ind of CONFIG.ui.indicators) {

        const el = document.createElement("div");

        el.id = ind.id;
        el.className = "indicator";
        el.innerHTML = `${ind.label}: <span class="label">value</span>`;

        container.appendChild(el);
    }
}

function renderX32Faders() {

    const container = document.getElementById("x32Indicators");

    for (const fdr of CONFIG.ui.faders) {

        const el = document.createElement("div");

        el.id = fdr.id;
        el.className = "fader";
        el.innerHTML = ` ${fdr.label}: <span class="label">value</span> `;

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// Camera Presets UI
// ----------------------------------------------------

function renderPresetsTable(activePreset = -1) {
    const container = document.getElementById(PRESETS_TABLE_CONTAINER_ELEMENTID);
    if (!container) return;
    container.innerHTML = ""; // clear existing

    const table = document.createElement("table");
    table.classList.add("presets-table");

    // Header
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th style="text-align:right">#</th><th>Call Preset</th><th>Adjust, then Set</th>`;
    table.appendChild(headerRow);

    // Data rows
    if (typeof(CAMERA_PRESETS)==='undefined' || !Array.isArray(CAMERA_PRESETS) || CAMERA_PRESETS.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 3;
        cell.classList.add("presets-table--advisory");
        cell.textContent = `No presets configured. Please edit ${PRESETS_FILE} then refresh.`;
        row.appendChild(cell);
        table.appendChild(row);
        container.appendChild(table);
    } else {
        const data = showAllPresets ? CAMERA_PRESETS : CAMERA_PRESETS.slice(0, PRESETS_TABLE_MINIMUM_ROWS) 
        data.forEach(preset => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td style="text-align:right">${preset.PresetNumber}</td>
                <td>
                    <button class="call-btn" data-action="call" data-id="${preset.PresetNumber}">
                        ${preset.PresetName}
                    </button>
                </td>
                <td>
                    <button class="set-btn"
                            data-action="set"
                            data-id="${preset.PresetNumber}"
                            disabled>
                        Set ${preset.PresetNumber}
                    </button>
                </td>
            `;

            table.appendChild(row);
        });
        container.appendChild(table);
        if (CAMERA_PRESETS.length > PRESETS_TABLE_MINIMUM_ROWS) {
            const toggleBtn = document.createElement("button");
            toggleBtn.classList.add("call-btn");
            toggleBtn.textContent = showAllPresets ? "Less Presets..." : "More Presets...";
            toggleBtn.id = "togglePresets";
            container.appendChild(toggleBtn);
        };
        if (activePreset >= 0) {
            highlightCameraPreset(activePreset); // re-highlight if it was already highlighted
        }
    }        
}


// OBS UI ---------------

function renderOBSButtons() {
    const container = document.getElementById("obsButtons");
    container.innerHTML = "";

    for (const btn of CONFIG.ui.obsScenes) {

        const el = document.createElement("button");

        el.id = btn.id;
        el.textContent = btn.label;
        el.onclick = () => triggerOBSScene(btn.sceneName);

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// UI UPDATE (CORE BINDING and helpers)
// ----------------------------------------------------

function updateUI() {
    updateX32Buttons();
    updateX32Indicators();
    updateX32Faders();
}

function flashStatusTextTimeout() {
    flashStatusTextTimeoutID = null;
    flashStatusText(nothingToFlash, 0); // on timeout, print a default/idle text
}

function flashStatusText(text, durationMs = defaultFlashTimeoutDurationMs) {
    // 0 duration means keep it displayed
    if (eid_statusText !== null) {
        if (flashStatusTextTimeoutID != null) {
            clearTimeout(flashStatusTextTimeoutID);
            flashStatusTextTimeoutID = null;
        }

        eid_statusText.innerHTML = text;
        if (durationMs == 0) {
            if (text == nothingToFlash) {
                eid_statusTextArea.classList.remove("statusTextAreaWarn")
            } else {
                eid_statusTextArea.classList.add("statusTextAreaWarn")
            }
        } else {
            eid_statusTextArea.classList.remove("statusTextAreaWarn")
        }

        if (durationMs > 0) {
            flashStatusTextTimeoutID = setTimeout(flashStatusTextTimeout, durationMs);
        }
    }
}

// ----------------------------------------------------
// UPDATE X32 UI (buttons, indicators, faders, etc)
// ----------------------------------------------------

function enableX32Buttons(enabled = true) {
    for (const btn of CONFIG.ui.buttons) {
        const el = document.getElementById(btn.id);
        el.disabled = !enabled;
        // btn.classList.....

    }
}

function updateX32Buttons() {

    for (const btn of CONFIG.ui.buttons) {

        const el = document.getElementById(btn.id);
        if (!el) continue;

        const value = X32_STATE[btn.signalId];
        applyBooleanStyle(el, value);
    }
}

function updateX32Indicators() {

    for (const ind of CONFIG.ui.indicators) {

        const el = document.getElementById(ind.id);
        if (!el) continue;

        const value = X32_STATE[ind.signalId];
        el.querySelector(".label").textContent = value;
        //applyIndicatorStyle(el, value);
    }
}

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
// UPDATE CAMERA UI stuff
// ----------------------------------------------------

function resetAllSetButtons() {
    document.querySelectorAll(".set-btn").forEach(btn => {
        btn.disabled = true;
        btn.classList.remove("armed");
    });

    if (setButtonTimeoutHandle) {
        clearTimeout(setButtonTimeoutHandle);
        setButtonTimeoutHandle = null;
    }
}

function startTimeout() {
    if (setButtonTimeoutHandle) clearTimeout(setButtonTimeoutHandle);

    setButtonTimeoutHandle = setTimeout(() => {
        resetAllSetButtons();
    }, PRESETS_TABLE_TIMEOUT_MS);
}

function enableSetCameraPreset(preset_id) {
    resetAllSetButtons();

    const btn = document.querySelector(`.set-btn[data-id="${preset_id}"]`);
    if (btn) {
        btn.disabled = false;
        btn.classList.add("armed");
        startTimeout();
    }
}

function highlightCameraPreset(preset_id) {
    // TODO this logic should be managed from server.js

    // to be called by obs websocket on scene change, and when preset called
    // n < 0 means no activePreset
    // activePreset = preset_id;  // TODO this should live in server.js

    const rows = document.querySelectorAll(`#${PRESETS_TABLE_CONTAINER_ELEMENTID} tr`);
    rows.forEach(r => r.classList.remove("highlight"));
    resetAllSetButtons();
    if (rowHighlightTimeoutHandle) {
        clearTimeout(rowHighlightTimeoutHandle);
        rowHighlightTimeoutHandle = null;
    }

    if (preset_id < 0) {
        return;
    }

    let target = null;
    rows.forEach(row => {
        const cell = row.querySelector("td");
        if (cell && Number(cell.textContent) === preset_id) {
            target = row;
        }
    });

    if (!target) return;

    target.classList.add("highlight");
    enableSetCameraPreset(preset_id);


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

function TODO_remove_flash(signalId) {

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