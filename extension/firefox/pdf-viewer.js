/* Firefox-native PDF presentation. No bundled renderer, remote viewer or PDF script engine. */
const $ = id => document.getElementById(id);
const tools = globalThis.KiCadPDFTools;
const params = new URLSearchParams(location.search);
const scope = Object.fromEntries(['repository', 'ref', 'provider', 'host'].filter(key => params.has(key)).map(key => [key, params.get(key)]));
if (!scope.ref && params.get('head')) scope.ref = params.get('head');
let generation = 0, inventoryGeneration = 0, currentURL = null, currentName = 'document.pdf';
let displayTimer = null, disposed = false;
const say = text => { $('status').textContent = String(text).slice(0, 4096); };

function filename(name) {
  const base = String(name || 'document.pdf').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').slice(0, 180);
  return base && /\.pdf$/i.test(base) ? base : (base || 'document') + '.pdf';
}
function controls() {
  for (const id of ['openNative', 'download', 'closeDocument']) $(id).disabled = !currentURL;
}
function clear() {
  generation++;
  clearTimeout(displayTimer);
  displayTimer = null;
  const frame = $('nativePDF');
  frame.onload = null;
  frame.src = 'about:blank';
  frame.hidden = true;
  $('viewport').setAttribute('aria-busy', 'false');
  if (currentURL) URL.revokeObjectURL(currentURL);
  currentURL = null;
  currentName = 'document.pdf';
  controls();
  return generation;
}
async function request(type, extra = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw Error('Project access is unavailable here. Use Open PDF.');
  const reply = await chrome.runtime.sendMessage({ type, ...scope, ...extra });
  if (!reply?.ok) throw Error(reply?.error || 'PDF unavailable.');
  return reply.result;
}
function displayPDF(input, name, token) {
  if (disposed || token !== generation) return false;
  const data = tools.bytes(input); // Validated binary header and 32 MiB limit before Blob allocation.
  currentName = filename(name);
  const blob = new Blob([data], { type: 'application/pdf' });
  currentURL = URL.createObjectURL(blob);
  $('title').textContent = String(name || currentName).slice(0, 512);
  const frame = $('nativePDF');
  const ready = () => {
    if (disposed || token !== generation) return;
    $('viewport').setAttribute('aria-busy', 'false');
    say('Firefox-native PDF · ' + (data.byteLength / (1024 * 1024)).toFixed(2) + ' MiB. If the viewport is blank, use Open in Firefox or Download PDF.');
  };
  frame.onload = ready;
  frame.src = currentURL;
  frame.hidden = false;
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.minHeight = '300px';
  frame.style.border = '0';
  $('viewport').setAttribute('aria-busy', 'true');
  controls();
  // Native PDF implementations do not all dispatch a reliable iframe load event.
  // This only retires loading UI; it does not claim successful rendering.
  displayTimer = setTimeout(ready, 2000);
  return true;
}
async function openPDF(input, name) {
  const token = clear();
  try { return displayPDF(input, name, token); }
  catch (error) { if (token === generation) { clear(); say('Unable to open PDF: ' + error.message); } return false; }
}
async function projectPDF(path) {
  const token = clear();
  try {
    if (typeof path !== 'string' || path.length > 4096 || /[\x00-\x1f\x7f]/.test(path) || !/\.pdf$/i.test(path)) throw Error('Choose a PDF project file.');
    say('Loading ' + path + '…');
    const input = await request('pdf-file', { file: path });
    return displayPDF(input, path, token);
  } catch (error) { if (!disposed && token === generation) { clear(); say('Unable to open project PDF: ' + error.message); } return false; }
}
$('files').onchange = async () => {
  const file = $('files').files[0];
  if (!file) return;
  const token = clear();
  try {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > tools.LIMITS.bytes) throw Error('PDF must be between 1 byte and 32 MiB.');
    say('Opening ' + file.name + '…');
    displayPDF(new Uint8Array(await file.arrayBuffer()), file.name, token);
  } catch (error) { if (!disposed && token === generation) { clear(); say('Unable to open PDF: ' + error.message); } }
  finally { $('files').value = ''; }
};
$('repository').disabled = !scope.repository && !globalThis.KiCadLocalRuntime;
$('repository').onclick = async () => {
  if (!$('sidebar').hidden && $('projectFiles').children.length) { $('sidebar').hidden = true; return; }
  const token = ++inventoryGeneration;
  try {
    say('Finding project PDFs…');
    const inventory = await request('project-inventory', { file: params.get('file') });
    if (disposed || token !== inventoryGeneration) return;
    if (!Array.isArray(inventory?.files) || inventory.files.length > 20000) throw Error('Invalid or excessive project inventory.');
    const files = inventory.files.filter(file => typeof file?.path === 'string' && /\.pdf$/i.test(file.path));
    $('projectFiles').replaceChildren();
    for (const file of files.slice(0, 1000)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = file.path.slice(0, 4096);
      button.onclick = () => { $('sidebar').hidden = true; projectPDF(file.path); };
      $('projectFiles').append(button);
    }
    $('sidebar').hidden = false;
    say(files.length ? 'Choose a project PDF.' + (files.length > 1000 ? ' Showing the first 1,000 files.' : '') : 'No PDFs found in this project. Use Open PDF.');
  } catch (error) { if (!disposed && token === inventoryGeneration) say(error.message); }
};
$('openNative').onclick = () => {
  if (!currentURL) return;
  window.open(currentURL, '_blank', 'noopener,noreferrer');
  say('Requested the native Firefox PDF tab. If it did not open, allow this user-requested tab or use Download PDF.');
};
$('download').onclick = () => {
  if (!currentURL) return;
  const link = document.createElement('a');
  link.href = currentURL;
  link.download = currentName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  say('PDF download requested. Check Firefox downloads.');
};
$('closeDocument').onclick = () => { inventoryGeneration++; clear(); $('title').textContent = 'PDF viewer'; say('Document closed.'); };
$('back').onclick = () => { inventoryGeneration++; clear(); history.back(); };
window.addEventListener('pagehide', () => { disposed = true; inventoryGeneration++; clear(); });
window.addEventListener('pageshow', event => { if (event.persisted) { disposed = false; say('Document closed while this page was inactive. Reopen a PDF.'); } });
controls();
if (/\.pdf$/i.test(params.get('file') || '')) projectPDF(params.get('file'));

export { openPDF };
