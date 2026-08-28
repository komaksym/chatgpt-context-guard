const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = [
  "src/tokenizer.js",
  "src/core.js",
  "src/dom.js",
  "src/conversation.js",
  "src/content.js",
  "tests/core.test.js",
  "tests/dom.test.js",
  "tests/conversation.test.js",
  "tests/extension.test.js",
  "tests/hit-testing.test.js",
  "tests/browser.test.js",
  "scripts/check.js",
  "scripts/build.js",
];

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required file: ${file}`);
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest.json must use Manifest V3");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.version !== packageJson.version) throw new Error("manifest and package versions must match");
if (packageJson.devDependencies?.["gpt-tokenizer"] !== "3.4.0") {
  throw new Error("gpt-tokenizer must stay pinned to 3.4.0");
}
if (manifest.permissions.some((permission) => permission !== "storage")) {
  throw new Error("Unexpected extension permission");
}

console.log(`PASS: checked ${files.length} JavaScript files and manifest permissions`);
