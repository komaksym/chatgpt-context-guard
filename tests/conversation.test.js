const test = require("node:test");
const assert = require("node:assert/strict");

const { estimateTextTokens } = require("../src/core.js");
const {
  activeBranchMessages,
  contentText,
  conversationIdFromPathname,
  createTokenLedger,
  fetchActiveConversation,
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

test("walks only the active current-node parent chain", () => {
  assert.deepEqual(activeBranchMessages(payload()), [
    { id: "user", role: "user", text: "question" },
    { id: "assistant-new", role: "assistant", text: "selected answer" },
  ]);
});

test("rejects missing nodes and cycles instead of counting an ambiguous mapping", () => {
  assert.throws(() => activeBranchMessages({ current_node: "missing", mapping: {} }), /missing node/i);
  const cyclic = payload();
  cyclic.mapping.user.parent = "assistant-new";
  assert.throws(() => activeBranchMessages(cyclic), /cycle/i);
});

test("extracts text parts and ignores non-text multimodal objects", () => {
  assert.equal(
    contentText({
      parts: [
        "hello",
        { content_type: "image_asset_pointer", asset_pointer: "file://secret" },
        { content_type: "text", text: "caption" },
      ],
    }),
    "hello\ncaption",
  );
  assert.equal(contentText({ text: "direct text" }), "direct text");
  assert.equal(contentText(null), "");
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
  assert.deepEqual(result.messages.map((message) => message.id), ["user", "assistant-new"]);
  assert.equal(result.currentNode, "assistant-new");
});

test("surfaces authentication and conversation HTTP failures", async () => {
  await assert.rejects(
    fetchActiveConversation({
      conversationId: "id",
      origin: "https://chatgpt.com",
      fetchImpl: async () => response({}, { ok: false, status: 401 }),
    }),
    /session request failed.*401/i,
  );

  let call = 0;
  await assert.rejects(
    fetchActiveConversation({
      conversationId: "id",
      origin: "https://chatgpt.com",
      fetchImpl: async () => (++call === 1 ? response({ accessToken: "token" }) : response({}, { ok: false, status: 503 })),
    }),
    /conversation request failed.*503/i,
  );
});

test("creates a token-only ledger without conversation text or access tokens", () => {
  const messages = activeBranchMessages(payload());
  const ledger = createTokenLedger({
    conversationId: "conversation-id",
    currentNode: "assistant-new",
    messages,
    estimateTextTokens,
    updatedAt: 1234,
  });

  assert.deepEqual(ledger, {
    conversationId: "conversation-id",
    currentNode: "assistant-new",
    messageTokens: {
      user: { role: "user", tokens: 2 },
      "assistant-new": { role: "assistant", tokens: 4 },
    },
    totalTokens: 6,
    messageCount: 2,
    updatedAt: 1234,
  });
  const serialized = JSON.stringify(ledger);
  assert.doesNotMatch(serialized, /question|selected answer|ephemeral-token/);
});