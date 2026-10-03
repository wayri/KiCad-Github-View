"use strict";

// Pure validation and interchange helpers. Nothing here posts to GitHub.
const KiCadReviewComments = (() => {
  const FORMAT = "kicad-visual-review-comments";
  const MAX_IMPORT = 1024 * 1024;
  const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const REF = /^[A-Za-z0-9._/-]{1,200}$/;
  const ID = /^[A-Za-z0-9_-]{1,100}$/;
  const PATH = /^[^\\\x00-\x1f\x7f]+\.kicad_(?:sch|pcb)$/i;
  const SEVERITIES = new Set(["info", "minor", "major", "critical"]);
  const STATES = new Set(["open", "skipped", "resolved", "wont-fix"]);
  const MENTION = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const MARKER = /<!-- kicad-review:v1 ([A-Za-z0-9_-]{1,32000}) -->/g;
  const optional = (value, name, limit) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) {
      throw new Error(`Invalid comment ${name}.`);
    }
    return value.trim();
  };
  function normalizeScope(value) {
    if (!value || typeof value !== "object") throw new Error("Invalid comment file scope.");
    const { repository, ref, file } = value;
    if (typeof repository !== "string" || !REPOSITORY.test(repository) || repository.split("/").some((part) => part === "." || part === "..")) {
      throw new Error("Invalid comment repository.");
    }
    if (typeof ref !== "string" || !REF.test(ref) || ref.startsWith("/") || ref.endsWith("/") ||
        ref.split("/").some((part) => part === "." || part === "..") || ref.includes("..")) {
      throw new Error("Invalid comment revision.");
    }
    if (typeof file !== "string" || file.length > 500 || !PATH.test(file) || file.startsWith("/") ||
        file.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid KiCad comment file.");
    }
    return { repository, ref, file };
  }
  function normalizeAnchor(anchor) {
    const result = normalizeScope(anchor);
    for (const [name, limit] of [["uuid", 200], ["objectId", 200], ["reference", 100], ["kind", 80], ["variant", 100]]) {
      const value = optional(anchor[name], name, limit);
      if (value !== undefined) result[name] = value;
    }
    if (anchor.position !== undefined && anchor.position !== null) {
      const { x, y } = anchor.position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) {
        throw new Error("Invalid comment position.");
      }
      result.position = { x, y };
    }
    if(anchor.area!==undefined){const {x,y,width,height}=anchor.area||{};if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||width>1e6||height>1e6||[x,y,x+width,y+height].some(n=>Math.abs(n)>1e6))throw new Error('Invalid comment area.');result.area={x,y,width,height};}
    return result;
  }
  function validateComment(comment) {
    if (!comment || typeof comment !== "object") throw new Error("Invalid review comment.");
    if (typeof comment.id !== "string" || !ID.test(comment.id)) throw new Error("Invalid comment id.");
    if (typeof comment.text !== "string" || !comment.text.trim() || comment.text.length > 4000) {
      throw new Error("Comment text must contain 1–4,000 characters.");
    }
    if (typeof comment.createdAt !== "string" || comment.createdAt.length > 40 ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(comment.createdAt) ||
        !Number.isFinite(Date.parse(comment.createdAt)) ||
        new Date(comment.createdAt).toISOString().slice(0, 19) !== comment.createdAt.slice(0, 19)) {
      throw new Error("Invalid comment creation time.");
    }
    const severity = comment.severity ?? "info";
    if (!SEVERITIES.has(severity)) throw new Error("Invalid comment severity.");
    const state=comment.state??"open";
    if (!STATES.has(state)) throw new Error("Invalid annotation state.");
    const tags=comment.tags??[];
    if(!Array.isArray(tags)||tags.length>20||tags.some(tag=>typeof tag!=="string"||!tag.trim()||tag.length>40||/[\x00-\x1f\x7f]/.test(tag)))throw new Error("Invalid annotation tags.");
    const updatedAt=comment.updatedAt??comment.createdAt;
    if(typeof updatedAt!=="string"||updatedAt.length>40||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(updatedAt)||!Number.isFinite(Date.parse(updatedAt))||new Date(updatedAt).toISOString().slice(0,19)!==updatedAt.slice(0,19))throw new Error("Invalid annotation update time.");
    if (Date.parse(updatedAt) < Date.parse(comment.createdAt)) throw new Error("Comment update time precedes creation time.");
    const inputMentions = comment.mentions ?? [];
    if (!Array.isArray(inputMentions) || inputMentions.length > 20) throw new Error("Invalid annotation mentions.");
    const mentions = [];
    const mentionKeys = new Set();
    for (const raw of inputMentions) {
      if (typeof raw !== "string") throw new Error("Invalid annotation mention.");
      const login = raw.startsWith("@") ? raw.slice(1) : raw;
      if (!MENTION.test(login)) throw new Error("Invalid annotation mention.");
      const key = login.toLowerCase();
      if (!mentionKeys.has(key)) { mentions.push(login); mentionKeys.add(key); }
    }
    const remoteRefs=comment.remoteRefs??[];
    if(!Array.isArray(remoteRefs)||remoteRefs.length>20)throw new Error("Too many GitHub references.");
    const refs=remoteRefs.map(remote=>{
      if(!remote||!["issue","discussion"].includes(remote.kind)||typeof remote.repository!=="string"||!REPOSITORY.test(remote.repository)||remote.repository.split("/").some(p=>p==="."||p==="..")||!Number.isSafeInteger(remote.number)||remote.number<1)throw new Error("Invalid GitHub annotation reference.");
      let url;try{url=new URL(remote.url);}catch{throw new Error("Invalid GitHub reference URL.");}
      if(url.origin!=="https://github.com"||url.username||url.password||url.search||url.pathname!==`/${remote.repository}/${remote.kind==="issue"?"issues":"discussions"}/${remote.number}`||(url.hash&&!/^#(?:issuecomment|discussioncomment)-[0-9]+$/.test(url.hash)))throw new Error("Invalid GitHub reference URL.");
      if(typeof remote.publishedAt!=="string"||remote.publishedAt.length>40||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(remote.publishedAt)||!Number.isFinite(Date.parse(remote.publishedAt)))throw new Error("Invalid GitHub publication time.");
      const nodeId=optional(remote.nodeId,"GitHub node ID",200);
      return {kind:remote.kind,repository:remote.repository,number:remote.number,url:url.href,publishedAt:remote.publishedAt,...(nodeId?{nodeId}:{})};
    });
    let capture;
    if(comment.capture!==undefined){const c=comment.capture;if(!c||c.mime!=='image/png'||typeof c.dataUrl!=='string'||c.dataUrl.length>262144||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(c.dataUrl)||![c.width,c.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1024))throw new Error('Invalid annotation screenshot.');capture={mime:c.mime,dataUrl:c.dataUrl,width:c.width,height:c.height};}
    return { id: comment.id, text: comment.text.trim(), createdAt: comment.createdAt, updatedAt, severity, state, tags:[...new Set(tags.map(tag=>tag.trim()))],mentions,remoteRefs:refs,...(capture?{capture}:{}),
      anchor: normalizeAnchor(comment.anchor) };
  }
  const escaped = (value) => String(value).replace(/[\\`*_{}\[\]()#+.!|<>]/g, "\\$&").replace(/\r?\n/g, " ");
  function encodeNote(note) {
    const bytes = new TextEncoder().encode(JSON.stringify(note));
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeNote(encoded) {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - encoded.length % 4) % 4));
    return validateComment(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)))));
  }
  function toMarkdown(value) {
    const note = validateComment(value), anchor = note.anchor;
    const lines = ["### KiCad visual review note", "", `- Severity: ${note.severity[0].toUpperCase()}${note.severity.slice(1)}`,
      `- State: ${escaped(note.state)}`,
      `- Tags: ${note.tags.map(escaped).join(", ") || "none"}`,
      `- Mentions: ${note.mentions.map((login) => `@${escaped(login)}`).join(", ") || "none"}`,
      `- Created: ${note.createdAt}`,
      `- Updated: ${note.updatedAt}`,
      `- Repository: ${escaped(anchor.repository)}`,
      `- Revision: ${escaped(anchor.ref)}`,
      `- File: ${escaped(anchor.file)}`];
    for (const [name, label] of [["uuid", "UUID"], ["objectId", "Object ID"],
      ["reference", "Reference"], ["kind", "Kind"], ["variant", "Variant"]]) {
      if (anchor[name]) lines.push(`- ${label}: ${escaped(anchor[name])}`);
    }
    if (anchor.position) lines.push(`- Position (mm): ${anchor.position.x}, ${anchor.position.y}`);
    if(anchor.area)lines.push(`- Area (mm): ${anchor.area.x}, ${anchor.area.y}; ${anchor.area.width} × ${anchor.area.height}`);
    if(note.capture)lines.push('- Screenshot: stored in the Git review file; attach the downloaded PNG in the GitHub composer.');
    const {capture,...metadata}=note;
    lines.push("", note.text, "", `<!-- kicad-review:v1 ${encodeNote(metadata)} -->`);
    return lines.join("\n");
  }
  function fromMarkdown(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_IMPORT) {
      throw new Error("GitHub annotation body exceeds 1 MiB.");
    }
    const notes = [];
    for (const match of text.matchAll(MARKER)) {
      if (notes.length >= 100) break;
      try { notes.push(decodeNote(match[1])); } catch { /* Ignore unrelated or malformed markers. */ }
    }
    return notes;
  }
  function exportComments(notes) {
    if (!Array.isArray(notes) || notes.length > 100) throw new Error("Too many review comments to export.");
    const text=JSON.stringify({ format: FORMAT, version: 1, comments: notes.map(validateComment) }, null, 2);
    if(new TextEncoder().encode(text).length>MAX_IMPORT)throw new Error('Export exceeds 1 MiB; use the Git review file or remove screenshots.');
    return text;
  }
  function parseComments(text) {
    if (typeof text !== "string" || text.length > MAX_IMPORT ||
        new TextEncoder().encode(text).length > MAX_IMPORT) throw new Error("Comment import exceeds 1 MiB.");
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("Invalid comment JSON."); }
    if (data?.format !== FORMAT || data.version !== 1 || !Array.isArray(data.comments) || data.comments.length > 100) {
      throw new Error("Unsupported review comment export.");
    }
    const comments = data.comments.map(validateComment);
    const seen = new Set();
    for (const note of comments) {
      const key = JSON.stringify([note.anchor.repository, note.anchor.ref, note.anchor.file, note.id]);
      if (seen.has(key)) throw new Error("Duplicate comment id in import.");
      seen.add(key);
    }
    return comments;
  }
  function parseSidecar(text){
    if(typeof text!=="string"||new TextEncoder().encode(text).length>4*1024*1024)throw new Error("Review file exceeds 4 MiB.");
    let data;try{data=JSON.parse(text);}catch{throw new Error("Invalid review file JSON.");}
    if(data?.schemaVersion!==1||!Array.isArray(data.annotations)||data.annotations.length>1000||Object.keys(data).some(key=>!["schemaVersion","annotations"].includes(key)))throw new Error("Unsupported review file schema.");
    const seen=new Set();return data.annotations.map(note=>{const valid=validateComment(note),key=JSON.stringify([valid.anchor.repository,valid.anchor.ref,valid.anchor.file,valid.id]);if(seen.has(key))throw new Error("Duplicate annotation in review file.");seen.add(key);return valid;});
  }
  function serializeSidecar(notes){return JSON.stringify({schemaVersion:1,annotations:parseSidecar(JSON.stringify({schemaVersion:1,annotations:notes})).sort((a,b)=>JSON.stringify([a.anchor.repository,a.anchor.ref,a.anchor.file,a.id])<JSON.stringify([b.anchor.repository,b.anchor.ref,b.anchor.file,b.id])?-1:JSON.stringify([a.anchor.repository,a.anchor.ref,a.anchor.file,a.id])>JSON.stringify([b.anchor.repository,b.anchor.ref,b.anchor.file,b.id])?1:0)},null,2)+"\n";}
  function receiptKey(note, user) {
    if (typeof user !== "string" || !MENTION.test(user)) throw new Error("Invalid review reader identity.");
    const normalized = validateComment(note);
    const anchor = normalized.anchor;
    return JSON.stringify(["kicad-review-read-v1", user.toLowerCase(), anchor.repository, anchor.ref, anchor.file, normalized.id]);
  }
  function isUnread(note, receipt) {
    return typeof receipt !== "string" || !Number.isFinite(Date.parse(receipt)) ||
      Date.parse(receipt) < Date.parse(note.updatedAt || note.createdAt);
  }
  function sortAndFilter(notes, filters = {}, readAt = () => undefined) {
    const severity = filters.severity || "all", state = filters.state || "all", read = filters.read || "all";
    const order = filters.order || "severity", query = String(filters.query || "").trim().toLowerCase().slice(0, 2000);
    if (!["all",...SEVERITIES].includes(severity) || !["all",...STATES].includes(state) ||
      !["all","read","unread"].includes(read) || !["severity","newest","oldest","updated"].includes(order)) {
      throw new Error("Invalid comment filter.");
    }
    const rank = {critical:0,major:1,minor:2,info:3};
    return [...notes].filter((note) => {
      const unread = isUnread(note, readAt(note));
      return (severity === "all" || (note.severity || "info") === severity) &&
        (state === "all" || (note.state || "open") === state) &&
        (read === "all" || (read === "unread") === unread) &&
        (!query || [note.text,note.anchor?.reference,...(note.tags || []),...(note.mentions || [])]
          .join(" ").toLowerCase().includes(query));
    }).sort((a,b) => {
      if (order === "severity") return (rank[a.severity || "info"] ?? 4) - (rank[b.severity || "info"] ?? 4) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (order === "updated") return Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
      return order === "newest" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) :
        Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
  }
  return { normalizeScope, normalizeAnchor, validateComment, toMarkdown, fromMarkdown, parseSidecar, serializeSidecar,
    exportComments, parseComments, receiptKey, isUnread, sortAndFilter };
})();

if (typeof globalThis === "object") globalThis.KiCadReviewComments = KiCadReviewComments;
if (typeof module === "object" && module.exports) module.exports = KiCadReviewComments;
