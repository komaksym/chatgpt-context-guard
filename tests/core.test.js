const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_THRESHOLDS,
  classifyUsage,
  createCheckpointPrompt,
  estimateTextTokens,
  estimateTranscriptTokens,
  formatTokenCount,
  normalizeThresholds,
} = require("../src/core.js");

test("estimates empty and ASCII text without claiming exact tokenization", () => {
  assert.equal(estimateTextTokens(""), 0);
  assert.equal(estimateTextTokens("hello world"), 3);
  assert.equal(estimateTextTokens("a".repeat(400)), 100);
});

test("counts CJK characters more conservatively than ASCII", () => {
  assert.equal(estimateTextTokens("你好世界"), 4);
  assert.equal(estimateTextTokens("hello 世界"), 4);
});

test("aggregates only visible user and assistant transcript text", () => {
  const messages = [
    { role: "user", text: "a".repeat(40) },
    { role: "assistant", text: "b".repeat(80) },
    { role: "tool", text: "c".repeat(400) },
  ];
  assert.equal(estimateTranscriptTokens(messages), 30);
});

test("classifies all four usage bands at exact boundaries", () => {
  assert.equal(classifyUsage(249_999).level, "normal");
  assert.equal(classifyUsage(250_000).level, "long");
  assert.equal(classifyUsage(400_000).level, "warning");
  assert.equal(classifyUsage(600_000).level, "critical");
  assert.deepEqual(DEFAULT_THRESHOLDS, {
    long: 250_000,
    warning: 400_000,
    critical: 600_000,
  });
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
