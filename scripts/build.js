const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const files = [
  "manifest.json",
  "src/core.js",
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
for (const file of files) {
  const source = path.join(root, file);
  const destination = path.join(dist, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`PASS: built unpacked extension in ${dist}`);
