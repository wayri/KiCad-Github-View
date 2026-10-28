"use strict";

// Firefox event pages retain session keys in provider-owned memory. The provider
// modules already encrypt storage.session records when this Chromium-only vault
// is unavailable. Do not ship unsupported offscreen APIs to Firefox.
const KiCadCredentialVault = Object.freeze({
  supported: false,
  forProvider() { throw new Error("Offscreen credential sessions are unavailable in Firefox."); }
});
