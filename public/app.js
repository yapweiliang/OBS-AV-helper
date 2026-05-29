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

// camera states
let cameraTallyLightColor = "";

// Connectivity states
let serverConnected = false; // can this go to STATE or should that be X32_STATE?
let reconnectTimer = null;
let x32HeartbeatsMissedCounter = 0;  // number of poll cycles it has been silent
let obsConnectSuccess = null; // disconnected, connected, 
let obsRecordState = true; // live (streaming, recordning)
let obsStreamState = true;
let obsActiveScene = null;

const WS_RECONNECT_MS = 5000;   // 

const OBS_SCENE_BUTTONS_CONTAINER = "obsSceneButtonsContainer";
const eid_obsCurrentScene = document.getElementById("obsCurrentScene");

const PRESETS_TABLE_CONTAINER_ELEMENTID = "presetTableInlineContainer";
let PRESETS_TABLE_MINIMUM_ROWS;
let PRESETS_TABLE_TIMEOUT_MS;

const defaultFlashTimeoutDurationMs = 5000;
let flashStatusTextTimeoutID = null;
const eid_statusTextArea = document.getElementById('statusTextArea');
const eid_statusText = document.getElementById('statusText');
const eid_tallyTextArea = document.getElementById('tallyTextArea');
const eid_tallyText = document.getElementById('tallyText'); // use for OBS STATE
const nothingToFlash = ""; // what to display when the message is cleared

const GREEN_DOT = '🟢';
const AMBER_DOT = '🟡';
const RED_DOT   = '🔴';
const WHITE_DOT = '⚪';

const OTHER_OBS_ACTION_BUTTONS = [
        'btnOverlayParents', 'btnOverlayCustom',
        'btnStartStopStream'
    ];

const OTHER_CAMERA_ACTION_BUTTONS = [
        'btnToggleAutoFocus', 'btnOnePushFocus', 'btnOnePushWhiteBalance', 
        'btnResetCamera', 'btnRestartCamera', 
        'selFocusZoneSelect'
    ];

const FOCUS_ZONES = [
    { id: 0, label: 'top'    },
    { id: 1, label: 'centre' },
    { id: 2, label: 'bottom' },
    { id: 3, label: 'left'   },
    { id: 4, label: 'right'  },        
    { id: 5, label: 'all'    },
    { id: 6, label: 'point (do not use)' }
];

const eid_selFocusZoneSelect     = document.getElementById('selFocusZoneSelect');
const eid_btnToggleAutoFocus  = document.getElementById('btnToggleAutoFocus');
const eid_btnOnePushFocus     = document.getElementById('btnOnePushFocus');
const eid_infoBtn             = document.getElementById('infoButton');
const eid_helpBtn             = document.getElementById('helpButton');

const X32_TAG = "__X32__";

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

    renderUI(); // buttons, etc

    const container = document.getElementById(PRESETS_TABLE_CONTAINER_ELEMENTID);
    if (container) {
        container.addEventListener("click", presetsTableActions);
    };

    // TODO add listeners and methods

    document.querySelectorAll(".hold-button").forEach(initHoldButton);
    // TODO X32 initialise button to have this method as well

    // eid_focusZoneSelect.addEventListener('change', sendFocusZone);
    
    // eid_infoBtn.addEventListener('click', printSettings);
    // eid_helpBtn.addEventListener('click', showHelp);

    connectWebSocket(); 
    // socket open calls onSocketOpen(), which
    // - enables action buttons, updatesconnectionstatus, etc
    // TODO can this obtain the last-known activePreset?
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
            updateX32ControlsStatus();
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
            cameraTallyLightColor = msg.color;
            updateCameraUIStatus();
            break;

        // obs-related messages
        case "updateOBSLiveStatus":
            obsRecordState = msg.recordState;
            obsStreamState = msg.streamState;
            updateOBSLiveStatus();
            break;
        case "updateOBSConnectionStatus":
            obsConnectSuccess = msg.state;
            updateOBSConnectionStatus();
            console.log('obsconnectsuccess', obsConnectSuccess)
            enableOBSActionButtons(obsConnectSuccess);
            break;
        case "highlightOBSScene":
            highlightOBSScene(msg.sceneName);

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

    enableActionButtons();

    updateServerConnectionStatus();
    updateX32ConnectionStatus();
    updateOBSConnectionStatus();
}

function onSocketClose() {
    if (reconnectTimer) { return; }
    serverConnected = false;

    updateServerConnectionStatus();
    updateX32ConnectionStatus();
    updateOBSConnectionStatus();

    enableActionButtons(false);

    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, WS_RECONNECT_MS);
}

function onSocketError(err) {
    console.error("Socket Error:", err);
}

// ----------------------------------------------------

function updateServerConnectionStatus() {
    const el = document.getElementById( "serverStatus" );
    if (!el) return;
    el.textContent = serverConnected ? GREEN_DOT : RED_DOT
}

function updateX32ConnectionStatus() {
    const el = document.getElementById( "x32Status" );
    if (!el) return;
    if (!serverConnected) {
        el.textContent = WHITE_DOT;
        return;
    }
    if (x32HeartbeatsMissedCounter==0) {
        el.textContent = GREEN_DOT
    } else if (x32HeartbeatsMissedCounter <3) {
         el.textContent = AMBER_DOT
    } else {
        el.textContent = RED_DOT
    }
}

function updateOBSConnectionStatus() {
    const el = document.getElementById( "obsStatus" );
    if (!el) return;
        if (!serverConnected) {
        el.textContent = WHITE_DOT;
        return;
    }
    el.textContent = obsConnectSuccess ? GREEN_DOT : RED_DOT
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
    renderFocusZones();
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

        if (btn.confirm == true) {
            el.classList.add('hold-button', 'button--prompt');
            el.dataset.action = X32_TAG + btn.signalId;
            el.dataset.holdMs = 1000;            
            initHoldButton(el);
        } else {
            el.onclick = () => triggerX32Action(btn.signalId, btn.confirm); // TOD can remove btn.confirm
        }

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
// Camera Presets UI & Focus Zones
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

function renderFocusZones() {
    for (const zone of FOCUS_ZONES) {
        const option = document.createElement('option');
        option.value = zone.id;
        option.textContent = zone.label;
        eid_selFocusZoneSelect.appendChild(option);
    };    
};

// ----------------------------------------------------
// OBS UI
// ----------------------------------------------------

function renderOBSButtons() {
    const container = document.getElementById(OBS_SCENE_BUTTONS_CONTAINER);
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

function updateX32ControlsStatus() {
    updateX32Buttons();
    updateX32Indicators();
    updateX32Faders();
}

// function updateAllUI() {  // TODO this is not called?
//     // controls, not connection
// 
//     updateX32ControlsStatus(); // buttons, indicators, faders
//     updateCameraUIStatus(); // tally light
//     updateOBSUIStatus(); // streaming / recording
// }

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
                eid_statusTextArea.classList.remove("status-text-area--warn")
            } else {
                eid_statusTextArea.classList.add("status-text-area--warn")
            }
        } else {
            eid_statusTextArea.classList.remove("status-text-area--warn")
        }

        if (durationMs > 0) {
            flashStatusTextTimeoutID = setTimeout(flashStatusTextTimeout, durationMs);
        }
    }
}

// ----------------------------------------------------
// UPDATE general UI 
// ----------------------------------------------------

function enableOBSActionButtons(enabled = true) {
    for (const btn of CONFIG.ui.obsScenes) {
        const el = document.getElementById(btn.id);
        el.disabled = !enabled;        
    }

    for (const btn of OTHER_OBS_ACTION_BUTTONS) {
        const el = document.getElementById(btn);
        el.disabled = !enabled;
    }    

    // TODO is this a good place to enable/disable the wrongly-mapped buttons?
    // TODO perhaps updateoverlaycache should send an overlayCacheUpdated message for server to update but this does not factor in renamed scenes
}

function enableActionButtons(enabled = true) {

    // maybe retain these, as they send a POST
    for (const btn of CONFIG.ui.buttons) {
        const el = document.getElementById(btn.id);
        el.disabled = !enabled;
    }

    // OBS scene buttons
    enableOBSActionButtons(obsConnectSuccess && enabled);

    // Camera preset and actions buttons

    // other Camera buttons
    for (const btn of OTHER_CAMERA_ACTION_BUTTONS) {
        const el = document.getElementById(btn);
        el.disabled = !enabled;
    }


    // overall background
    if (enabled) {
        document.body.classList.remove('disabled-background');
    } else {
        document.body.classList.add('disabled-background');
    }
}

// ----------------------------------------------------
// UPDATE X32 UI (buttons, indicators, faders, etc)
// ----------------------------------------------------

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
    // called when:
    // - server.js sends message on websocket connection [with preset_id]
    //   - when presetsTableActions() process a call-button event/action
    //   - when obs.js sends message on scene change
    // - renderPresetsTable() for drawing/redrawing
    //   - when app.js initialise() --> renderUI() --> renderPresetsTable()
    //          TODO this currently does not obtain/know/send the active preset
    //   - when [btnTogglePresets] --> presetsTableActions() --> renderPresetsTable()
    //          TODO this currently does not know/send the activePreset

    // TODO how to ensure renderPresetsTable gets the correct activePreset?
    // TODO this logic should be managed from server.js

    // n < 0 means no activePreset
    // activePreset = preset_id;  // TODO this should live in server.js

    const rows = document.querySelectorAll(`#${PRESETS_TABLE_CONTAINER_ELEMENTID} tr`);
    rows.forEach(r => r.classList.remove("presets-table--highlight"));
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

    target.classList.add("presets-table--highlight");
    enableSetCameraPreset(preset_id);

}

function updateCameraUIStatus() {
    // tally colour = camera state
    // tally text = obs state

    eid_tallyTextArea.style.backgroundColor = serverConnected ? cameraTallyLightColor : "black";
    // TODO do we update the presetsTable here too?
}

// ----------------------------------------------------
// UPDATE OBS UI stuff
// ----------------------------------------------------

function updateOBSLiveStatus() {
    // tally colour = camera state
    // tally text = obs state

    const text = `${obsStreamState ? "STREAMING" : "-"}<br>${obsRecordState ? "RECORDING" : "-"}`
    eid_tallyTextArea.innerHTML = serverConnected ? text : "?";
}

function highlightOBSScene(sceneName) {
    // called when:
    // - obs.js emits message on scene change
    // - server.js sends message on websocket connection

    for (const btn of CONFIG.ui.obsScenes) {
        const el = document.getElementById(btn.id);
        el.classList.remove('button--highlighted');
        if (btn.sceneName == sceneName) {
            el.classList.add('button--highlighted');
        }
    }
    eid_obsCurrentScene.innerHTML = sceneName;
}

// ----------------------------------------------------
// STYLE HELPERS
// ----------------------------------------------------

function applyBooleanStyle(el, value) {
    // TODO rename as mute rather than on/off

    if (value === true) {
        el.classList.add("button--muted");
        el.classList.remove("button--unmuted");
    } else if (value === false) {
        el.classList.add("button--unmuted");
        el.classList.remove("button--muted");
    }
}

// ----------------------------------------------------
// HOLD BUTTON stuff (initHoldButton and runHoldAction)
// ----------------------------------------------------

function initHoldButton(button) {
    button.dataset.originalText = button.textContent.trim();

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    button.prepend(progressBar);

    const progress = button.querySelector(".progress-bar");
    const holdMs = button.dataset.holdMs !== undefined ? Number(button.dataset.holdMs) : 0;
    const actionName = (button.dataset.action != undefined) ? button.dataset.action : "";
    const title = (button.title != undefined) ? button.title : "";

    let raf = null;
    let timer = null;
    let startTime = 0;

    function reset() {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        progress.style.width = "0%";
    }

    function update(now) {
        const elapsed = now - startTime;
        const percent = Math.min(elapsed / holdMs, 1);
        progress.style.width = `${percent * 100}%`;
        if (percent < 1) {
            raf = requestAnimationFrame(update);
        }
    }

    function startHold(e) {
        if (e.pointerType === "mouse" && e.button !== 0) { return; }; // if mouse, only accept left click

        const bypassHold = (button.dataset.bypassHold != undefined)
        if (holdMs <= 0 || bypassHold) {
            runHoldAction(actionName, button);
            return;
        }
        // show the title only if holdMs > 0
        if (title != "") { flashStatusText(`${title}`, (holdMs < 2000) ? 2000 : holdMs) };
        startTime = performance.now();
        raf = requestAnimationFrame(update);
        timer = setTimeout(() => {
            reset();
            runHoldAction(actionName, button);
        }, holdMs);
    }

    button.addEventListener("pointerdown", startHold);
    ["pointerup", "pointerleave", "pointercancel"].forEach(eventName => {
        button.addEventListener(eventName, reset);
    });
}

async function runHoldAction(actionName, button) {
    // TODO disableCameraActionButtons disableActionButtons();
    
    button.classList.add("button--waiting");

    const allowedMessages = [
        'toggleParentsOverlay',
        'toggleCustomOverlay',
        'toggleStreamStartStop',
        'toggleAutoFocus',
        'onePushFocus',
        'onePushWhiteBalance'];

    if (actionName.startsWith(X32_TAG)) {
        // handle X32 hold-button buttons (with confirm flag, e.g. initialise)
        const signalId = actionName.replace(X32_TAG, '');
        triggerX32Action(signalId);
    } else if (allowedMessages.includes(actionName)) {
        // then other (obs & camera) buttons
        socket.send(JSON.stringify({ type: actionName }));
    } else {
        // report unknown action
        console.warn("Unknown hold action:", actionName);
    }
    
    button.classList.remove("button--waiting");
    // TODO camera action buttons disableActionButtons('reset');
}

// ----------------------------------------------------
// START
// ----------------------------------------------------

initialise();