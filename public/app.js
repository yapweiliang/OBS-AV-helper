let CONFIG = null;
let STATE = {};
let socket = null;

async function initialise() {

    console.log("Loading config...");

    const response = await fetch("/api/config");

    if (!response.ok) {
        throw new Error("Failed to load config");
    }

    CONFIG = await response.json();

    renderButtons();
    initWebSocket();
}

// ----------------------------------------------------
// WebSocket
// ----------------------------------------------------

function initWebSocket() {

    socket = new WebSocket(`ws://${window.location.host}`);

    socket.onopen = () => {
        console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {

        const msg = JSON.parse(event.data);

        if (msg.type === "state") {

            STATE = msg.state;

            updateButtons();
        }
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected");
    };
}

// ----------------------------------------------------
// UI render
// ----------------------------------------------------

function renderButtons() {

    const container = document.getElementById("buttons");
    container.innerHTML = "";

    for (const btn of CONFIG.buttons) {

        const button = document.createElement("button");

        button.id = btn.id;
        button.textContent = btn.label;

        button.onclick = () => handleButton(btn);

        container.appendChild(button);
    }
}

// ----------------------------------------------------
// UI update (NEW)
// ----------------------------------------------------

function updateButtons() {

    for (const btn of CONFIG.buttons) {

        const el = document.getElementById(btn.id);
        if (!el) continue;

        const value = STATE[btn.action];

        if (value === true) {
            el.classList.add("toggle-on");
            el.classList.remove("toggle-off");
        } else if (value === false) {
            el.classList.add("toggle-off");
            el.classList.remove("toggle-on");
        } else {
            el.classList.remove("toggle-on");
            el.classList.remove("toggle-off");
        }
    }
}

// ----------------------------------------------------
// Actions
// ----------------------------------------------------

async function handleButton(btn) {

    console.log("Pressed:", btn.action);

    try {

        const response = await fetch(
            `/action/${btn.action}`,
            { method: "POST" }
        );

        const result = await response.json();

        console.log("Result:", result);

        flashButton(btn.id);

    } catch (err) {

        console.error("Action failed:", err);
    }
}

// ----------------------------------------------------
// Flash feedback (unchanged)
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
// start
// ----------------------------------------------------

initialise();