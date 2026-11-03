"use strict";
// Explicitly granted origins only. This module never requests browser permission itself.
const KiCadGitLabHosts = (() => {
  const KEY = 'gitlab-approved-hosts-v1';
  const normalize = value => {
    const host = KiCadGitLabReviewApi.validateHost(value);
    if (['https://github.com','https://api.github.com','https://raw.githubusercontent.com'].includes(host)) throw new Error('This origin is not a GitLab server.');
    return host;
  };
  async function list() {
    const values = (await chrome.storage.local.get(KEY))[KEY] || [];
    return ['https://gitlab.com', ...values.filter(value => {
      try { return normalize(value) === value && value !== 'https://gitlab.com'; } catch { return false; }
    }).slice(0,20)];
  }
  async function allowed(host) {
    host=normalize(host);
    return host==='https://gitlab.com'||(await list()).includes(host);
  }
  const id = host => 'kicad-gitlab-'+Array.from(host,c=>c.charCodeAt(0).toString(16)).join('');
  async function register(host) {
    // Remove older registrations; repository bridges now require an icon click.
    if(!chrome.scripting?.getRegisteredContentScripts)return;
    const existing=await chrome.scripting.getRegisteredContentScripts({ids:[id(host)]});
    if(existing.length)await chrome.scripting.unregisterContentScripts({ids:[id(host)]});
  }
  async function add(value) {
    const host=normalize(value);
    if(host==='https://gitlab.com')return {host,hosts:await list()};
    const hosts=await list();if(!hosts.includes(host)&&hosts.length>=21)throw new Error('At most 20 additional GitLab hosts are supported.');
    await register(host);
    await chrome.storage.local.set({[KEY]:[...new Set([...hosts,host])].filter(h=>h!=='https://gitlab.com')});
    return {host,hosts:await list()};
  }
  async function remove(value) {
    const host=normalize(value);if(host==='https://gitlab.com')throw new Error('GitLab.com is a built-in host; sign out to remove its credentials.');
    await KiCadGitLabReviewApi.resetAuth(host);
    await chrome.scripting.unregisterContentScripts({ids:[id(host)]});
    await chrome.storage.local.set({[KEY]:(await list()).filter(h=>h!==host&&h!=='https://gitlab.com')});
    await chrome.permissions.remove({origins:[host+'/*']});
    return {hosts:await list()};
  }
  async function restore() {for(const host of await list())if(host!=='https://gitlab.com'&&await allowed(host))await register(host);}
  return {normalize,list,allowed,add,remove,restore};
})();
globalThis.KiCadGitLabHosts=KiCadGitLabHosts;
if(typeof module==='object'&&module.exports)module.exports=KiCadGitLabHosts;
