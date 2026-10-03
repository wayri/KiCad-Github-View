/* Public GitHub project retrieval for the hosted, browser-only viewer. */
((root) => {
  "use strict";
  const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const designPattern = /\.kicad_(?:sch|pcb)$/i;
  const MAX_FILE = 8 * 1024 * 1024;
  const MAX_PROJECT = 24 * 1024 * 1024;

  function validRepository(value) {
    return typeof value === "string" && repositoryPattern.test(value) &&
      value.split("/").every((part) => part !== "." && part !== "..");
  }
  function validPath(value) {
    return typeof value === "string" && designPattern.test(value) && !value.startsWith("/") &&
      value.split("/").every((part) => part && part !== "." && part !== ".." && !/[\\\0]/.test(part));
  }
  function validRef(value) {
    return typeof value === "string" && !!value && value.length <= 200 && !/[\x00-\x1f]/.test(value);
  }
  function childPath(parent, name) {
    if (!validPath(parent) || typeof name !== "string" || !/\.kicad_sch$/i.test(name) ||
      name.startsWith("/") || /[\\\0:]/.test(name)) return null;
    const parts = parent.split("/").slice(0, -1);
    for (const part of name.split("/")) {
      if (part === "..") { if (!parts.length) return null; parts.pop(); }
      else if (part && part !== ".") parts.push(part);
    }
    const path = parts.join("/");
    return validPath(path) ? path : null;
  }
  function sheetFiles(source) {
    const result = [];
    const expression = /\(property\s+"Sheetfile"\s+("(?:\\.|[^"\\])*")/g;
    for (const match of source.matchAll(expression)) {
      try { result.push(JSON.parse(match[1])); } catch { /* Ignore malformed names. */ }
    }
    return result;
  }
  async function githubResponse(url, accept = "application/vnd.github+json") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" },
        credentials: "omit", cache: "no-store", signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
      return response;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("GitHub request timed out.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function githubFile(repository, ref, path) {
    if (!validRepository(repository) || !validRef(ref) || !validPath(path)) throw new Error("Invalid GitHub file location.");
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const response = await githubResponse(`https://api.github.com/repos/${repository}/contents/${encoded}?ref=${encodeURIComponent(ref)}`,
      "application/vnd.github.raw+json");
    if (!response) return null;
    if (Number(response.headers.get("content-length")) > MAX_FILE) throw new Error("KiCad file exceeds 8 MiB.");
    const body = await response.text();
    if (body.length > MAX_FILE * 1.5) throw new Error("KiCad file exceeds 8 MiB.");
    if (!response.headers.get("content-type")?.includes("json")) return body;
    let data;
    try { data = JSON.parse(body); } catch { return body; }
    if (typeof data.content !== "string" || data.encoding !== "base64") throw new Error("GitHub did not return KiCad source.");
    const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, "")), (character) => character.charCodeAt(0));
    if (bytes.byteLength > MAX_FILE) throw new Error("KiCad file exceeds 8 MiB.");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  async function loadProject(repository, ref, file, readFile = githubFile) {
    if (!validRepository(repository) || !validRef(ref) || !validPath(file)) throw new Error("Invalid GitHub project location.");
    const queue = [file], seen = new Set(), files = [];
    let total = 0;
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      if (seen.size >= 32) throw new Error("Schematic exceeds the 32-sheet preview limit.");
      seen.add(path);
      const content = await readFile(repository, ref, path);
      if (content === null) { if (path === file) throw new Error("KiCad file is absent at this revision."); continue; }
      if (typeof content !== "string") throw new Error("GitHub returned invalid KiCad source.");
      const size = new TextEncoder().encode(content).length;
      total += size;
      if (size > MAX_FILE || total > MAX_PROJECT) throw new Error("Project exceeds the browser preview size limit.");
      files.push({ path, content });
      if (path.endsWith(".kicad_sch")) for (const name of sheetFiles(content)) {
        const child = childPath(path, name);
        if (child && !seen.has(child)) queue.push(child);
      }
    }
    return files;
  }
  root.PublicKiCadData = { validRepository, validPath, validRef, childPath, sheetFiles, githubFile, loadProject };
  if (typeof module === "object" && module.exports) module.exports = root.PublicKiCadData;
})(typeof globalThis === "object" ? globalThis : this);
