const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("manifest is a minimal MV3 ChatGPT-only content extension", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.2.3");
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
  assert.match(source, /const CACHE_VERSION = 2/);
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

test("content refresh is event-driven and stale extension instances shut down cleanly", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  assert.doesNotMatch(source, /REFRESH_INTERVAL_MS|RETRY_DELAY_MS|lastFullRefreshAt|nextRetryAt/);
  assert.match(source, /createExtensionRuntime\(\{ onInvalidate: shutdown \}\)/);
  assert.match(source, /function chromeCall\(/);
  assert.match(source, /clearInterval\(heartbeatTimer\)/);
  assert.match(source, /conversationObserver\.disconnect\(\)/);
  assert.match(source, /themeObserver\.disconnect\(\)/);
  assert.match(source, /host\.remove\(\)/);
  assert.match(source, /if \(wasGenerating && !generating\) void refreshFullEstimate\(\)/);
  assert.match(source, /activeConversationId === conversationId\) await refreshFullEstimate\(\)/);

  const heartbeat = source.match(/heartbeatTimer\s*=\s*setInterval\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*1_000\)/);
  assert.ok(heartbeat, "expected local route/root heartbeat");
  assert.doesNotMatch(heartbeat[1], /refreshFullEstimate/);
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

test("widget defaults to the compact token-count pill and expands on demand", () => {
  const source = fs.readFileSync(path.join(root, "src/content.js"), "utf8");
  assert.match(source, /<button class="collapsed" type="button" aria-label="Expand context estimate">/);
  assert.match(source, /<div class="panel" hidden>/);
  assert.match(source, /elements\.collapsedCount\.textContent\s*=\s*presentation\.count/);
  assert.match(source, /elements\.panel\.hidden = false/);
  assert.match(source, /elements\.collapsed\.hidden = true/);
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
  assert.match(source, /Estimated textual active-branch history versus a configurable context window/);
  assert.match(source, /Context not exposed by ChatGPT, exact model input/);
  assert.match(source, /server-side truncation, and compaction remain unknown/);
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
