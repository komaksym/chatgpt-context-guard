const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationMessages,
  findComposer,
  findConversationRoot,
  isCheckpointReady,
  messageText,
  mutationsAffectMessages,
  resolveTheme,
} = require("../src/dom.js");

function block(text, descendants = []) {
  return {
    innerText: text,
    textContent: text,
    contains(candidate) {
      return descendants.includes(candidate);
    },
  };
}

test("messageText aggregates sibling content blocks without double-counting nested blocks", () => {
  const nested = block("nested duplicate");
  const first = block("first block", [nested]);
  const second = block("second block");
  const message = {
    innerText: "fallback",
    querySelectorAll() {
      return [first, nested, second];
    },
  };

  assert.equal(messageText(message), "first block\n\nsecond block");
});

test("conversationMessages reads every user and assistant block", () => {
  const nodes = [
    {
      getAttribute: () => "user",
      querySelectorAll: () => [block("question")],
    },
    {
      getAttribute: () => "assistant",
      querySelectorAll: () => [block("answer one"), block("answer two")],
    },
  ];
  const document = { querySelectorAll: () => nodes };

  assert.deepEqual(conversationMessages(document), [
    { role: "user", text: "question" },
    { role: "assistant", text: "answer one\n\nanswer two" },
  ]);
});

test("findComposer uses only verified ChatGPT selectors", () => {
  const verified = { id: "prompt-textarea" };
  const document = {
    querySelector(selector) {
      assert.equal(selector, '#prompt-textarea, textarea[data-id="root"]');
      return verified;
    },
  };

  assert.equal(findComposer(document), verified);
});

test("a new non-empty short assistant response is checkpoint-ready", () => {
  assert.equal(
    isCheckpointReady({
      baselineAssistantCount: 1,
      messages: [
        { role: "assistant", text: "old" },
        { role: "assistant", text: "Done." },
      ],
      generating: false,
    }),
    true,
  );
});

test("a new assistant response is ready even when its text matches the previous response", () => {
  assert.equal(
    isCheckpointReady({
      baselineAssistantCount: 1,
      previousResponse: "Done.",
      messages: [
        { role: "assistant", text: "Done." },
        { role: "assistant", text: "Done." },
      ],
      generating: false,
    }),
    true,
  );
});

test("checkpoint readiness rejects unchanged count, empty, or still-generating responses", () => {
  const messages = [{ role: "assistant", text: "same" }];
  assert.equal(isCheckpointReady({ baselineAssistantCount: 1, messages, generating: false }), false);
  assert.equal(
    isCheckpointReady({
      baselineAssistantCount: 0,
      messages: [{ role: "assistant", text: "" }],
      generating: false,
    }),
    false,
  );
  assert.equal(isCheckpointReady({ baselineAssistantCount: 0, messages, generating: true }), false);
});

test("explicit ChatGPT theme wins over OS fallback", () => {
  const darkDocument = { documentElement: { dataset: { theme: "dark" }, classList: { contains: () => false } } };
  const lightDocument = { documentElement: { dataset: { theme: "light" }, classList: { contains: () => false } } };
  const classDocument = { documentElement: { dataset: {}, classList: { contains: (name) => name === "dark" } } };
  assert.equal(resolveTheme(darkDocument, false), "dark");
  assert.equal(resolveTheme(lightDocument, true), "light");
  assert.equal(resolveTheme(classDocument, false), "dark");
  assert.equal(resolveTheme({ documentElement: { dataset: {}, classList: { contains: () => false } } }, true), "dark");
});

test("observer root is scoped to ChatGPT main content when available", () => {
  const main = {};
  const body = {};
  assert.equal(findConversationRoot({ querySelector: () => main, body }), main);
  assert.equal(findConversationRoot({ querySelector: () => null, body }), body);
});

test("mutation filtering ignores composer typing and reacts to transcript changes", () => {
  const composer = {
    nodeType: 1,
    matches: () => false,
    closest: () => null,
    querySelector: () => null,
  };
  const message = {};
  const messageTextNode = {
    nodeType: 3,
    parentElement: {
      matches: () => false,
      closest: () => message,
      querySelector: () => null,
    },
  };
  const stopButton = {
    nodeType: 1,
    matches: (selector) => selector.includes("stop-button"),
    closest: () => null,
    querySelector: () => null,
  };

  assert.equal(mutationsAffectMessages([{ target: composer, addedNodes: [], removedNodes: [] }]), false);
  assert.equal(mutationsAffectMessages([{ target: messageTextNode, addedNodes: [], removedNodes: [] }]), true);
  assert.equal(mutationsAffectMessages([{ target: composer, addedNodes: [], removedNodes: [stopButton] }]), true);
});

test("long transcript extraction stays linear and practical", () => {
  const nodes = Array.from({ length: 10_000 }, (_, index) => ({
    getAttribute: () => (index % 2 ? "assistant" : "user"),
    querySelectorAll: () => [block(`message ${index}`)],
  }));
  const document = { querySelectorAll: () => nodes };
  const started = performance.now();
  const messages = conversationMessages(document);
  const elapsed = performance.now() - started;

  assert.equal(messages.length, 10_000);
  assert.ok(elapsed < 500, `expected <500ms, got ${elapsed.toFixed(1)}ms`);
});
