/* Firefox provides Promise APIs on browser; shared code expects chrome. */
(() => {
  'use strict';
  if (!globalThis.browser?.runtime?.id) throw new Error('Firefox WebExtension APIs are unavailable.');
  // Firefox for Android has one browser window and does not expose windows.
  // Preserve the shared viewer actions by opening another extension tab there.
  // Never mask a rejected desktop windows.create call with a second operation.
  if (typeof globalThis.browser.windows?.create !== 'function') {
    const api = globalThis.browser;
    const base = new URL(api.runtime.getURL(''));
    api.windows = Object.freeze({
      async create(options) {
        if (!options || typeof options !== 'object' || Array.isArray(options) ||
            Object.keys(options).some(key => !['url', 'type', 'state', 'focused'].includes(key)) ||
            typeof options.url !== 'string' || options.url.length > 16384 ||
            (options.type !== undefined && options.type !== 'popup') ||
            (options.state !== undefined && options.state !== 'maximized') ||
            (options.focused !== undefined && typeof options.focused !== 'boolean')) {
          throw new Error('Unsupported mobile viewer tab options.');
        }
        const url = new URL(options.url);
        if (url.protocol !== base.protocol || url.host !== base.host ||
            url.username || url.password || url.hash ||
            !['/project-viewer.html', '/browser-viewer.html'].includes(url.pathname)) {
          throw new Error('Mobile viewer tabs require an internal drawing page.');
        }
        if (typeof api.tabs?.create !== 'function') throw new Error('Firefox viewer tabs are unavailable.');
        const tab = await api.tabs.create({ url: url.href, active: options.focused !== false });
        if (!tab || typeof tab !== 'object') throw new Error('Firefox did not open the viewer tab.');
        return { id: Number.isInteger(tab.windowId) ? tab.windowId : null, tabs: [tab] };
      },
    });
  }
  globalThis.chrome = globalThis.browser;
})();
