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
  function gitlabHost(value = 'https://gitlab.com') {
    let url;try { url = new URL(value); } catch { throw new Error('Invalid GitLab host.'); }
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||/[\s\\]/.test(value))throw new Error('Invalid GitLab host.');
    return url.origin;
  }
  function validateAttachment(value) {
    if(value?.provider==='gitlab'){
      const host=gitlabHost(value.host),repository=value.repository;
      if(value.mime!=='image/png'||typeof repository!=='string'||!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(repository)||repository.split('/').some(p=>p==='.'||p==='..')||!Number.isSafeInteger(value.projectId)||value.projectId<=0||![value.width,value.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1024))throw new Error('Invalid GitLab screenshot attachment.');
      let url;try{url=new URL(value.url);}catch{throw new Error('Invalid GitLab screenshot attachment URL.');}
      const tail='/uploads/[a-f0-9]{32}/kicad-review-[a-f0-9]{20}\\.png';
      const prefixes=[`/-/project/${value.projectId}`,`/${repository}`];
      if(url.origin!==host||url.username||url.password||url.search||url.hash||!prefixes.some(prefix=>url.pathname.startsWith(prefix)&&new RegExp('^'+tail+'$').test(url.pathname.slice(prefix.length))))throw new Error('Invalid GitLab screenshot attachment URL.');
      return {provider:'gitlab',host,repository,projectId:value.projectId,mime:'image/png',url:url.href,width:value.width,height:value.height};
    }
    if (!value || value.provider !== 'github' || value.mime !== 'image/png' ||
        typeof value.repository !== 'string' || !REPOSITORY.test(value.repository) ||
        value.repository.split('/').some(part => part === '.' || part === '..') ||
        ![value.width,value.height].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1024)) {
      throw new Error('Invalid GitHub screenshot attachment.');
    }
    if (typeof value.url !== 'string' || !/^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.url)) {
      throw new Error('Invalid GitHub screenshot attachment URL.');
    }
    return {provider:'github', repository:value.repository, mime:'image/png',url:value.url,width:value.width,height:value.height};
  }
  function normalizeScope(value) {
    if (!value || typeof value !== "object") throw new Error("Invalid comment file scope.");
    const { repository, ref, file } = value;const provider=value.provider||'github';if(!['github','gitlab'].includes(provider))throw new Error('Invalid comment provider.');
    if (typeof repository !== "string" || !(provider==='gitlab'?/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/:REPOSITORY).test(repository) || repository.split("/").some((part) => part === "." || part === "..")) {
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
    return { repository, ref, file,...(provider==='gitlab'?{provider,host:gitlabHost(value.host)}: {}) };
  }
  function normalizeAnchor(anchor) {
    const result = normalizeScope(anchor);
    for (const [name, limit] of [["uuid", 200], ["objectId", 200], ["reference", 100], ["netName", 500], ["kind", 80], ["variant", 100]]) {
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
    const threadType=comment.threadType;
    if(threadType!==undefined&&!["issue","discussion"].includes(threadType))throw new Error("Invalid review thread type.");
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
      if (!(comment.anchor?.provider==='gitlab'?/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/:MENTION).test(login)) throw new Error("Invalid annotation mention.");
      const key = login.toLowerCase();
      if (!mentionKeys.has(key)) { mentions.push(login); mentionKeys.add(key); }
    }
    const remoteRefs=comment.remoteRefs??[];
    if(!Array.isArray(remoteRefs)||remoteRefs.length>20)throw new Error("Too many GitHub references.");
    const refs=remoteRefs.map(remote=>{
      if (remote?.provider === 'gitlab') {
        const host=gitlabHost(remote.host),anchor=normalizeScope(comment.anchor);
        if(anchor.provider!=='gitlab'||anchor.host!==host||remote.repository!==anchor.repository||!['issue','discussion'].includes(remote.kind)||!Number.isSafeInteger(remote.number)||remote.number<1)throw new Error('Invalid GitLab annotation reference.');
        let url;try{url=new URL(remote.url);}catch{throw new Error('Invalid GitLab reference URL.');}
        if(url.origin!==host||url.username||url.password||url.search||url.pathname!==`/${remote.repository}/-/issues/${remote.number}`||(url.hash&&!/^#note_[0-9]+$/.test(url.hash)))throw new Error('Invalid GitLab reference URL.');
        if(typeof remote.publishedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(remote.publishedAt)||!Number.isFinite(Date.parse(remote.publishedAt)))throw new Error('Invalid GitLab publication time.');
        return {provider:'gitlab',host,kind:remote.kind,repository:remote.repository,number:remote.number,url:url.href,publishedAt:remote.publishedAt};
      }
      if(comment.anchor?.provider==='gitlab')throw new Error('GitHub thread references cannot be attached to GitLab notes.');
      if(!remote||!["issue","discussion"].includes(remote.kind)||typeof remote.repository!=="string"||!REPOSITORY.test(remote.repository)||remote.repository.split("/").some(p=>p==="."||p==="..")||!Number.isSafeInteger(remote.number)||remote.number<1)throw new Error("Invalid GitHub annotation reference.");
      let url;try{url=new URL(remote.url);}catch{throw new Error("Invalid GitHub reference URL.");}
      if(url.origin!=="https://github.com"||url.username||url.password||url.search||url.pathname!==`/${remote.repository}/${remote.kind==="issue"?"issues":"discussions"}/${remote.number}`||(url.hash&&!/^#(?:issuecomment|discussioncomment)-[0-9]+$/.test(url.hash)))throw new Error("Invalid GitHub reference URL.");
      if(typeof remote.publishedAt!=="string"||remote.publishedAt.length>40||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(remote.publishedAt)||!Number.isFinite(Date.parse(remote.publishedAt)))throw new Error("Invalid GitHub publication time.");
      const nodeId=optional(remote.nodeId,"GitHub node ID",200);
      return {kind:remote.kind,repository:remote.repository,number:remote.number,url:url.href,publishedAt:remote.publishedAt,...(nodeId?{nodeId}:{})};
    });
    let capture;
    if(comment.capture!==undefined){const c=comment.capture;if(!c||c.mime!=='image/png'||typeof c.dataUrl!=='string'||c.dataUrl.length>262144||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(c.dataUrl)||![c.width,c.height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1024))throw new Error('Invalid annotation screenshot.');capture={mime:c.mime,dataUrl:c.dataUrl,width:c.width,height:c.height};}
    const attachments=comment.attachments??[];
    if(!Array.isArray(attachments)||attachments.length>4)throw new Error('Invalid screenshot attachments.');
    const validatedAttachments=attachments.map(validateAttachment);
    const scope=normalizeScope(comment.anchor);
    if(validatedAttachments.some(a=>scope.provider==='gitlab'?a.provider!=='gitlab'||a.host!==scope.host||a.repository!==scope.repository:a.provider!=='github'))throw new Error('Screenshot attachment belongs to another provider, host or project.');
    return { ...(threadType?{threadType}:{}), id: comment.id, text: comment.text.trim(), createdAt: comment.createdAt, updatedAt, severity, state, tags:[...new Set(tags.map(tag=>tag.trim()))],mentions,remoteRefs:refs,...(capture?{capture}:{}),...(validatedAttachments.length?{attachments:validatedAttachments}:{}),
      anchor: normalizeAnchor(comment.anchor) };
  }
  const escaped = (value) => String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[\\`*_{}\[\]()#+.!|<>]/g, "\\$&").replace(/\r\n?|\n/g, " ");
  const escapedComment = (value) => String(value).split(/\r\n?|\n/).map(escaped).join("  \n");
  const tableCell = (value) => String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\\/g, "\\\\").replace(/[|`*_{}\[\]!~]/g, "\\$&").replace(/\r\n?|\n/g, " ")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function revisionUrl(anchor) {
    const ref = anchor.ref.split("/").map(encodeURIComponent).join("/");
    const file = anchor.file.split("/").map(encodeURIComponent).join("/");
    if(anchor.provider==='gitlab')return `${gitlabHost(anchor.host)}/${anchor.repository}/-/blob/${ref}/${file}`;
    return `https://github.com/${anchor.repository}/blob/${ref}/${file}`;
  }
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
    const fileUrl = revisionUrl(anchor);
    const fileValue = fileUrl ? `[${escaped(anchor.file)}](<${fileUrl}>)` : escaped(anchor.file);
    let targetLabel = "Component / object";
    let targetValue = [anchor.reference, anchor.kind && `(${anchor.kind})`].filter(Boolean).join(" ") || anchor.kind || "Drawing";
    if (anchor.kind === "net") {
      targetLabel = "Net";
      targetValue = anchor.netName || anchor.reference || anchor.objectId || "Unnamed net";
    }
    const rows = [
      ["Severity", note.severity[0].toUpperCase() + note.severity.slice(1)],
      ["Review state", note.state],
      ...(note.threadType ? [["Destination type", note.threadType === "discussion" ? "Discussion" : "Issue"]] : []),
      [targetLabel, targetValue],
      ...(anchor.position ? [["Position (mm)", `${anchor.position.x}, ${anchor.position.y}`]] : []),
      ...(anchor.area ? [["Area (mm)", `${anchor.area.x}, ${anchor.area.y}; ${anchor.area.width} × ${anchor.area.height}`]] : []),
      ["Repository", anchor.repository],
      ["Revision", anchor.ref],
      ["Design file", fileValue, true],
      ...(anchor.variant ? [["Variant", anchor.variant]] : []),
      ...(anchor.uuid ? [["KiCad UUID", anchor.uuid]] : []),
      ...(anchor.objectId ? [["Object ID", anchor.objectId]] : []),
      ["Tags", note.tags.length ? note.tags.join(", ") : "None"],
      ["Mentions", note.mentions.length ? note.mentions.map(login => `@${login}`).join(", ") : "None"],
      ["Created (UTC)", note.createdAt],
      ["Updated (UTC)", note.updatedAt]
    ];
    const lines = ["## KiCad visual review", "", "### Review comment", "", escapedComment(note.text), "",
      "### Design context", "", "| Detail | Value |", "| --- | --- |",
      ...rows.map(([label, item, rawMarkdown]) => `| ${tableCell(label)} | ${rawMarkdown ? item : tableCell(item)} |`)];
    if(note.attachments?.length)for(const attachment of note.attachments)lines.push('',`![Captured drawing area (${attachment.width} × ${attachment.height})](${attachment.url})`);
    else if(note.capture)lines.push("", "A drawing screenshot is stored with the local review note. Download it and attach it manually if needed.");
    const {capture,...metadata}=note;
    lines.push("", `<!-- kicad-review:v1 ${encodeNote(metadata)} -->`);
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
      const key = JSON.stringify([...(note.anchor.provider==='gitlab'?['gitlab',note.anchor.host||'https://gitlab.com']:[]),note.anchor.repository, note.anchor.ref, note.anchor.file, note.id]);
      if (seen.has(key)) throw new Error("Duplicate comment id in import.");
      seen.add(key);
    }
    return comments;
  }
  function parseSidecar(text){
    if(typeof text!=="string"||new TextEncoder().encode(text).length>4*1024*1024)throw new Error("Review file exceeds 4 MiB.");
    let data;try{data=JSON.parse(text);}catch{throw new Error("Invalid review file JSON.");}
    if(data?.schemaVersion!==1||!Array.isArray(data.annotations)||data.annotations.length>1000||Object.keys(data).some(key=>!["schemaVersion","annotations"].includes(key)))throw new Error("Unsupported review file schema.");
    const seen=new Set();return data.annotations.map(note=>{const valid=validateComment(note),key=JSON.stringify([...(valid.anchor.provider==='gitlab'?['gitlab',valid.anchor.host]:[]),valid.anchor.repository,valid.anchor.ref,valid.anchor.file,valid.id]);if(seen.has(key))throw new Error("Duplicate annotation in review file.");seen.add(key);return valid;});
  }
  function serializeSidecar(notes){return JSON.stringify({schemaVersion:1,annotations:parseSidecar(JSON.stringify({schemaVersion:1,annotations:notes})).sort((a,b)=>JSON.stringify([...(a.anchor.provider==='gitlab'?['gitlab',a.anchor.host]:[]),a.anchor.repository,a.anchor.ref,a.anchor.file,a.id])<JSON.stringify([...(b.anchor.provider==='gitlab'?['gitlab',b.anchor.host]:[]),b.anchor.repository,b.anchor.ref,b.anchor.file,b.id])?-1:JSON.stringify([...(a.anchor.provider==='gitlab'?['gitlab',a.anchor.host]:[]),a.anchor.repository,a.anchor.ref,a.anchor.file,a.id])>JSON.stringify([...(b.anchor.provider==='gitlab'?['gitlab',b.anchor.host]:[]),b.anchor.repository,b.anchor.ref,b.anchor.file,b.id])?1:0)},null,2)+"\n";}
  function receiptKey(note, user) {
    if (typeof user !== "string" || !MENTION.test(user)) throw new Error("Invalid review reader identity.");
    const normalized = validateComment(note);
    const anchor = normalized.anchor;
    return JSON.stringify(["kicad-review-read-v1", user.toLowerCase(), ...(anchor.provider==='gitlab'?['gitlab',anchor.host]:[]),anchor.repository, anchor.ref, anchor.file, normalized.id]);
  }
  function isUnread(note, receipt) {
    return typeof receipt !== "string" || !Number.isFinite(Date.parse(receipt)) ||
      Date.parse(receipt) < Date.parse(note.updatedAt || note.createdAt);
  }
  function sortAndFilter(notes, filters = {}, readAt = () => undefined) {
    const severity = filters.severity || "all", state = filters.state || "all", read = filters.read || "all";
    const order = filters.order || "severity", query = String(filters.query || "").trim().toLowerCase().slice(0, 2000);
    if (!["all",...SEVERITIES].includes(severity) || !["all","closed",...STATES].includes(state) ||
      !["all","read","unread"].includes(read) || !["severity","severity-lowest","newest","oldest","updated","updated-oldest"].includes(order)) {
      throw new Error("Invalid comment filter.");
    }
    const rank = {critical:0,major:1,minor:2,info:3};
    return [...notes].filter((note) => {
      const unread = isUnread(note, readAt(note));
      return (severity === "all" || (note.severity || "info") === severity) &&
        (state === "all" || (state === "closed" ? ["resolved","wont-fix"].includes(note.state) : (note.state || "open") === state)) &&
        (read === "all" || (read === "unread") === unread) &&
        (!query || [note.text,note.anchor?.reference,...(note.tags || []),...(note.mentions || [])]
          .join(" ").toLowerCase().includes(query));
    }).sort((a,b) => {
      if (order === "severity" || order === "severity-lowest") return (order === "severity" ? 1 : -1) * ((rank[a.severity || "info"] ?? 4) - (rank[b.severity || "info"] ?? 4)) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (order === "updated" || order === "updated-oldest") return (order === "updated" ? 1 : -1) * (Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
      return order === "newest" ? Date.parse(b.createdAt) - Date.parse(a.createdAt) :
        Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
  }
  return { normalizeScope, normalizeAnchor, validateComment, validateAttachment, toMarkdown, fromMarkdown, parseSidecar, serializeSidecar,
    exportComments, parseComments, receiptKey, isUnread, sortAndFilter };
})();

if (typeof globalThis === "object") globalThis.KiCadReviewComments = KiCadReviewComments;
if (typeof module === "object" && module.exports) module.exports = KiCadReviewComments;
