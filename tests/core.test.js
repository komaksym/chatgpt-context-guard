const { countTokens } = require("gpt-tokenizer/encoding/o200k_base");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_THRESHOLDS,
  classifyUsage,
  contextWindowUsage,
  createCheckpointPrompt,
  createExtensionRuntime,
  estimateTextTokens,
  estimateTranscriptTokens,
  formatTokenCount,
  isExtensionContextInvalidatedError,
  normalizeContextWindowTokens,
  normalizeThresholds,
  thresholdsForContextWindow,
} = require("../src/core.js");

test("uses the pinned o200k tokenizer instead of a character heuristic", () => {
  assert.equal(estimateTextTokens(""), 0);
  for (const value of ["hello world", "a".repeat(400), "{\"query\":\"weather in 東京\"}"]) {
    assert.equal(estimateTextTokens(value), countTokens(value));
  }
  assert.notEqual(estimateTextTokens("hello world"), Math.ceil("hello world".length / 4));
});

test("tokenizes non-English text with the same o200k vocabulary", () => {
  assert.equal(estimateTextTokens("你好世界"), countTokens("你好世界"));
  assert.equal(estimateTextTokens("hello 世界"), countTokens("hello 世界"));
});

test("aggregates only visible user and assistant transcript text for the DOM fallback", () => {
  const user = "a".repeat(40);
  const assistant = "b".repeat(80);
  const messages = [
    { role: "user", text: user },
    { role: "assistant", text: assistant },
    { role: "tool", text: "c".repeat(400) },
  ];
  assert.equal(estimateTranscriptTokens(messages), countTokens(user) + countTokens(assistant));
});

test("reports Codex-style used and remaining context against the 258K default", () => {
  assert.equal(DEFAULT_CONTEXT_WINDOW_TOKENS, 258_000);
  assert.deepEqual(contextWindowUsage(48_000), {
    usedTokens: 48_000,
    contextWindowTokens: 258_000,
    remainingTokens: 210_000,
    usedPercent: 18,
    leftPercent: 82,
    ratio: 48_000 / 258_000,
  });
});

test("derives warning bands from the configured context window", () => {
  assert.deepEqual(thresholdsForContextWindow(258_000), {
    long: 167_700,
    warning: 206_400,
    critical: 245_100,
  });
  assert.deepEqual(DEFAULT_THRESHOLDS, thresholdsForContextWindow(DEFAULT_CONTEXT_WINDOW_TOKENS));
});

test("normalizes context-window sizes and rejects unusably small or invalid values", () => {
  assert.equal(normalizeContextWindowTokens("258000"), 258_000);
  assert.throws(() => normalizeContextWindowTokens(999), /at least 1,000/);
  assert.throws(() => normalizeContextWindowTokens(1.5), /integer/);
});

test("classifies all four usage bands at exact boundaries", () => {
  assert.equal(classifyUsage(DEFAULT_THRESHOLDS.long - 1).level, "normal");
  assert.equal(classifyUsage(DEFAULT_THRESHOLDS.long).level, "long");
  assert.equal(classifyUsage(DEFAULT_THRESHOLDS.warning).level, "warning");
  assert.equal(classifyUsage(DEFAULT_THRESHOLDS.critical).level, "critical");
});

test("normalizes valid thresholds and rejects unsafe ordering", () => {
  assert.deepEqual(normalizeThresholds({ long: "1000", warning: "2000", critical: "3000" }), {
    long: 1000,
    warning: 2000,
    critical: 3000,
  });
  assert.throws(
    () => normalizeThresholds({ long: 1000, warning: 1000, critical: 3000 }),
    /strictly increase/,
  );
  assert.throws(
    () => normalizeThresholds({ long: 0, warning: 2000, critical: 3000 }),
    /positive integers/,
  );
});

test("formats readable compact token counts", () => {
  assert.equal(formatTokenCount(999), "999");
  assert.equal(formatTokenCount(1_200), "1.2K");
  assert.equal(formatTokenCount(184_000), "184K");
  assert.equal(formatTokenCount(1_050_000), "1.05M");
});

test("recognizes Chrome extension-context invalidation errors", () => {
  assert.equal(isExtensionContextInvalidatedError(new Error("Extension context invalidated.")), true);
  assert.equal(isExtensionContextInvalidatedError(new Error("network down")), false);
});

test("invalidated Chrome calls shut down once and return the fallback", async () => {
  let shutdowns = 0;
  let laterCalls = 0;
  const runtime = createExtensionRuntime({ onInvalidate: () => { shutdowns += 1; } });

  const result = await runtime.call(
    async () => { throw new Error("Extension context invalidated."); },
    null,
  );
  const later = await runtime.call(async () => {
    laterCalls += 1;
    return 123;
  }, "stopped");

  assert.equal(result, null);
  assert.equal(later, "stopped");
  assert.equal(runtime.isActive(), false);
  assert.equal(shutdowns, 1);
  assert.equal(laterCalls, 0);
});

test("non-invalidation Chrome failures still surface", async () => {
  const runtime = createExtensionRuntime();
  await assert.rejects(
    () => runtime.call(async () => { throw new Error("storage broken"); }),
    /storage broken/,
  );
  assert.equal(runtime.isActive(), true);
});

test("checkpoint prompt preserves operational state instead of asking for prose", () => {
  const prompt = createCheckpointPrompt();
  for (const required of [
    "objective",
    "constraints",
    "decisions",
    "files changed",
    "commands and tests",
    "unresolved",
    "next concrete action",
    "Do not continue implementation",
  ]) {
    assert.match(prompt, new RegExp(required, "i"));
  }
});
