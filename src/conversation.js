(function initContextGuardConversation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ContextGuardConversation = api;
})(typeof globalThis === "object" ? globalThis : this, function createConversationAdapter() {
  "use strict";

  function conversationIdFromPathname(pathname) {
    const match = String(pathname || "").match(/(?:^|\/)c\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function contentText(content) {
    if (typeof content === "string") return content.trim();
    if (!content || typeof content !== "object") return "";
    if (typeof content.text === "string") return content.text.trim();
    if (!Array.isArray(content.parts)) return "";

    return content.parts
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part === "object" && typeof part.text === "string") return part.text.trim();
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function activeBranchMessages(payload) {
    const mapping = payload?.mapping;
    let nodeId = payload?.current_node;
    if (!mapping || typeof mapping !== "object" || !nodeId) {
      throw new TypeError("Conversation payload is missing mapping or current node.");
    }

    const visited = new Set();
    const branch = [];
    while (nodeId) {
      if (visited.has(nodeId)) throw new Error(`Conversation mapping contains a cycle at ${nodeId}.`);
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (!node) throw new Error(`Conversation mapping is missing node ${nodeId}.`);
      branch.push({ nodeId, node });
      nodeId = node.parent || "";
    }

    return branch
      .reverse()
      .map(({ nodeId: mappingId, node }) => {
        const message = node.message;
        const role = message?.author?.role || message?.role || "";
        return {
          id: node.id || message?.id || mappingId,
          role,
          text: contentText(message?.content),
        };
      })
      .filter((message) => (message.role === "user" || message.role === "assistant") && message.text);
  }

  async function readJson(response, label) {
    if (!response?.ok) throw new Error(`${label} request failed with status ${response?.status || 0}.`);
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} response was not valid JSON.`);
    }
  }

  async function fetchActiveConversation({ conversationId, origin, fetchImpl = fetch }) {
    if (!conversationId) throw new TypeError("conversationId is required.");
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
    const base = String(origin || "").replace(/\/$/, "");
    if (!base) throw new TypeError("origin is required.");

    const sessionResponse = await fetchImpl(`${base}/api/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const session = await readJson(sessionResponse, "Session");
    if (!session?.accessToken) throw new Error("Session response did not include an access token.");

    const conversationResponse = await fetchImpl(
      `${base}/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    );
    const payload = await readJson(conversationResponse, "Conversation");
    return {
      currentNode: payload.current_node,
      messages: activeBranchMessages(payload),
    };
  }

  function createTokenLedger({
    conversationId,
    currentNode,
    messages,
    estimateTextTokens,
    updatedAt = Date.now(),
  }) {
    if (typeof estimateTextTokens !== "function") throw new TypeError("estimateTextTokens must be a function.");
    const messageTokens = {};
    let totalTokens = 0;
    for (const message of messages || []) {
      if (!message?.id || (message.role !== "user" && message.role !== "assistant")) continue;
      const tokens = estimateTextTokens(message.text);
      messageTokens[message.id] = { role: message.role, tokens };
      totalTokens += tokens;
    }
    return {
      conversationId,
      currentNode,
      messageTokens,
      totalTokens,
      messageCount: Object.keys(messageTokens).length,
      updatedAt,
    };
  }

  return Object.freeze({
    activeBranchMessages,
    contentText,
    conversationIdFromPathname,
    createTokenLedger,
    fetchActiveConversation,
  });
});