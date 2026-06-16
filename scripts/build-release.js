const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const manifestPath = path.join(process.cwd(), "release-manifest.json");

if (!fs.existsSync(manifestPath)) {
    console.error("Missing release-manifest.json");
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const output = manifest.output || "release.zip";

// Clean old zip if exists
if (fs.existsSync(output)) {
    fs.unlinkSync(output);
}

// Build include list
const includes = manifest.files.join(" ");

// Build ignore list
const ignores = (manifest.ignore || [])
    .map(pattern => `-x "${pattern}"`)
    .join(" ");

// Final zip command
const cmd = `zip -r ${output} ${includes} ${ignores}`;

console.log("Running release build:");
console.log(cmd);

try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`\n✅ Release created: ${output}`);
} catch (err) {
    console.error("❌ Release build failed");
    process.exit(1);
}