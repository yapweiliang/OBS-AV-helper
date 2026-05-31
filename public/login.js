const txtCode = document.getElementById("txtCode");
const btnLogin = document.getElementById("btnLogin");
const errorDiv = document.getElementById("error");

async function doLogin() {

    errorDiv.textContent = "";

    const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: txtCode.value })
    });

    const data = await response.json();

    if (!data.success) {
        errorDiv.textContent = "Invalid code";
        txtCode.select();
        return;
    }

    //
    // authenticated
    //

    window.location.href = "/";
}

btnLogin.addEventListener("click", doLogin);

txtCode.addEventListener("keydown", event => {
    if (event.key === "Enter") { doLogin(); }
});