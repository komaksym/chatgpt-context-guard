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
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/core.js",
    "src/dom.js",
    "src/conversation.js",
    "src/content.js",
  ]);
  assert.equal(manifest.content_scripts[0].run_at, "document_idle");
  for (const icon of Object.values(manifest.icons)) {
    assert.equal(fs.existsSync(path.join(root, icon)), true, `missing icon: ${icon}`);
  }
});

test("content script uses full conversation estimates without weakening checkpoint DOM binding", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  assert.match(source, /ContextGuardDom/);
  assert.match(source, /ContextGuardConversation/);
  assert.match(source, /fetchActiveConversation/);
  assert.match(source, /conversationEstimateCache/);
  assert.match(source, /conversationMessages\(\)/);
  assert.match(source, /findConversationRoot/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /chrome\.storage\.sync/);
  assert.match(source, /pendingCheckpoint/);
  assert.doesNotMatch(source, /textarea\[placeholder\]/);
  assert.doesNotMatch(source, /latest\.length\s*>\s*80/);
  assert.doesNotMatch(source, /observe\(document\.body/);
  assert.doesNotMatch(source, /XMLHttpRequest|window\.fetch\s*=|webRequest/);
});

test("conversation adapter keeps authentication ephemeral and follows the active branch", () => {
  const source = fs.readFileSync(path.join(root, "src/conversation.js"), "utf8");
  assert.match(source, /\/api\/auth\/session/);
  assert.match(source, /\/backend-api\/conversation\//);
  assert.match(source, /Authorization/);
  assert.match(source, /current_node/);
  assert.match(source, /node\.parent/);
  assert.doesNotMatch(source, /chrome\.storage|localStorage|sessionStorage/);
});

test("widget shows Codex-style context-window usage while keeping estimate provenance honest", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
  assert.match(source, />Context window</);
  assert.match(source, /usage-percent/);
  assert.match(source, /usage-left/);
  assert.match(source, /context-limit/);
  assert.match(source, /contextWindowTokens/);
  assert.match(source, /contextWindowUsage/);
  assert.match(source, /thresholdsForContextWindow/);
  assert.match(source, /Complete active branch estimate/);
  assert.match(source, /Cached complete active branch estimate; refresh unavailable/);
  assert.match(source, /Partial — only currently loaded messages counted/);
  assert.match(source, /Estimated active user\/assistant history versus a configurable context window/);
  assert.match(source, /Hidden system, tool, and reasoning context, exact model input/);
  assert.match(source, /server-side truncation, and compaction are unknown/);
  assert.match(source, /data-theme/);
  assert.match(styles, /usage-summary/);
  assert.match(styles, /data-theme="dark"/);
  assert.match(styles, /prefers-color-scheme:\s*dark/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
});

test("repository contains deterministic browser fixture and builds the conversation adapter", () => {
  assert.equal(fs.existsSync(path.join(root, "tests/fixture.html")), true);
  assert.equal(fs.existsSync(path.join(root, "tests/browser.test.js")), true);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(typeof packageJson.scripts["test:browser"], "string");
  const build = fs.readFileSync(path.join(root, "scripts/build.js"), "utf8");
  assert.match(build, /src\/conversation\.js/);
});