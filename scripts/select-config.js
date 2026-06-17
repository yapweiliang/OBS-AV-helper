const os = require("os");
const fs = require("fs");
const path = require("path");

const PROD_PREFIX = "192.168.32.";
const DEV_PREFIX = "192.168.22.";

const PROD_CONFIG = "config.prod.js";
const DEV_CONFIG = "config.dev.js";
const RUNNING_CONFIG = "config.js";

let selectedConfig = null;

for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
        if (addr.family !== "IPv4" || addr.internal) continue;

        console.log(`Found IP: ${addr.address}`);

        if (addr.address.startsWith(PROD_PREFIX)) {
            selectedConfig = PROD_CONFIG;
            break;
        }

        if (addr.address.startsWith(DEV_PREFIX)) {
            selectedConfig = DEV_CONFIG;
            break;
        }
    }

    if (selectedConfig) break;
}

if (!selectedConfig) {
    console.error("ERROR: Could not determine site from IP address");
    process.exit(1);
}

const source = path.join(__dirname, "..", "configs", selectedConfig);
const dest = path.join(__dirname, "..", "config", RUNNING_CONFIG);

fs.copyFileSync(source, dest);

console.log(`Using ${selectedConfig}`);