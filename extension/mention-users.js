"use strict";

// Privileged background lookup only. Callers must validate the extension viewer
// sender and grant the exact GitLab host before invoking this service.
const KiCadMentionUsers = (() => {
  const LIMIT = 256 * 1024;
  const githubLogin = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const gitlabLogin = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/;
  function scope(message) {
    const provider = message.provider || 'github';
    if (!['github', 'gitlab'].includes(provider)) throw new Error('Invalid mention provider.');
    const repository = message.repository;
    const repositoryPattern = provider === 'github' ? /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/ : /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
    if (typeof repository !== 'string' || repository.length > 300 || !repositoryPattern.test(repository) || repository.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid mention repository.');
    const host = provider === 'github' ? 'https://github.com' : message.host || 'https://gitlab.com';
    const url = new URL(host);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin !== host || url.hostname.endsWith('.')) throw new Error('Invalid mention host.');
    if (provider === 'github' && message.host !== undefined && message.host !== host) throw new Error('Invalid GitHub mention host.');
    const query = message.query === undefined ? '' : message.query;
    if (typeof query !== 'string' || query.length > 64 || /[\x00-\x1f\x7f]/.test(query)) throw new Error('Invalid mention query.');
    const source = message.source || 'repository';
    if (!['repository', 'users'].includes(source)) throw new Error('Invalid mention source.');
    const normalized = query.trim().replace(/^@/, '');
    if (source === 'users' && (normalized.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(normalized))) throw new Error('Type at least two username characters to search accounts.');
    return { provider, repository, host, query: normalized, source };
  }
  function create({ authorizationHeaders, fetcher = fetch, now = () => Date.now() }) {
    if (typeof authorizationHeaders !== 'function') throw new Error('Mention lookup requires a privileged credential provider.');
    const budgets = new Map();
    async function read(url, headers, checkConnection) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        await checkConnection();
        const response = await fetcher(url, { headers, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`Mention lookup returned HTTP ${response.status}. Check repository access and account permissions.`);
        if (Number(response.headers.get('content-length')) > LIMIT || !response.body?.getReader) throw new Error('Mention response exceeds its limit or has no readable body.');
        const reader = response.body.getReader(), chunks = []; let length = 0;
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > LIMIT) { await reader.cancel(); throw new Error('Mention response exceeds its size limit.'); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        await checkConnection();
        return { value: JSON.parse(new TextDecoder().decode(bytes)), more: Boolean(response.headers.get('x-next-page')) || /rel="next"/.test(response.headers.get('link') || '') };
      } catch (error) { if (error.name === 'AbortError') throw new Error('Mention lookup timed out.'); throw error; }
      finally { clearTimeout(timer); controller.abort(); }
    }
    async function lookup(message) {
      const context = scope(message), { provider, host, repository, query, source } = context;
      const headers = await authorizationHeaders(provider, host);
      if (!headers || !Object.keys(headers).some(k => /^(authorization|private-token)$/i.test(k) && headers[k])) throw new Error('Sign in to search users and contributors. You can still enter @usernames manually.');
      const checkConnection = async () => {
        const current = await authorizationHeaders(provider, host);
        if (!current || JSON.stringify(Object.entries(current).sort()) !== JSON.stringify(Object.entries(headers).sort())) throw new Error('Account connection changed during mention lookup. Search again after signing in.');
      };
      const key = provider + ':' + host, time = now();
      let budget = budgets.get(key);
      if (!budget || time >= budget.until) budget = { count: 0, until: time + 60000 };
      if (budget.count >= 30) throw new Error('Mention lookup limit reached. Wait a minute or enter @usernames manually.');
      budget.count++; budgets.set(key, budget);
      if (budgets.size > 64) budgets.delete(budgets.keys().next().value);
      const users = new Map(), warnings = [];
      const add = (record, role) => {
        const login = provider === 'github' ? record?.login : record?.username;
        if (!(provider === 'github' ? githubLogin : gitlabLogin).test(login || '')) return;
        const name = typeof record.name === 'string' ? record.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) : '';
        if (query && ![login, name].some(value => value.toLowerCase().includes(query.toLowerCase()))) return;
        const id = login.toLowerCase(), previous = users.get(id);
        users.set(id, { login, name, roles: [...new Set([...(previous?.roles || []), role])], url: host + '/' + encodeURIComponent(login) });
      };
      const list = async (url, role, optional = false) => {
        let result;
        try { result = await read(url, { ...headers, ...(provider === 'github' ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } : {}) }, checkConnection); }
        catch (error) { if (!optional) throw error; warnings.push('Repository assignees are unavailable; contributor suggestions remain available.'); return; }
        const records = source === 'users' && provider === 'github' ? result.value?.items : result.value;
        if (!Array.isArray(records) || records.length > 100) throw new Error('Invalid mention account listing.');
        records.forEach(record => add(record, role));
        if (result.more || records.length === 100 || result.value?.incomplete_results) warnings.push('Suggestions are limited to the first 100 matching accounts from this source. Enter another username manually if needed.');
      };
      if (provider === 'github') {
        const project = 'https://api.github.com/repos/' + repository;
        if (source === 'users') {
          // Confirm access to the selected repository before offering external users.
          await read(project, { ...headers, Accept: 'application/vnd.github+json' }, checkConnection);
          await list('https://api.github.com/search/users?' + new URLSearchParams({ q: query + ' in:login', per_page: '30', page: '1' }), 'User');
        } else {
          await list(project + '/contributors?per_page=100&page=1&anon=false', 'Contributor');
          await list(project + '/assignees?per_page=100&page=1', 'Assignable user', true);
        }
      } else {
        const project = host + '/api/v4/projects/' + encodeURIComponent(repository);
        if (source === 'users') {
          await read(project, headers, checkConnection);
          await list(host + '/api/v4/users?' + new URLSearchParams({ search: query, per_page: '30', page: '1' }), 'User');
        } else await list(project + '/members/all?' + new URLSearchParams({ query, per_page: '100', page: '1' }), 'Project member');
      }
      const sorted = [...users.values()].sort((a, b) => Number(b.login.toLowerCase().startsWith(query.toLowerCase())) - Number(a.login.toLowerCase().startsWith(query.toLowerCase())) || a.login.localeCompare(b.login));
      if (sorted.length > 30) warnings.push('Showing 30 suggestions. Narrow the search for more precise results.');
      await checkConnection();
      return { users: sorted.slice(0, 30), warnings: [...new Set(warnings)], provider, host, repository };
    }
    return { lookup };
  }
  return { create, scope };
})();
if (typeof globalThis === 'object') globalThis.KiCadMentionUsers = KiCadMentionUsers;
if (typeof module === 'object' && module.exports) module.exports = KiCadMentionUsers;
