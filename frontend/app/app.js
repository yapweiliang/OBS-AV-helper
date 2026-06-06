let CONFIG = null;

let socket = null;          // node server socket

let myInfoDialogBox = null; // https://keejelo.github.io/EasyDialogBox/documentation.html

// X32 states
let X32_STATE = {};

// PresetsTable states
let CAMERA_PRESETS = null;
//let activePreset = -1; // -1 means no active preset
let setButtonTimeoutHandle = null;

// camera states
let cameraTallyLightColor = "";
let cameraFocusZoneId = null;
let cameraFocusMode = null;
let cameraFocusLocked = null;

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
let PRESETS_TABLE_TIMEOUT_MS;

const defaultFlashTimeoutDurationMs = 5000;
let flashStatusTextTimeoutID = null;
const eid_statusTextArea = document.getElementById('statusTextArea');
const eid_statusText = document.getElementById('statusText');
const eid_tallyTextArea = document.getElementById('tallyTextArea');
const eid_tallyText = document.getElementById('tallyText'); // use for OBS STATE
const eid_developmentStatus = document.getElementById('developmentStatus');
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
    'selFocusZoneSelect',
    'infoButton'
];

const OTHER_UI_ACTION_BUTTONS = [
    'helpButton', 'codeButton'
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

const eid_selFocusZoneSelect = document.getElementById('selFocusZoneSelect');
const eid_btnToggleAutoFocus = document.getElementById('btnToggleAutoFocus');
const eid_btnOnePushFocus    = document.getElementById('btnOnePushFocus');
const eid_infoBtn            = document.getElementById('infoButton');
const eid_helpBtn            = document.getElementById('helpButton');
const eid_codeBtn            = document.getElementById('codeButton');
const eid_fullBtn            = document.getElementById('fullScreenButton');

// tags for message handling
const X32_TAG = "__X32__";
const OBS_TAG = "__OBS__";

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
    // PRESETS_TABLE_MINIMUM_ROWS = CONFIG.ui.PRESETS_TABLE_MINIMUM_ROWS || 2;
    PRESETS_TABLE_TIMEOUT_MS = (CONFIG.ui.DISABLE_SET_BUTTONS_AFTER_S || 30) * 1000;

    function makeHoldButton(button, action) {
        button.classList.add('hold-button');
        button.dataset.action = action;
    }

    renderUI(); // includes obs scene buttons, x32 buttons

    // configure other buttons
    makeHoldButton(eid_infoBtn, "getCameraSettings");
    makeHoldButton(eid_codeBtn, "showCode");
    makeHoldButton(eid_helpBtn, "showHelp");

    // add listeners: hold-button class uses runHoldAction to process button actions
    document.querySelectorAll(".hold-button").forEach(initHoldButton);

    // add listeners: other - also to use runHoldACtion to process button actions
    eid_selFocusZoneSelect.addEventListener('change', () => runHoldAction("setFocusZone", eid_selFocusZoneSelect));

    eid_fullBtn.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (err) {
            console.error(err);
        }
    });

    if (!window.location.hostname.includes("localhost") || !CONFIG.ui.isDevelopment) {
        // remove contextmenu except on local development machine
        document.addEventListener("contextmenu", e => { e.preventDefault(); });
    } else {
        eid_developmentStatus.innerHTML = '<mark>: LOCAL DEVELOPMENT MACHINE :</mark>';
    }

    // below are not supported on my devices:
    // - await navigator.wakeLock.request("screen");
    // - await screen.orientation.lock(...)

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
        case "updateClientFocusState":
            if (msg.focus_zone) { 
console.log("updateClientFocusState received focus_zone", msg.focus_zone);
                cameraFocusZoneId = msg.focus_zone;
console.log("updateClientFocusState received focus_zone", msg.focus_zone, cameraFocusZoneId);                
            }
            if (msg.focus_mode) {
console.log("updateClientFocusState received focus_mode", msg.focus_mode);
                cameraFocusMode = msg.focus_mode;
                cameraFocusLocked = msg.focus_locked;
            }
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
            break;

        // ui/status messages
        case "flashStatusText":
            flashStatusText(msg.text, msg.durationMs);
            break;
        case "displayCameraSettings":
            showCameraInfoDialog((msg.text)?msg.text:"API call failed");
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

        el.classList.add('hold-button');
        el.dataset.action = X32_TAG + btn.signalId;

        if (btn.confirm == true) {
            el.classList.add('hold-button', 'button--prompt');
            el.dataset.holdMs = 1000;
            el.title = btn.helpText || "no help text defined";
        }
        // else { el.dataset.holdMs = 0; } // not needed as default = 0

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
        cell.textContent = `No presets configured.`;
        row.appendChild(cell);
        table.appendChild(row);
        container.appendChild(table);
    } else {
        const data = CAMERA_PRESETS
        data.forEach(preset => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td style="text-align:right">
                    ${preset.PresetNumber}
                </td>
                <td>
                    <button class="call-btn hold-button" 
                            data-action="callPreset"
                            data-id="${preset.PresetNumber}">
                        ${preset.PresetName}
                    </button>
                </td>
                <td>
                    <button class="set-btn hold-button"
                            data-action="setPreset"
                            data-id="${preset.PresetNumber}"
                            disabled>
                        Set ${preset.PresetNumber}
                    </button>
                </td>`;

            table.appendChild(row);
        });
        container.appendChild(table);

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

        el.classList.add('hold-button');
        el.dataset.action = OBS_TAG + btn.sceneName;
        // el.dataset.holdMs = 0; // not needed as default = 0

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

function showCameraInfoDialog(text) {
    myInfoDialogBox = EasyDialogBox.create("infoDialog", "dlg dlg-disable-clickout dlg-rounded", "Camera settings", text);
    myInfoDialogBox.addButton(
        "Copy to Clipboard",
        () => { navigator.clipboard.writeText(myInfoDialogBox.strMessage) },
        0
    );
    myInfoDialogBox.onClose = myInfoDialogBox.destroy;
    myInfoDialogBox.show()
}

async function showDailyCode() {
    const res = await fetch("/daily-code");
    let str;
    
    if (!res.ok) {
        if (res.status == 403) {
            str = `Login codes are not revealed on remote devices`;
        } else {
            str = res.statusText
        }
    } else {
        const dailyCode = await res.json();
        str = `Today's login code is <span style="font-size: 2rem;"><b>${dailyCode.code}</b></span>`;
    }
    flashStatusText(str);
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

    // other UI buttons
    for (const btn of OTHER_UI_ACTION_BUTTONS) {
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

        let value;
        const f = X32_STATE[fdr.signalId] || -1;
        if (f<0) {
            el.querySelector(".label").textContent = '?';
            return;
        }
        if (f >= 0.5) { value = (f * 40) - 30 }
        else if (f >= 0.25) { value = (f * 80) - 50 }
        else if (f >= 0.0625) { value = (f * 160) - 70 }
        else if (f >= 0) { value = (f * 480) - 90 }
        value = (f === 0) ? '-∞' : `${(value>0)?'+':''}${value.toFixed(1)}`;
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

    if (cameraFocusZoneId == null) {
        eid_selFocusZoneSelect.classList.add('stale');
    } else {
        eid_selFocusZoneSelect.value = String(cameraFocusZoneId); 
        eid_selFocusZoneSelect.classList.remove('stale');
    }

    eid_btnToggleAutoFocus.classList.remove("button--highlighted");
    eid_btnOnePushFocus.classList.remove("button--highlighted");    
    if (cameraFocusMode == "OP") {
        eid_btnOnePushFocus.classList.add("button--highlighted");
        eid_btnToggleAutoFocus.innerHTML = "Auto<br>Focus";
    } else if (cameraFocusMode == "AF") {
        eid_btnToggleAutoFocus.classList.add("button--highlighted");
        eid_btnToggleAutoFocus.innerHTML = `Focus:<br>${cameraFocusLocked ? "Locked" : "Auto"}`
    } else {
        eid_btnToggleAutoFocus.innerHTML = "Auto<br>Focus"; // un-highlighted
    }

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
    button.prepend(progressBar); // no obvious difference between prepend and append

    const progress = button.querySelector(".progress-bar");
    const holdMs = button.dataset.holdMs !== undefined ? Number(button.dataset.holdMs) : 0;
    const actionName = (button.dataset.action != undefined) ? button.dataset.action : "";
    const title = (button.title != undefined) ? button.title : "";
    const bypassHold = (button.dataset.bypassHold != undefined) || (holdMs <= 0);

    let raf = null;
    let timer = null;
    let startTime = 0;
    let armed = false;

    function reset() {
        armed = false;
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

    function onPointerUp() {
        if (armed) { runHoldAction(actionName, button); }
        reset();
    }

    function startHold(e) {
        if (button.disabled) {return };
        if (e.pointerType === "mouse" && e.button !== 0) { return; }; // if mouse, only accept left click

        if (bypassHold) {
            armed = true;
            return;
        }

        // show the title only if holdMs > 0
        if (title != "") { flashStatusText(`PRESS and HOLD... then RELEASE<br><i>${title}</i>`, (holdMs < 2000) ? 2000 : holdMs) };

        startTime = performance.now();
        raf = requestAnimationFrame(update);
        timer = setTimeout(() => {
            armed = true;
        }, holdMs);
    }

    if (bypassHold) { button.classList.add("hold-bypassed-button") }
    button.addEventListener("pointerdown", startHold);
    button.addEventListener("pointerup", onPointerUp);
    ["pointerleave", "pointercancel"].forEach(eventName => {
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
        'onePushWhiteBalance',
        'resetCamera',
        'restartCamera',
        'getCameraSettings'
    ];

    if (actionName.startsWith(X32_TAG)) {
        // handle X32 hold-button buttons (with confirm flag, e.g. initialise)
        const signalId = actionName.replace(X32_TAG, '');
        triggerX32Action(signalId);
    } else if (actionName.startsWith(OBS_TAG)) {
        const sceneName = actionName.replace(OBS_TAG, '');
        triggerOBSScene(sceneName);
    } else if (actionName == "callPreset") {
        // handle call camera preset
        const id = Number(button.dataset.id);
        socket.send(JSON.stringify({ type: "callCameraPreset", preset_id: id })); // App.Camera.callPreset(id);
        socket.send(JSON.stringify({ type: "enableSetCameraPreset", preset_id: id })); // enableSetButton(id); TODO is this needed
        socket.send(JSON.stringify({ type: "highlightCameraPreset", preset_id: id })); // //highlightCameraPreset(id);  also sets activePreset   
    } else if (actionName == "setPreset") {
        // handle set camera preset
        const id = Number(button.dataset.id);
        socket.send(JSON.stringify({
            type: "setCameraPreset",
            preset_id: id,
            preset_name: CAMERA_PRESETS.find(p => p.PresetNumber === id)?.PresetName
        }));
    } else if (allowedMessages.includes(actionName)) {
        // then other (obs & camera) buttons
        socket.send(JSON.stringify({ type: actionName }));
    } else {
        // then special buttons
        // TODO move resetcamera and restart camera here, so we can disable/enable camera action buttons
        switch (actionName) {
            case "setFocusZone":
                socket.send(JSON.stringify({ type: actionName, id: Number(eid_selFocusZoneSelect.value) }));
                break;
            case "showCode":
                showDailyCode();
                break;
            case "showHelp":
                console.log("PLACEHOLDER for actionName:", actionName);
                break;
            default:
                // report unknown action
                console.warn("Unknown hold action:", actionName);
        }
    }
    
    button.classList.remove("button--waiting");
    // TODO camera action buttons disableActionButtons('reset');
}

// ----------------------------------------------------
// START
// ----------------------------------------------------

initialise();