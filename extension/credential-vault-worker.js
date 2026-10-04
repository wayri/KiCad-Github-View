"use strict";

// This dedicated worker owns the only copies of the session encryption keys.
const entries = new Map();
const LIMIT = 8 * 60 * 60 * 1000;
let queue = Promise.resolve(), expiryTimer;
function namespace(value) {
  if (value === "github") return value;
  if (typeof value !== "string" || !value.startsWith("gitlab:") || value.length > 320) throw new Error("Invalid credential namespace.");
  const host = value.slice(7), url = new URL(host);
  if (url.protocol !== "https:" || url.origin !== host || url.username || url.password) throw new Error("Invalid credential namespace.");
  return value;
}
function prune() {
  for (const [name, entry] of entries) if (entry.expiresAt <= Date.now()) entries.delete(name);
  clearTimeout(expiryTimer);
  if (entries.size) expiryTimer = setTimeout(prune, Math.max(1, Math.min(...Array.from(entries.values(), e => e.expiresAt)) - Date.now()));
}
const bytesValid = (value, min, max) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
const aad = (name, expiresAt) => new TextEncoder().encode(`credential-vault:v2:${name}:${expiresAt}`);
async function execute(message) {
  const name = namespace(message.namespace);
  prune();
  if (message.op === "hasKey") return entries.has(name);
  if (message.op === "clear") { entries.delete(name); prune(); return true; }
  if (message.op === "encrypt") {
    const { token, expiresAt } = message;
    if (typeof token !== "string" || token.length < 20 || token.length > 1000 || /[^\x21-\x7e]/.test(token) ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + LIMIT) throw new Error("Invalid credential or expiry.");
    if (!entries.has(name) && entries.size >= 32) throw new Error("Too many active credential sessions.");
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12)), plain = new TextEncoder().encode(token);
    let encrypted;
    try { encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(name, expiresAt) }, key, plain); }
    finally { plain.fill(0); }
    if (expiresAt <= Date.now()) throw new Error("Credential expired.");
    entries.set(name, { key, expiresAt }); prune();
    return { version: 2, expiresAt, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) };
  }
  if (message.op === "decrypt") {
    const entry = entries.get(name), record = message.record;
    if (!entry || !record || record.version !== 2 || record.expiresAt !== entry.expiresAt ||
        !bytesValid(record.iv, 12, 12) || !bytesValid(record.ciphertext, 36, 1016)) throw new Error("Credential session is locked.");
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: aad(name, record.expiresAt) }, entry.key, new Uint8Array(record.ciphertext)));
    try {
      if (entry.expiresAt <= Date.now()) { entries.delete(name); throw new Error("Credential expired."); }
      return new TextDecoder().decode(plain);
    } finally { plain.fill(0); }
  }
  throw new Error("Unsupported credential operation.");
}
self.onmessage = event => {
  const message = event.data;
  if (!message || typeof message.id !== "string" || message.id.length > 100) return;
  const work = queue.then(() => execute(message));
  queue = work.catch(() => {});
  work.then(value => self.postMessage({ id: message.id, ok: true, value }), () => self.postMessage({ id: message.id, ok: false, error: "Credential session is unavailable or expired." }));
};
