const test = require("node:test");
const assert = require("node:assert/strict");

const {
  conversationMessages,
  findCheckpointResponse,
  findComposer,
  findConversationRoot,
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

test("checkpoint response is bound to the prepared prompt and captured before later turns", () => {
  const checkpointPrompt = [
    "Create a lossless task checkpoint for continuing this work in a fresh chat.",
    "Include exact files and tests.",
    "Do not continue implementation in this response.",
  ].join("\n");
  const anchorMessages = [
    { role: "user", text: "original question" },
    { role: "assistant", text: "original answer" },
  ];
  const messages = [
    { role: "assistant", text: "lazy-loaded older answer" },
    ...anchorMessages,
    { role: "user", text: "a different edited prompt" },
    { role: "assistant", text: "unrelated answer" },
    { role: "user", text: `${checkpointPrompt}\n\nAlso preserve issue IDs.` },
    { role: "assistant", text: "the checkpoint" },
    { role: "user", text: "one more question" },
    { role: "assistant", text: "later unrelated answer" },
  ];

  assert.equal(
    findCheckpointResponse({ anchorMessages, checkpointPrompt, messages, generating: false }),
    "the checkpoint",
  );
});

test("checkpoint response is unavailable until the checkpoint turn finishes", () => {
  const checkpointPrompt = [
    "Create a lossless task checkpoint for continuing this work in a fresh chat.",
    "Do not continue implementation in this response.",
  ].join("\n");
  const anchorMessages = [{ role: "assistant", text: "before" }];
  const messages = [
    ...anchorMessages,
    { role: "user", text: checkpointPrompt },
    { role: "assistant", text: "partial checkpoint" },
  ];

  assert.equal(findCheckpointResponse({ anchorMessages, checkpointPrompt, messages, generating: true }), "");
  assert.equal(
    findCheckpointResponse({
      anchorMessages,
      checkpointPrompt,
      messages: [...anchorMessages, { role: "user", text: "unrelated" }, { role: "assistant", text: "answer" }],
      generating: false,
    }),
    "",
  );
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
