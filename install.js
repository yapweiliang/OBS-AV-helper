#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const readline = require("readline");

const { execSync } = require("child_process");
const { pipeline } = require("stream/promises");
const { settings } = require("cluster");
const { start } = require("repl");

function isAdmin() {
    try {
        execSync("net session", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

// CONFIG
const USER = "yapweiliang";
const REPO = "OBS-AV-helper";
const SERVICE_NAME = "av-helper";

const INSTALL_DIR = path.join( process.env.USERPROFILE || os.homedir(), "OneDrive", "av-shared", "OBS AV Helper" );

// ARGUMENTS
const version = process.argv[2] || "latest";

// HELPER FUNCTIONS
let isProbablyFresh = false;

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question + ": ", answer => {
            rl.close();
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
    if (isAdmin()) {
        console.log("*** Running as administrator ***")
    } else {
        console.log("*** WARNING: not running as administrator ****")
    }
    console.log("----------------------------------------------");
    console.log("To install specific version e.g. v1.2.3 run as\n> node install.js v1.2.3");
    console.log("\nRequirements");
    console.log(" - nssm.exe is in the PATH\n - This installer is run as administrator");
    console.log("----------------------------------------------");
    console.log("For fresh installation, OBS password is needed")
    console.log("==============================================");
    console.log("Install directory:", INSTALL_DIR);
    console.log("Requested version:", version);
    console.log("Version to install:", actualVersion);

    await stepOrAbort("Proceed with installation (each step requires 'y' to continue)", async () => {/* do nothing */});

    const logPath = path.join(INSTALL_DIR, "logs");
    const logFile = path.join(logPath, "av-helper.log");
    let extractPath = null;
    let tempRoot = null;

    // DOWNLOAD & EXTRACT & INITIALISE CONFIG/ENV
    await stepOrAbort(`Download & extract the following to temp folder\n${zipUrl} `, async () => {
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
            isProbablyFresh = true;
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

    // STOP SERVICE
    // - npm ci might fail if service is running
    // - ok to stop here, as our server.js does not keep any files open
    const nssm_stop = `nssm stop ${SERVICE_NAME}`
    if (isProbablyFresh) {
        console.log("The server must be stopped before update")
    }
    await stepOrAbort(`Stop ${SERVICE_NAME} service${isAdmin() ? "" : " (requires administrator priviledge)"}`, async () => {
        try { await run(nssm_stop); } catch { }
    })

    // COPY FILES & CREATE LOGS FOLDER
    await stepOrAbort(`Copy to install directory ${INSTALL_DIR}`, async () => {
        fs.mkdirSync(INSTALL_DIR, { recursive: true });
        fs.cpSync(extractPath, INSTALL_DIR, { recursive: true });
        fs.mkdirSync(logPath, { recursive: true }); // NSSM needs folder to exist
    });

    // NPM INSTALL
    await stepOrAbort(`Install node dependancies\n(Please don't worry about the vulnerability warnings)\nRun "npm ci" in ${INSTALL_DIR}`, async () => {
        run("npm ci", { cwd: INSTALL_DIR });
    });

    // NSSM
    const nodePath = "C:\\Program Files\\nodejs\\node.exe";
    const serverPath = path.join("server.js"); // NSSM doesn't like spaces in the arguments

    const nssm_install = `nssm install ${SERVICE_NAME} "${nodePath}" "${serverPath}"`;

    const nssm_settings_set = []
    nssm_settings_set[0] = `nssm set ${SERVICE_NAME} AppDirectory "${INSTALL_DIR}"`;
    nssm_settings_set[1] = `nssm set ${SERVICE_NAME} AppStdout "${logFile}"`;
    nssm_settings_set[2] = `nssm set ${SERVICE_NAME} AppStderr "${logFile}"`;
    nssm_settings_set[3] = `nssm set ${SERVICE_NAME} AppRotateFiles 1`;

    const nssm_start = `nssm start ${SERVICE_NAME}`

    const nssm_remove_set = []
    nssm_remove_set[0] = `nssm stop ${SERVICE_NAME}`;
    nssm_remove_set[1] = `nssm remove ${SERVICE_NAME} confirm`;

    console.log("The following need to be run with administrator priviledge:")
    console.log("\nFor fresh (new) installation:")
    console.log(">", nssm_install);
    nssm_settings_set.forEach( element => {console.log(">",element)});

    console.log("\nFor clean upgrade:")
    nssm_remove_set.forEach( element => {console.log(">",element)});
    console.log(">", nssm_install);
    nssm_settings_set.forEach( element => {console.log(">",element)});

    console.log("\nFor most upgrades:")
    console.log(">", nssm_start, "(restart, as service will need to be stopped before upgrade)");

    if (isAdmin()) {
        await stepOrSkip("proceed with nssm setup", async () => {
            if (isProbablyFresh) {
            } else {
                for (const element of nssm_remove_set) {
                    try { await run(element); } catch { }
                }
            }

            try { await run(nssm_install); } catch { }

            for (const element of nssm_settings_set) {
                try { await run(element); } catch { }
            }

            await stepOrSkip(nssm_start, async () => {
                try { await run(nssm_start); } catch { }
            })
        })
    } else {
        console.log("Please re-run this installer with elevated priviledges or do the above yourself");
    }

    // SUMMARISE
    console.log("\n==============================================");
    console.log("INSTALL COMPLETE");
    console.log("Version:", actualVersion);
    console.log("Location:", INSTALL_DIR);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    console.log("Removed temp folder:", tempRoot);
    console.log("==============================================\n");

    await stepOrSkip("Test the installation.  Open app (http://localhost:3000) in browser (assuming port was not changed from default of 3000)", async () => {
        try { await run("start http://localhost:3000")} catch { }
    })

})();