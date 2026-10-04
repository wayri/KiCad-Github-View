"use strict";

// Only an exact background ServiceWorker can transfer a private RPC channel.
const credentialWorker = new Worker("credential-vault-worker.js");
const credentialReplies = new Map();
let credentialSequence = 0;
credentialWorker.onmessage = event => {
  const reply = event.data, pending = credentialReplies.get(reply?.id);
  if (!pending) return;
  credentialReplies.delete(reply.id); clearTimeout(pending.timer);
  pending.port.postMessage({ ...reply, id: pending.id });
};
credentialWorker.onerror = () => {
  for (const pending of credentialReplies.values()) {
    clearTimeout(pending.timer);
    pending.port.postMessage({ id: pending.id, ok: false, error: "Credential worker stopped." });
  }
  credentialReplies.clear();
};
navigator.serviceWorker.addEventListener("message", event => {
  if (!(event.source instanceof ServiceWorker) || event.source.scriptURL !== chrome.runtime.getURL("background.js") ||
      event.data?.type !== "kicad-credential-channel-v1" || event.ports.length !== 1) return;
  const port = event.ports[0];
  port.onmessage = request => {
    const message = request.data;
    if (!message || typeof message.id !== "string" || message.id.length > 100 ||
        !["hasKey", "encrypt", "decrypt", "clear"].includes(message.op)) return;
    if (credentialReplies.size >= 64) { port.postMessage({ id: message.id, ok: false, error: "Credential session is busy." }); return; }
    const id = String(++credentialSequence);
    const timer = setTimeout(() => {
      credentialReplies.delete(id);
      port.postMessage({ id: message.id, ok: false, error: "Credential operation timed out." });
    }, 10000);
    credentialReplies.set(id, { port, id: message.id, timer });
    credentialWorker.postMessage({ ...message, id });
  };
  port.start();
  port.postMessage({ ready: true });
});
