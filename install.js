#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
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

function promptStepOrExit(question, autoExit = true) {
    return new Promise(resolve => {
        process.stdout.write(`\n${question} [Y/N]: `);
        process.stdin.resume();
        process.stdin.once("data", data => {
            process.stdin.pause();
            const answer = (data.toString().trim().toLowerCase() === "y");

            if (autoExit && !answer) {
                process.exit(0)
            }
            resolve(answer)
        });
    });
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

/**
 * ==============================
 * MAIN
 * ==============================
 */
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

    await promptStepOrExit("Proceed with installation (each step requires 'y' to continue, otherwise the install process will stop)");

    // DOWNLOAD & EXTRACT
    await promptStepOrExit(`Download & extract ${zipUrl} to temp folder`);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "av-helper-"));
    const zipPath = path.join(tempRoot, "av-helper.zip");
    const extractPath = path.join(tempRoot, "extract");
    fs.mkdirSync(extractPath);

    await downloadFile(zipUrl, zipPath);
    run( `powershell -Command "Expand-Archive -Force '${zipPath}' '${extractPath}'"` );
    console.log(`Extracted to ${extractPath}`)

    // BACKUP CONFIG
    const incomingConfig = path.join(extractPath, "config", "config.js");
    const existingConfig = path.join(INSTALL_DIR, "config", "config.js");

    if (fs.existsSync(existingConfig)) {
        fs.renameSync(incomingConfig, path.join(extractPath, "config", "config.new.js"));
        console.log("Incoming config.js renamed as config.new.js so that existing config.js is not touched");

        if (await promptStepOrExit("Backup existing config ('N' will continue without backing up)", false)) {
            if (fs.existsSync(existingConfig)) {
                const ts = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
                const backup = path.join(INSTALL_DIR, "config", `config.previous.${ts}.js`);
                fs.copyFileSync(existingConfig, backup);
                console.log("Backed up config:", backup);
            }
        };
    }

    // COPY FILES
    await promptStepOrExit(`Copy to install directory ${INSTALL_DIR}`);
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    fs.cpSync(extractPath, INSTALL_DIR, { recursive: true });

    // NPM INSTALL
    await promptStepOrExit(`Install node dependancies\n(Please don't worry about the vulnerability warnings)\nRun "npm ci" in ${INSTALL_DIR}`);
    run("npm ci", { cwd: INSTALL_DIR });

    // NSSM
    const nodePath = "C:\\Program Files\\nodejs\\node.exe";
    const serverPath = path.join(INSTALL_DIR, "server.js");

    await promptStepOrExit(`Configure Windows service\n1. nssm stop ${SERVICE_NAME}\n2. nssm remove ${SERVICE_NAME}\n3. nssm install ${SERVICE_NAME} "${nodePath}" "${serverPath}"\nProceed?`);

    try { run(`nssm stop ${SERVICE_NAME}`); } catch {} // TODO consider whether to stop service before copying files
    try { run(`nssm remove ${SERVICE_NAME} confirm`); } catch {}
    try { run(`nssm install ${SERVICE_NAME} "${nodePath}" "${serverPath}"`); } catch {}
    try { run(`nssm set ${SERVICE_NAME} AppDirectory "${INSTALL_DIR}"`); } catch {}

    // START SERVICE
    await promptStepOrExit(`Start service (nssm start ${SERVICE_NAME})`);
    try { run(`nssm start ${SERVICE_NAME}`); } catch {}

    // SUMMARISE
    console.log("\n==============================================");
    console.log("INSTALL COMPLETE");
    console.log("Version:", actualVersion);
    console.log("Location:", INSTALL_DIR);
    console.log("==============================================\n");

    // CLEANUP
    await promptStepOrExit(`Clean up temp folder ${tempRoot}`);
    fs.rmSync(tempRoot, { recursive: true, force: true });

})();