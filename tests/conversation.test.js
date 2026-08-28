const test = require("node:test");
const assert = require("node:assert/strict");

const { estimateTextTokens } = require("../src/core.js");
const {
  activeBranchMessages,
  contentText,
  contentTokenText,
  conversationIdFromPathname,
  createTokenLedger,
  fetchActiveConversation,
  messageTokenText,
} = require("../src/conversation.js");

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return body; } };
}

function payload() {
  return {
    current_node: "assistant-new",
    mapping: {
      root: { id: "root", parent: null, message: { author: { role: "system" }, content: { parts: ["hidden"] } } },
      user: { id: "user", parent: "root", message: { author: { role: "user" }, content: { parts: ["question"] } } },
      "assistant-old": { id: "assistant-old", parent: "user", message: { author: { role: "assistant" }, content: { parts: ["old regenerated answer"] } } },
      "assistant-new": { id: "assistant-new", parent: "user", message: { author: { role: "assistant" }, content: { parts: ["selected answer"] } } },
    },
  };
}

test("extracts conversation IDs from standard and nested routes", () => {
  assert.equal(conversationIdFromPathname("/c/abc-123"), "abc-123");
  assert.equal(conversationIdFromPathname("/g/g-project/c/xyz?model=pro"), "xyz");
  assert.equal(conversationIdFromPathname("/"), "");
});

test("walks only the active current-node parent chain and builds tokenizable messages", () => {
  const messages = activeBranchMessages(payload());
  assert.deepEqual(messages.map(({ id, role, text }) => ({ id, role, text })), [
    { id: "root", role: "system", text: "hidden" },
    { id: "user", role: "user", text: "question" },
    { id: "assistant-new", role: "assistant", text: "selected answer" },
  ]);
  assert.deepEqual(messages.map((message) => message.tokenText), [
    "role:system\nhidden",
    "role:user\nquestion",
    "role:assistant\nselected answer",
  ]);
});

test("rejects missing nodes and cycles instead of counting an ambiguous mapping", () => {
  assert.throws(() => activeBranchMessages({ current_node: "missing", mapping: {} }), /missing node/i);
  const cyclic = payload();
  cyclic.mapping.user.parent = "assistant-new";
  assert.throws(() => activeBranchMessages(cyclic), /cycle/i);
});

test("keeps plain text readable while preserving structured multimodal content for tokenization", () => {
  const content = {
    content_type: "multimodal_text",
    parts: [
      "hello",
      { content_type: "image_asset_pointer", asset_pointer: "file://secret" },
      { content_type: "text", text: "caption" },
    ],
  };
  assert.equal(contentText(content), "hello\ncaption");
  const tokenText = contentTokenText(content);
  assert.match(tokenText, /hello/);
  assert.match(tokenText, /caption/);
  assert.match(tokenText, /image_asset_pointer/);
  assert.match(tokenText, /\[asset pointer\]/);
  assert.doesNotMatch(tokenText, /file:\/\/secret/);
  assert.equal(contentText({ text: "direct text" }), "direct text");
  assert.equal(contentText(null), "");
});

test("preserves tool recipients, arguments, results, and relevant tool metadata", () => {
  const call = messageTokenText({
    author: { role: "assistant" },
    recipient: "web.run",
    content: { content_type: "code", language: "json", text: "{\"query\":\"cats\"}" },
    metadata: { tool_call_id: "call-1", request_id: "ui-only" },
  });
  assert.match(call, /^role:assistant/m);
  assert.match(call, /recipient:web\.run/);
  assert.match(call, /language:json/);
  assert.match(call, /"query":"cats"/);
  assert.match(call, /tool_call_id/);
  assert.doesNotMatch(call, /ui-only/);

  const result = messageTokenText({
    author: { role: "tool", name: "web.run" },
    recipient: "all",
    content: {
      content_type: "execution_output",
      text: "two results",
      rows: [{ title: "A" }, { title: "B" }],
    },
  });
  assert.match(result, /^role:tool/m);
  assert.match(result, /name:web\.run/);
  assert.match(result, /execution_output/);
  assert.match(result, /two results/);
  assert.match(result, /"title":"A"/);
});

test("loads the session token in memory and fetches the active conversation", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/auth/session")) return response({ accessToken: "ephemeral-token" });
    return response(payload());
  };

  const result = await fetchActiveConversation({
    conversationId: "conversation-id",
    origin: "https://chatgpt.com",
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(calls[1].options.headers.Authorization, "Bearer ephemeral-token");
  assert.equal(calls[1].url, "https://chatgpt.com/backend-api/conversation/conversation-id");
  assert.deepEqual(result.messages.map((message) => message.id), ["root", "user", "assistant-new"]);
  assert.equal(result.currentNode, "assistant-new");
});

test("surfaces authentication and conversation HTTP failures", async () => {
  await assert.rejects(
    () => fetchActiveConversation({
      conversationId: "id",
      origin: "https://chatgpt.com",
      fetchImpl: async () => response({}, { ok: false, status: 401 }),
    }),
    /session request failed.*401/i,
  );

  let call = 0;
  await assert.rejects(
    () => fetchActiveConversation({
      conversationId: "id",
      origin: "https://chatgpt.com",
      fetchImpl: async () => (++call === 1 ? response({ accessToken: "token" }) : response({}, { ok: false, status: 503 })),
    }),
    /conversation request failed.*503/i,
  );
});

test("creates a token-only ledger from normalized message structures without persisting content", () => {
  const messages = [
    { id: "system", role: "system", text: "secret-system", tokenText: "role:system\nsecret-system" },
    { id: "tool-call", role: "assistant", text: "", tokenText: "role:assistant\nrecipient:web.run\n{\"query\":\"private-query\"}" },
    { id: "tool-result", role: "tool", text: "", tokenText: "role:tool\nname:web.run\n{\"result\":\"private-result\"}" },
    { id: "assistant", role: "assistant", text: "final-answer", tokenText: "role:assistant\nfinal-answer" },
  ];
  const ledger = createTokenLedger({
    conversationId: "conversation-id",
    currentNode: "assistant",
    messages,
    estimateTextTokens,
    updatedAt: 1234,
  });

  assert.equal(
    ledger.totalTokens,
    messages.reduce((total, message) => total + estimateTextTokens(message.tokenText), 0),
  );
  assert.equal(ledger.messageCount, 4);
  assert.deepEqual(Object.keys(ledger.messageTokens), ["system", "tool-call", "tool-result", "assistant"]);
  assert.equal(ledger.messageTokens["tool-call"].role, "assistant");
  assert.equal(ledger.messageTokens["tool-result"].role, "tool");

  const serialized = JSON.stringify(ledger);
  assert.doesNotMatch(serialized, /secret-system|private-query|private-result|final-answer/);
});
