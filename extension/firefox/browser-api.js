/* Firefox provides Promise APIs on browser; shared code expects chrome. */
(() => {
  'use strict';
  if (!globalThis.browser?.runtime?.id) throw new Error('Firefox WebExtension APIs are unavailable.');
  globalThis.chrome = globalThis.browser;
})();
