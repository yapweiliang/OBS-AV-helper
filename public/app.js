let CONFIG = null;
let STATE = {};
let socket = null;

// ----------------------------------------------------
// INIT
// ----------------------------------------------------

async function initialise() {

    CONFIG = await loadConfig();

    renderButtons();

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

        switch (msg.type) {

            case "state":
                STATE = msg.state;
                renderState();
                break;
        }
    };
}

// ----------------------------------------------------
// UI RENDER
// ----------------------------------------------------

function renderButtons() {

    const container = document.getElementById("buttons");
    container.innerHTML = "";

    for (const btn of CONFIG.buttons) {

        const el = document.createElement("button");

        el.id = btn.id;
        el.textContent = btn.label;

        el.onclick = () => trigger(btn);

        container.appendChild(el);
    }
}

// ----------------------------------------------------
// STATE → UI BINDING
// ----------------------------------------------------

function renderState() {

    for (const btn of CONFIG.buttons) {

        const el = document.getElementById(btn.id);
        if (!el) continue;

        const value = STATE[btn.action];

        applyToggleState(el, value);
    }
}

// ----------------------------------------------------
// UI STATE RULES (centralised)
// ----------------------------------------------------

function applyToggleState(el, value) {

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
// ACTIONS
// ----------------------------------------------------

async function trigger(btn) {

    try {

        await fetch(`/action/${btn.action}`, {
            method: "POST"
        });

        flashButton(btn.id);

    } catch (err) {

        console.error(err);
    }
}

// ----------------------------------------------------
// VISUAL FEEDBACK
// ----------------------------------------------------

function flashButton(id) {

    const el = document.getElementById(id);

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