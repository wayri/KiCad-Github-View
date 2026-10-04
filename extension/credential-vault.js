"use strict";

// Ciphertext lives in storage.session; nonextractable keys live only in a
// dedicated worker hosted by an offscreen document. No secret is broadcast.
const KiCadCredentialVault = (() => {
  const supported = !!(globalThis.chrome?.offscreen?.createDocument && chrome.runtime?.getContexts &&
    globalThis.clients?.matchAll && globalThis.MessageChannel);
  const PATH = "credential-vault-host.html", CHANNEL = "kicad-credential-channel-v1";
  let creating = null, connection = null, connectionClient = null, connecting = null, sequence = 0, queue = Promise.resolve();
  const pending = new Map();
  function disconnect() {
    connection?.close(); connection = null; connectionClient = null;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Credential session disconnected.")); }
    pending.clear();
  }
  async function existing() {
    const url = chrome.runtime.getURL(PATH);
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
    if (!contexts.length) return null;
    return (await clients.matchAll({ type: "window", includeUncontrolled: true })).find(client => client.url === url) || null;
  }
  async function connect(create) {
    const known = await existing();
    if (connection && known?.id !== connectionClient) disconnect();
    if (!known && !create) { disconnect(); return null; }
    if (!known) {
      if (!creating) creating = chrome.offscreen.createDocument({ url: PATH, reasons: ["WORKERS"],
        justification: "Run an isolated cryptographic worker that retains ephemeral authentication keys during the browser session." }).finally(() => { creating = null; });
      await creating;
    }
    if (connection) return connection;
    if (connecting) return connecting;
    connecting = (async () => {
      const client = known || await existing();
      if (!client) throw new Error("Credential session host is unavailable.");
      const channel = new MessageChannel();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Credential session connection timed out.")); }, 10000);
        channel.port1.onmessage = event => {
          const reply = event.data;
          if (reply?.ready === true) { clearTimeout(timer); resolve(); return; }
          const item = pending.get(reply?.id);
          if (!item) return;
          pending.delete(reply.id); clearTimeout(item.timer);
          if (reply.ok === true) item.resolve(reply.value);
          else item.reject(new Error("Credential session is unavailable or expired."));
        };
        channel.port1.onmessageerror = () => { clearTimeout(timer); reject(new Error("Invalid credential response.")); disconnect(); };
        channel.port1.start();
        client.postMessage({ type: CHANNEL }, [channel.port2]);
      });
      connection = channel.port1;
      connectionClient = client.id;
      return connection;
    })().finally(() => { connecting = null; });
    return connecting;
  }
  async function rpc(namespace, op, extras = {}) {
    if (!supported) throw new Error("Persistent in-memory credential sessions are unavailable.");
    const port = await connect(op === "encrypt");
    if (!port) {
      if (op === "hasKey") return false;
      if (op === "clear") return true;
      throw new Error("Credential session is locked.");
    }
    const id = String(++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Credential operation timed out.")); disconnect(); }, 10000);
      pending.set(id, { resolve, reject, timer });
      try { port.postMessage({ id, namespace, op, ...extras }); }
      catch (error) { pending.delete(id); clearTimeout(timer); disconnect(); reject(error); }
    });
  }
  function operation(namespace, op, extras) {
    const work = queue.then(() => rpc(namespace, op, extras));
    queue = work.catch(() => {}); return work;
  }
  function forProvider(namespace) {
    return {
      hasKey: () => operation(namespace, "hasKey"),
      encrypt: (token, expiresAt) => operation(namespace, "encrypt", { token, expiresAt }),
      decrypt: record => operation(namespace, "decrypt", { record }),
      clear: () => operation(namespace, "clear")
    };
  }
  return { supported, forProvider };
})();
