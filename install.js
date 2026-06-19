#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const readline = require("readline");

const { execSync } = require("child_process");
const { pipeline } = require("stream/promises");

// CONFIG
const USER = "yapweiliang";
const REPO = "OBS-AV-helper";
const SERVICE_NAME = "av-helper";

const INSTALL_DIR = path.join( process.env.USERPROFILE || os.homedir(), "OneDrive", "AV", "av-helper" );

// ARGUMENTS
const version = process.argv[2] || "latest";

// HELPER FUNCTIONS
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => {
        rl.question(question + ": ", answer => {
            resolve(answer);
        });
    });
}

async function step(question, abort, action) {
    const ok = await ask(`\n${question} [Y/N${abort ? "=abort" : "=skip"}]`);

    if (ok.toLowerCase() === "y") {
        await action();
    } else {
        if (abort) {
        console.log("Aborted.");
        process.exit(0);
        } else {
        console.log("Skipped.");
        }
    }
}

async function stepOrAbort(question, action) {
    await step(question, true, action);
}

async function stepOrSkip(question, action) {
    await step(question, false, action);
}

function run(cmd, options = {}) {
    try {
        execSync(cmd, { stdio: "inherit", ...options });
    } catch (err) {
        console.error(`\nCommand failed:\n${cmd}\n`);
        // throw err;
    }
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                "User-Agent": "av-helper-installer",
                "Accept": "application/vnd.github+json"
            }
        }, res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`GitHub API error: ${res.statusCode}`));
                return;
            }

            let data = "";

            res.on("data", c => data += c);

            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });

        }).on("error", reject);
    });
}

async function downloadFile(url, dest) {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    await pipeline(res.body, fs.createWriteStream(dest));
}


// =========================== MAIN ===========================
(async () => {

    // FETCH RELEASE
    let release;

    try {
        if (version === "latest") {
            release = await getJson( `https://api.github.com/repos/${USER}/${REPO}/releases/latest` );
        } else {
            release = await getJson( `https://api.github.com/repos/${USER}/${REPO}/releases/tags/${version}` );
        }
    } catch (err) {
        console.error("\nFailed to fetch GitHub release.");
        console.error(`Please check version "${version}" exists and network is available.`);
        //throw err;
    }

    if (!release || !release.assets) {
        console.error("Invalid release response.");
        process.exit(1);
    }

    const actualVersion = release.tag_name;

    const asset = release.assets.find(a => a.name === "av-helper.zip");

    if (!asset) {
        console.error("ERROR: av-helper.zip not found in release");
        process.exit(1);
    }

    const zipUrl = asset.browser_download_url;

    console.log("\n==============================================");
    console.log("OBS AV HELPER INSTALLER/UPDATER");
    console.log("==============================================");
    console.log("Requires nssm.exe to be in the PATH");
    console.log("To install specific version e.g. v1.2.3 run as\n>node install.js v1.2.3");
    console.log("==============================================");
    console.log("Install directory:", INSTALL_DIR);
    console.log("Requested version:", version);
    console.log("Version to install:", actualVersion);

    await stepOrAbort("Proceed with installation (each step requires 'y' to continue)", async () => {/* do nothing */});

    let extractPath = null;
    let tempRoot = null;

    // DOWNLOAD & EXTRACT & INITIALISE CONFIG/ENV
    await stepOrAbort(`Download & extract ${zipUrl} to temp folder`, async () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "av-helper-"));
        const zipPath = path.join(tempRoot, "av-helper.zip");
        extractPath = path.join(tempRoot, "extract");
        fs.mkdirSync(extractPath);

        await downloadFile(zipUrl, zipPath);
        run(`powershell -Command "Expand-Archive -Force '${zipPath}' '${extractPath}'"`);
        console.log(`Extracted to ${extractPath}`)

        // ENV management
        const incomingEnv = path.join(extractPath, ".env.example");
        const existingEnv = path.join(INSTALL_DIR, ".env");

        if (fs.existsSync(existingEnv)) {
            console.log("Existing .env file left intact.")
        } else {
            const obsPassword = await ask("Please enter the OBS WebSocket password.\n(You can find this in OBS Settings → WebSocket Server Settings.)\nOBS_PASSWORD");
            let envFile = fs.readFileSync(incomingEnv, "utf8");
            envFile = envFile.replace(
                /^SESSION_SECRET=.*$/m,
                `SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}`
            );
            envFile = envFile.replace(
                /^AUTH_SECRET=.*$/m,
                `AUTH_SECRET=${crypto.randomBytes(32).toString("hex")}`
            );
            envFile = envFile.replace(
                /^OBS_PASSWORD=.*$/m,
                `OBS_PASSWORD=${obsPassword}`
            );
            fs.writeFileSync(incomingEnv, envFile);
            fs.renameSync(incomingEnv, path.join(extractPath, ".env"));
            console.log("New .env file created from .env.example")
            console.log(`\n${envFile}\n`);
        }

        // CONFIG management
        const incomingConfig = path.join(extractPath, "config", "config.js");
        const existingConfig = path.join(INSTALL_DIR, "config", "config.js");

        if (fs.existsSync(existingConfig)) {
            fs.renameSync(incomingConfig, path.join(extractPath, "config", "config.new.js"));
            console.log("Incoming config.js renamed as config.new.js so that existing config.js is not touched");

            await stepOrSkip("Backup existing config", async () => {
                if (fs.existsSync(existingConfig)) {
                    const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
                    const backup = path.join(INSTALL_DIR, "config", `config.previous.${ts}.js`);
                    fs.copyFileSync(existingConfig, backup);
                    console.log("Backed up config:", backup);
                }
            })
        }
    });

    // COPY FILES
    await stepOrAbort(`Copy to install directory ${INSTALL_DIR}`, async () => {
        fs.mkdirSync(INSTALL_DIR, { recursive: true });
        fs.cpSync(extractPath, INSTALL_DIR, { recursive: true });
    });

    // NPM INSTALL
    await stepOrAbort(`Install node dependancies\n(Please don't worry about the vulnerability warnings)\nRun "npm ci" in ${INSTALL_DIR}`, async () => {
        run("npm ci", { cwd: INSTALL_DIR });
    });

    // NSSM
    const nodePath = "C:\\Program Files\\nodejs\\node.exe";
    const serverPath = path.join(INSTALL_DIR, "server.js");

    await stepOrSkip(`Configure Windows service\n1. nssm stop ...\n2. nssm remove ...\n3. nssm install ...\n4. nssm set ...\n${SERVICE_NAME} "${nodePath}" "${serverPath}"\nProceed?`, async () => {
        try { run(`nssm stop ${SERVICE_NAME}`); } catch { } // TODO consider whether to stop service before copying files
        try { run(`nssm remove ${SERVICE_NAME} confirm`); } catch { }
        try { run(`nssm install ${SERVICE_NAME} "${nodePath}" "${serverPath}"`); } catch { }
        try { run(`nssm set ${SERVICE_NAME} AppDirectory "${INSTALL_DIR}"`); } catch { }
    });

    // START SERVICE
    await stepOrSkip(`Start service (nssm start ${SERVICE_NAME})`, async () => {
        try { run(`nssm start ${SERVICE_NAME}`); } catch {}
    });

    // SUMMARISE
    console.log("\n==============================================");
    console.log("INSTALL COMPLETE");
    console.log("Version:", actualVersion);
    console.log("Location:", INSTALL_DIR);
    console.log("==============================================\n");

    // CLEANUP
    await stepOrSkip(`Clean up temp folder ${tempRoot}`, async () => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    rl.close();
})();