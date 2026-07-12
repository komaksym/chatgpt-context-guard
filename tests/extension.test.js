const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest is a minimal MV3 ChatGPT-only content extension", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions.sort(), ["https://chat.openai.com/*", "https://chatgpt.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/core.js", "src/content.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
  for (const icon of Object.values(manifest.icons)) {
    assert.equal(fs.existsSync(path.join(root, icon)), true, `missing icon: ${icon}`);
  }
});

test("content script uses visible message roles and does not intercept network APIs", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  assert.match(source, /data-message-author-role/);
  assert.match(source, /#prompt-textarea/);
  assert.match(source, /attachShadow/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /chrome\.storage\.sync/);
  assert.match(source, /pendingCheckpoint/);
  assert.doesNotMatch(source, /XMLHttpRequest|window\.fetch\s*=|webRequest/);
});

test("styles include accessible state, warning, dark-mode, and reduced-motion treatments", () => {
  const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
  assert.match(styles, /data-level="warning"/);
  assert.match(styles, /data-level="critical"/);
  assert.match(styles, /prefers-color-scheme:\s*dark/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
});
