const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const files = [
  "manifest.json",
  "src/tokenizer.js",
  "src/core.js",
  "src/dom.js",
  "src/conversation.js",
  "src/content.js",
  "src/styles.css",
  "assets/icon.svg",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "README.md",
  "LICENSE",
];

fs.rmSync(dist, { recursive: true, force: true });
const tokenizerSource = path.join(root, "node_modules", "gpt-tokenizer", "dist", "o200k_base.js");
if (!fs.existsSync(tokenizerSource)) {
  throw new Error("Missing gpt-tokenizer. Run npm ci before building.");
}
const tokenizerDestination = path.join(dist, "vendor", "o200k_base.js");
fs.mkdirSync(path.dirname(tokenizerDestination), { recursive: true });
fs.copyFileSync(tokenizerSource, tokenizerDestination);

for (const file of files) {
  const source = path.join(root, file);
  const destination = path.join(dist, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`PASS: built unpacked extension in ${dist}`);