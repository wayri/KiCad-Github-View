/* Browser-only project retrieval helpers. No renderer or server dependency. */
((root) => {
  "use strict";
  const repositoryPattern = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
  const filePattern = /\.kicad_(?:sch|pcb)$/i;
  const PROJECT_MAX_BYTES = 96 * 1024 * 1024;
  const PROJECT_MAX_FILES = 128, PARENT_MAX_CANDIDATES = 24, READ_CONCURRENCY = 4;
  const fileByteLimit = (path) => (/\.kicad_pcb$/i.test(path) ? 64 : 8) * 1024 * 1024;

  function validRepository(value, provider = "github") {
    return typeof value === 'string' && value.length <= 500 && repositoryPattern.test(value) &&
      (provider === 'gitlab' || provider === 'github' && value.split('/').length === 2) &&
      value.split('/').every((part) => part !== '.' && part !== '..');
  }
  function validRef(value) {
    return typeof value === 'string' && !!value && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
  }

  function validPath(path) {
    return typeof path === "string" && filePattern.test(path) && !path.startsWith("/") &&
      path.split("/").every((part) => part && part !== "." && part !== ".." && !/[\\\x00-\x1f\x7f]/.test(part));
  }

  function childPath(parent, name) {
    if (typeof name !== "string" || !/\.kicad_sch$/i.test(name) ||
        name.startsWith("/") || /[\\\0:]/.test(name)) return null;
    const parts = parent.split("/").slice(0, -1);
    for (const part of name.split("/")) {
      if (part === "..") { if (!parts.length) return null; parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    const result = parts.join("/");
    return validPath(result) ? result : null;
  }

  function sheetFiles(source) {
  // Bounded S-expression context; only properties of top-level sheet objects
  // authorize child reads. Comments, text, and library properties are ignored.
  const names=[],stack=[];let i=0,nodes=0,roots=0;
  while(i<source.length) {
    const c=source[i];if(/\s/.test(c)){i++;continue;}
    if(c===";"){while(i<source.length&&source[i]!=="\n")i++;continue;}
    if(++nodes>1000000)throw new Error("KiCad source has too many S-expression nodes.");
    if(c==="(") {if(stack.length>=96)throw new Error("KiCad source is too deeply nested.");if(!stack.length)roots++;stack.push([]);i++;continue;}
    if(c===")") {
      if(!stack.length)throw new Error("Unexpected closing KiCad parenthesis.");
      const entry=stack.pop();i++;
      if(entry[0]==="property" && ["Sheetfile", "Sheet file"].includes(entry[1]) && typeof entry[2]==="string" &&
        stack.length===2 && stack[0][0]==="kicad_sch" && stack[1][0]==="sheet")names.push(entry[2]);
      continue;
    }
    if(!stack.length)throw new Error("Expected a KiCad S-expression.");
    let token="";
    if(c==='"') {
      i++;let closed=false;
      while(i<source.length) {
        const next=source[i++];if(next==='"'){closed=true;break;}
        if(next==="\\"){if(i>=source.length)break;const escaped=source[i++];token+=({n:"\n",r:"\r",t:"\t",'"':'"',"\\":"\\"})[escaped] ?? `\\${escaped}`;}
        else token+=next;
      }
      if(!closed)throw new Error("Unterminated quoted KiCad value.");
    } else {const start=i;while(i<source.length&&!/[\s();"]/.test(source[i]))i++;if(i===start)throw new Error("Invalid KiCad source token.");token=source.slice(start,i);}
    if(stack.at(-1).length<3)stack.at(-1).push(token);
  }
  if(stack.length || roots!==1)throw new Error("Incomplete KiCad S-expression.");
  return names;
}

  async function loadProject(repository, ref, file, readFile, listDirectory = null, provider = "github") {
    if (!validRepository(repository, provider) || !validPath(file) || !validRef(ref)) {
      throw new Error("Invalid GitHub project location.");
    }
    const cache = new Map(), sizes = new Map(), inFlight = new Map(), sheetCache = new Map(), encoder = new TextEncoder();
    let totalBytes = 0, readCount = 0;
    async function read(path) {
      if (cache.has(path)) return cache.get(path);
      if (inFlight.has(path)) return inFlight.get(path);
      if (readCount >= PROJECT_MAX_FILES + PARENT_MAX_CANDIDATES) throw new Error("Project discovery exceeds the bounded KiCad file count.");
      readCount++;
      const work = (async () => {
      const content = await readFile(repository, ref, path);
      if (content !== null && typeof content !== "string") throw new Error("GitHub returned invalid KiCad file contents.");
      if (content !== null) {
        const size = encoder.encode(content).length;
        if (size > fileByteLimit(path) || totalBytes + size > PROJECT_MAX_BYTES) {
          throw new Error("Project discovery exceeds the browser preview size limit.");
        }
        totalBytes += size;
        sizes.set(path, size);
      }
      cache.set(path, content);
      return content;
      })();
      inFlight.set(path, work);
      try { return await work; } finally { inFlight.delete(path); }
    }
    function descendants(path, content) {
      if (!sheetCache.has(path)) sheetCache.set(path, content === null || !/\.kicad_sch$/i.test(path) ? [] :
        sheetFiles(content).map(name => childPath(path, name)).filter(Boolean));
      return sheetCache.get(path);
    }
    async function readBatch(paths) {
      let next = 0, failure = null;
      await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, async () => {
        while (next < paths.length && !failure) {
          const path = paths[next++];
          try { await read(path); } catch (error) { failure ||= error; }
        }
      }));
      if (failure) throw failure;
    }
    function retain(paths) {
      for (const path of cache.keys()) if (!paths.has(path)) {
        totalBytes -= sizes.get(path) || 0; sizes.delete(path); cache.delete(path); sheetCache.delete(path);
      }
    }
    if (await read(file) === null) throw new Error(`KiCad file was not returned by ${provider === "gitlab" ? "GitLab" : "GitHub"} (HTTP 404): ${repository}, revision ${ref}, path ${file}. The file may be missing or repository access may be unavailable. ${provider === "gitlab" ? "Sign in to the matching GitLab server in extension settings and check your project access." : "GitHub website sign-in does not sign the extension in. Connect an account with private repository access or a token with this repository's Contents read permission in extension settings."}`);
    let roots = [file];
    let discoveryWarning = null;
    if (/\.kicad_sch$/i.test(file) && listDirectory) {
      try {
      const parts = file.split("/");
      if (parts.length > 9) throw new Error("Schematic path is too deep for bounded parent-sheet discovery.");
      const candidates = new Set([file]);
      for (let index = parts.length - 1; index >= 0; index--) {
        const directory = parts.slice(0, index).join("/");
        const listing = await listDirectory(repository, ref, directory);
        if (!Array.isArray(listing) || listing.length > 1000) {
          throw new Error("GitHub returned an incomplete schematic directory listing.");
        }
        for (const path of listing) {
          if (!validPath(path) || !/\.kicad_sch$/i.test(path) ||
              path.split("/").slice(0, -1).join("/") !== directory) {
            throw new Error("GitHub returned an unsafe schematic directory listing.");
          }
          candidates.add(path);
          if (candidates.size > PARENT_MAX_CANDIDATES) throw new Error("More than 24 parent-sheet candidates; open the project root directly.");
        }
      }
      await readBatch([...candidates]);
      const edges = new Map();
      for (const path of candidates) {
        const content = cache.get(path);
        edges.set(path, descendants(path, content));
      }
      const reachesLeaf = (path) => {
        const pending=[path],visited=new Set();
        while(pending.length){const current=pending.pop();if(current===file)return true;if(visited.has(current))continue;visited.add(current);for(const child of edges.get(current)||[])if(candidates.has(child)&&!visited.has(child))pending.push(child);}
        return false;
      };
      const ancestors = new Set([...candidates].filter((path) => cache.get(path) !== null && reachesLeaf(path)));
      const childAncestors = new Set();
      for (const path of ancestors) {
        for (const child of edges.get(path) || []) if (ancestors.has(child)) childAncestors.add(child);
      }
      roots = [...ancestors].filter((path) => !childAncestors.has(path)).sort();
      if (!roots.length) roots = [file];
      const reachable = new Set(), remaining = [...roots];
      while (remaining.length) {
        const path = remaining.pop(); if (reachable.has(path)) continue; reachable.add(path);
        for (const child of edges.get(path) || []) if (!reachable.has(child)) remaining.push(child);
      }
      // Unrelated candidates are discovery evidence, not retained project files.
      // Reclaim their byte budget before loading the actual hierarchy.
      retain(reachable);
      } catch (error) {
        roots = [file];
        retain(new Set([file]));
        discoveryWarning = `Parent-sheet discovery was incomplete (${error.message || "directory unavailable"}). Open the project root for its full hierarchy.`;
      }
    }
    const queue = [...roots], seen = new Set(), files = [];
    while (queue.length) {
      const batch = [];
      for (const path of queue.splice(0)) {
        if (seen.has(path)) continue;
        if (seen.size >= PROJECT_MAX_FILES) throw new Error(`Schematic hierarchy exceeds ${PROJECT_MAX_FILES} files; open a smaller subproject.`);
        seen.add(path); batch.push(path);
      }
      await readBatch(batch);
      for (const path of batch) {
        const content = cache.get(path);
        if (content === null) continue;
        files.push({ path, content });
        for (const child of descendants(path, content)) if (!seen.has(child)) queue.push(child);
      }
    }
    if (discoveryWarning && files.length) files[0].discoveryWarning = discoveryWarning;
    return files;
  }

  // Scope one cache to one repository revision/viewer. Cache transport successes,
  // never failures; the renderer still validates asset content before parsing.
  function createModelAssetCache(loadAsset, maxBytes = 24 * 1024 * 1024) {
    if (typeof loadAsset !== "function" || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 24 * 1024 * 1024) throw new Error("Invalid model asset cache configuration.");
    const cached = new Map(), inFlight = new Map(); let bytes = 0, generation = 0;
    async function load(path) {
      if (cached.has(path)) return cached.get(path);
      if (inFlight.has(path)) return inFlight.get(path);
      const current = generation;
      const work = (async () => {
        const result = await loadAsset(path), size = typeof result?.base64 === "string" ? result.base64.length * 2 : Infinity;
        // Account for UTF-16 storage, rather than only decoded model size.
        if (generation === current && size <= maxBytes - bytes && cached.size < 128) { cached.set(path, result); bytes += size; }
        return result;
      })();
      inFlight.set(path, work);
      try { return await work; } finally { if (inFlight.get(path) === work) inFlight.delete(path); }
    }
    function clear() { generation++; bytes = 0; cached.clear(); inFlight.clear(); }
    return { load, clear };
  }

  root.KiCadBrowserData = { validRepository, validRef, validPath, childPath, sheetFiles, loadProject, createModelAssetCache, fileByteLimit, PROJECT_MAX_BYTES, PROJECT_MAX_FILES, READ_CONCURRENCY };
  if (typeof module === "object" && module.exports) module.exports = root.KiCadBrowserData;
})(typeof globalThis === "object" ? globalThis : this);
