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
  assert.deepEqual(manifest.content_scripts[0].js, ["src/core.js", "src/dom.js", "src/content.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
  for (const icon of Object.values(manifest.icons)) {
    assert.equal(fs.existsSync(path.join(root, icon)), true, `missing icon: ${icon}`);
  }
});

test("content script uses the testable DOM adapter and avoids broad composer matching", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  assert.match(source, /ContextGuardDom/);
  assert.match(source, /findConversationRoot/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /chrome\.storage\.sync/);
  assert.match(source, /pendingCheckpoint/);
  assert.doesNotMatch(source, /textarea\[placeholder\]/);
  assert.doesNotMatch(source, /latest\.length\s*>\s*80/);
  assert.doesNotMatch(source, /observe\(document\.body/);
  assert.doesNotMatch(source, /XMLHttpRequest|window\.fetch\s*=|webRequest/);
});

test("widget explains hidden context limits and follows explicit document theme", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
  assert.match(source, /Hidden system, tool, and reasoning context/);
  assert.match(source, /server limits, and compaction are unknown/);
  assert.match(source, /data-theme/);
  assert.match(styles, /data-theme="dark"/);
  assert.match(styles, /prefers-color-scheme:\s*dark/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
});

test("repository contains deterministic browser fixture and automation", () => {
  assert.equal(fs.existsSync(path.join(root, "tests/fixture.html")), true);
  assert.equal(fs.existsSync(path.join(root, "tests/browser.test.js")), true);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(typeof packageJson.scripts["test:browser"], "string");
});
