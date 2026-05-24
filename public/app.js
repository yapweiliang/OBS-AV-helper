let CONFIG = null;

async function initialise() {

    console.log("Loading config...");

    const response =
        await fetch("/api/config");

    if (!response.ok) {
        throw new Error("Failed to load config");
    }

    CONFIG = await response.json();

    renderButtons();
}

function renderButtons() {

    const container =
        document.getElementById("buttons");

    container.innerHTML = "";

    for (const btn of CONFIG.buttons) {

        const button =
            document.createElement("button");

        button.id = btn.id;
        button.textContent = btn.label;

        button.onclick = () => {

            handleButton(btn);
        };

        container.appendChild(button);
    }
}

async function handleButton(btn) {

    console.log("Pressed:", btn.action);

    try {

        const response =
            await fetch(
                `/action/${btn.action}`,
                { method: "POST" }
            );

        const result =
            await response.json();

        console.log("Result:", result);

        // simple visual feedback
        flashButton(btn.id);

    } catch (err) {

        console.error(
            "Action failed:",
            err
        );
    }
}

function flashButton(id) {

    const el =
        document.getElementById(id);

    if (!el) return;

    el.style.opacity = 0.4;

    setTimeout(() => {
        el.style.opacity = 1;
    }, 300);
}

// start
initialise();