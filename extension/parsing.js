/* Shared, side-effect-free Git host route parsing. */
((root) => {
  "use strict";
  const filePattern = /(?:\.kicad_(?:sch|pcb|pro|prl|dru|wks)|\.(?:gbr|ger|gerber|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gko|gm\d+|g\d+|drl|xln|html?)|(?:^|\/)(?:fp|sym)-lib-table)$/i;
  const ownerPattern = /^[A-Za-z0-9_.-]+$/;
  const repoPattern = /^[A-Za-z0-9_.-]+$/;

  function route(url, {gitlabHosts = []} = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password && (parsed.origin === "https://gitlab.com" || parsed.origin !== "https://github.com" && gitlabHosts.includes(parsed.origin))) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const delimiter = parts.indexOf("-");
      if (delimiter < 2) return null;
      const namespace = parts.slice(0, delimiter).map(decodeSegment);
      if (!namespace.every((part) => part && ownerPattern.test(part))) return null;
      if(parts[delimiter+1]==='merge_requests'&&/^[1-9][0-9]*$/.test(parts[delimiter+2])&&parts[delimiter+3]==='diffs'&&parts.length===delimiter+4){
        if(['diff_id','start_sha','end_sha','diff1','diff2'].some(key=>parsed.searchParams.has(key)))return null;
        const number=Number(parts[delimiter+2]);
        return Number.isSafeInteger(number)?{kind:'merge',provider:'gitlab',host:parsed.origin,repository:namespace.join('/'),number}:null;
      }
      if(parts[delimiter+1]!=='blob')return null;
      const tail = parts.slice(delimiter + 2).map(decodeSegment);
      if (!namespace.every((part) => part && ownerPattern.test(part)) || tail.length < 2 ||
          !tail.every(Boolean) || !filePattern.test(tail.at(-1))) return null;
      return { kind: "blob", provider: "gitlab", ...(parsed.origin!=="https://gitlab.com"?{host:parsed.origin}:{}), repository: namespace.join("/"), tail };
    }
    if (parsed.origin !== "https://github.com") return null;
    const pieces = parsed.pathname.split("/").filter(Boolean);
    if (pieces.length < 4 || !ownerPattern.test(pieces[0]) || !repoPattern.test(pieces[1])) return null;
    const repository = `${pieces[0]}/${pieces[1]}`;
    if (pieces[2] === "blob" && pieces.length >= 5) {
      const tail = pieces.slice(3).map(decodeSegment);
      if (!tail.every(Boolean) || !filePattern.test(tail.at(-1))) return null;
      return { kind: "blob", repository, tail };
    }
    if (pieces[2] === "pull" && /^[1-9][0-9]*$/.test(pieces[3]) && pieces[4] === "files") {
      const number = Number(pieces[3]);
      return Number.isSafeInteger(number) ? { kind: "pull", repository, number } : null;
    }
    return null;
  }

  function decodeSegment(value) {
    try {
      const decoded = decodeURIComponent(value);
      return decoded && decoded !== "." && decoded !== ".." && !/[\\/\0]/.test(decoded) ? decoded : null;
    } catch { return null; }
  }

  function filePath(value) {
    if (typeof value !== "string" || value.length>500 || !filePattern.test(value) || value.startsWith("/")) return null;
    const parts = value.split("/");
    return parts.every((part) => part && part !== "." && part !== ".." && !/[\\:\x00-\x1f\x7f]/.test(part)) ? value : null;
  }

  function embeddedBlobData(scripts, parsedRoute = null) {
    const candidates = [];
    for (const text of scripts) {
      if (!text || text.length > 5_000_000) continue;
      let data;
      try { data = JSON.parse(text); } catch { continue; }
      const seen = new Set();
      function visit(value, depth) {
        if (!value || typeof value !== "object" || depth > 14 || seen.has(value)) return;
        seen.add(value);
        const path = filePath(value.path || value.filePath || value.filename);
        const refInfo = value.refInfo || value.ref || {};
        const ref = typeof refInfo === "string" ? refInfo : refInfo.name || refInfo.ref || refInfo.currentOid;
        const oid = typeof refInfo === "object" && (refInfo.currentOid || refInfo.oid);
        if (path && (typeof ref === "string" || typeof oid === "string")) {
          const candidate = { file: path, head: oid || ref, ref, score: (oid ? 2 : 0) + (value.refInfo ? 1 : 0) };
          // SPA payloads can contain sibling files and stale branch metadata.
          // Match the full route, not a basename suffix or the globally best SHA.
          const tail = parsedRoute?.tail?.join("/");
          if (!tail || tail === `${ref}/${path}` || tail === `${oid}/${path}`) candidates.push(candidate);
        }
        for (const child of Object.values(value)) if (typeof child === "object") visit(child, depth + 1);
      }
      visit(data, 0);
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function blobRequest(parsedRoute, embedded) {
    if (!parsedRoute || parsedRoute.kind !== "blob") return null;
    if (embedded && filePath(embedded.file) && typeof embedded.head === "string" && embedded.head) {
      const tail = parsedRoute.tail.join("/");
      const routeMatches = embedded.ref ? tail === `${embedded.ref}/${embedded.file}` || tail === `${embedded.head}/${embedded.file}` : tail.endsWith("/" + embedded.file);
      if (routeMatches && (parsedRoute.provider !== "gitlab" ||
          tail === `${embedded.head}/${embedded.file}` && embedded.repository === parsedRoute.repository)) {
        return { repository: parsedRoute.repository, file: embedded.file, head: embedded.head,
          ...(parsedRoute.provider ? { provider: parsedRoute.provider, ...(parsedRoute.host?{host:parsedRoute.host}:{}) } : {}) };
      }
    }
    if (parsedRoute.provider === "gitlab") return null;
    // The URL alone cannot disambiguate a slash in a branch name from a folder.
    // The common one-segment ref is a useful fallback when GitHub's embedded data is absent.
    const file = filePath(parsedRoute.tail.slice(1).join("/"));
    return file ? { repository: parsedRoute.repository, file, head: parsedRoute.tail[0] } : null;
  }

  function viewerParams(request) {
    const params = new URLSearchParams({
      repository: request.repository,
      headRepository: request.headRepository || request.repository,
      file: request.file,
      oldFile: request.oldFile || request.file,
      head: request.head
    });
    if (request.provider === "gitlab") { params.set("provider", "gitlab"); if(request.host)params.set("host",request.host); }
    if (request.base) params.set("base", request.base);
    if (request.status === "added" || request.status === "removed") params.set("status", request.status);
    if (request.pullNumber !== undefined || request.pullRepository !== undefined) {
      if (!Number.isSafeInteger(request.pullNumber) || request.pullNumber <= 0 ||
          typeof request.pullRepository !== "string" ||
          !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.pullRepository) ||
          request.pullRepository.split("/").some((part) => part === "." || part === "..")) {
        throw new Error("Invalid pull request context.");
      }
      params.set("pullNumber", String(request.pullNumber));
      params.set("pullRepository", request.pullRepository);
    }
    return params;
  }

  root.KiCadGitHub = { route, filePath, embeddedBlobData, blobRequest, viewerParams };
  if (typeof module === "object" && module.exports) module.exports = root.KiCadGitHub;
})(typeof globalThis === "object" ? globalThis : this);
