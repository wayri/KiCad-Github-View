"use strict";

(() => {
  const params = new URLSearchParams(location.search);
  const repository = params.get("repository"), ref = params.get("ref"), rootFile = params.get("file");
  const pcb = /\.kicad_pcb$/i.test(rootFile || "");
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  let canvas = null, scene = null, dark = pcb, files = [], currentDesign = null;

  function showProperties(primitive) {
    const details = $("properties");
    details.replaceChildren();
    const fields = primitive ? [
      ["Kind", primitive.kind || primitive.type], ["Reference", primitive.reference],
      ["Name", primitive.name], ["Property", primitive.property],
      ["Layer", primitive.layer], ["UUID", primitive.uuid],
      ["Position (mm)", Number.isFinite(primitive.x) && Number.isFinite(primitive.y)
        ? `${primitive.x}, ${primitive.y}` : null]
    ] : [["Selection", "Click a component or board feature."]];
    for (const [name, value] of fields) {
      if (value === undefined || value === null || value === "") continue;
      const term = document.createElement("dt"), description = document.createElement("dd");
      term.textContent = name; description.textContent = String(value);
      details.append(term, description);
    }
  }

  function drawingBounds() {
    if (!currentDesign || pcb) return null;
    const drawing = currentDesign.primitives.filter((primitive) =>
      !["page", "page-frame", "title-block"].includes(primitive.kind));
    const bounds = KiCadOwnedCanvas.bounds(drawing);
    if (!bounds) return null;
    const margin = Math.max(5, Math.max(bounds.w, bounds.h) * .08);
    return { x: bounds.x - margin, y: bounds.y - margin,
      w: bounds.w + 2 * margin, h: bounds.h + 2 * margin };
  }

  function fit(kind) {
    if (!canvas || scene) return;
    if (kind === "page") canvas.zoom_to_page();
    else if (pcb) canvas.zoom_to_board();
    else {
      const bounds = drawingBounds();
      if (bounds) canvas.viewport.camera.bbox = bounds;
      else canvas.zoom_to_page();
    }
    canvas.draw();
  }

  function showLayers() {
    const panel = $("layerPanel"), list = $("layerList");
    panel.hidden = !pcb;
    list.replaceChildren();
    if (!pcb) return;
    for (const layer of currentDesign.layers || []) {
      const label = document.createElement("label"), input = document.createElement("input");
      const text = document.createElement("span");
      label.className = "layer"; input.type = "checkbox";
      input.checked = canvas.visibleLayers.has(layer);
      input.onchange = () => {
        if (input.checked) canvas.visibleLayers.add(layer);
        else canvas.visibleLayers.delete(layer);
        canvas.draw();
      };
      text.textContent = layer;
      label.append(input, text); list.append(label);
    }
  }

  function openSheet(path) {
    const file = files.find((item) => item.path === path);
    if (!file || /\.kicad_pcb$/i.test(path) !== pcb) throw new Error("The selected KiCad sheet is unavailable.");
    const engine = pcb ? KiCadPCBRenderer : KiCadSchematicRenderer;
    currentDesign = engine.build(KiCadDesignDiff.parse(file.content), path);
    canvas.setDocument(currentDesign, path);
    $("sheetSelect").value = path;
    $("warning").textContent = currentDesign.warnings?.join(" ") || "";
    $("warning").hidden = !$("warning").textContent;
    showProperties(null); showLayers(); fit("drawing");
  }

  async function start() {
    if (!PublicKiCadData.validRepository(repository) || !PublicKiCadData.validRef(ref) ||
        !PublicKiCadData.validPath(rootFile)) throw new Error("Invalid GitHub design location.");
    files = await PublicKiCadData.loadProject(repository, ref, rootFile);
    if (!files.some((file) => file.path === rootFile)) throw new Error("No KiCad file at this revision.");
    $("viewportRow").hidden = false;
    $("frameControls").hidden = false;
    status.hidden = true;
    canvas = KiCadOwnedCanvas.mount($("drawingHost"), { pcb, dark });
    canvas.addEventListener("kicad:select", () => showProperties(canvas.selected));
    const sheetPanel = $("sheetPanel"), sheetSelect = $("sheetSelect");
    sheetPanel.hidden = pcb;
    sheetSelect.replaceChildren();
    if (!pcb) for (const file of files.filter((item) => /\.kicad_sch$/i.test(item.path))) {
      const option = document.createElement("option");
      option.value = file.path; option.textContent = file.path;
      sheetSelect.append(option);
    }
    sheetSelect.onchange = () => {
      try { openSheet(sheetSelect.value); }
      catch (error) { $("warning").textContent = error.message; $("warning").hidden = false; }
    };
    openSheet(rootFile);
    $("fitDrawing").textContent = pcb ? "Fit board" : "Fit drawing";
    $("fitDrawing").onclick = () => fit("drawing");
    $("fitPage").onclick = () => fit("page");
    const theme = $("themeButton");
    theme.textContent = pcb ? "Dark board" : "Dark paper";
    theme.setAttribute("aria-pressed", String(dark));
    theme.onclick = () => {
      dark = !dark; canvas.dark = dark;
      theme.setAttribute("aria-pressed", String(dark)); canvas.draw();
    };
    if (pcb) {
      const mode = $("mode3d"), pane = $("threePane"), viewport = $("viewportRow");
      mode.hidden = false;
      let busy = false, loading = null;
      const loadScene = () => loading ||= new Promise((resolve, reject) => {
        if (globalThis.SpikeBoard3D?.mountBoard3D) { resolve(globalThis.SpikeBoard3D); return; }
        const script = document.createElement("script");
        script.src = "vendor/spike-board3d.bundle.js";
        script.onload = () => globalThis.SpikeBoard3D?.mountBoard3D
          ? resolve(globalThis.SpikeBoard3D) : reject(new Error("SPIKE 3D did not initialize."));
        script.onerror = () => { loading = null; reject(new Error("SPIKE 3D could not be loaded.")); };
        document.head.append(script);
      });
      mode.onclick = async () => {
        if (busy) return;
        if (scene) {
          scene.dispose(); scene = null; pane.hidden = true; viewport.hidden = false;
          mode.setAttribute("aria-pressed", "false"); canvas.resize(); canvas.draw(); return;
        }
        busy = true; mode.disabled = true;
        try {
          const engine = await loadScene();
          scene = engine.mountBoard3D(pane, files.find((file) => file.path === rootFile).content);
          viewport.hidden = true; pane.hidden = false; mode.setAttribute("aria-pressed", "true");
        } catch (error) {
          $("warning").textContent = error.message || String(error);
          $("warning").hidden = false;
        } finally { busy = false; mode.disabled = false; }
      };
    }
  }

  addEventListener("pagehide", () => { scene?.dispose(); canvas?.dispose(); });
  $('detailsButton').addEventListener('click',()=>{const b=$('detailsButton');b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));});
  $('drawingHost').addEventListener('pointerdown',()=>$('detailsButton').setAttribute('aria-expanded','false'));
  addEventListener('keydown',e=>{if(e.key==='Escape')$('detailsButton').setAttribute('aria-expanded','false');});
  start().catch((error) => {
    scene?.dispose(); canvas?.dispose(); canvas = null;
    $("viewportRow").hidden = true; $("frameControls").hidden = true;
    status.hidden = false; status.textContent = error.message || String(error);
    status.classList.add("error");
  });
})();
