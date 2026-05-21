let socket;

let buttons = [];

let pendingButton = null;

async function initialise() {

    const response =
        await fetch("/api/config");

    const config =
        await response.json();

    buttons = config.buttons;

    createButtons();

    connectWebSocket();
}

function connectWebSocket() {

    socket =
        new WebSocket(
            `ws://${location.host}`
        );

    socket.addEventListener(
        "message",
        onMessage
    );
}

function onMessage(event) {

    const data =
        JSON.parse(event.data);

    if (
        data.type ===
        "actionComplete"
    ) {

        flashButton(
            data.buttonId
        );
    }
}

function createButtons() {

    const container =
        document.getElementById(
            "buttons"
        );

    buttons.forEach(button => {

        const element =
            document.createElement(
                "button"
            );

        element.id =
            button.id;

        element.className =
            "control-button";

        element.textContent =
            button.label;

        element.addEventListener(
            "click",
            () => onButtonClick(button)
        );

        container.appendChild(
            element
        );
    });
}

function onButtonClick(button) {

    if (button.confirm) {

        pendingButton = button;

        showConfirm();

        return;
    }

    sendAction(button);
}

function sendAction(button) {

    socket.send(
        JSON.stringify({
            type: "action",
            buttonId: button.id
        })
    );
}

function flashButton(buttonId) {

    const button =
        document.getElementById(
            buttonId
        );

    button.classList.add(
        "flash"
    );

    setTimeout(() => {

        button.classList.remove(
            "flash"
        );

    }, 3000);
}

function showConfirm() {

    document
        .getElementById(
            "confirmDialog"
        )
        .classList
        .remove("hidden");
}

function hideConfirm() {

    document
        .getElementById(
            "confirmDialog"
        )
        .classList
        .add("hidden");
}

document
    .getElementById(
        "confirmYes"
    )
    .addEventListener(
        "click",
        () => {

            sendAction(
                pendingButton
            );

            hideConfirm();
        }
    );

document
    .getElementById(
        "confirmNo"
    )
    .addEventListener(
        "click",
        hideConfirm
    );

initialise();