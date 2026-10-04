import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLLoader } from "three/addons/loaders/VRMLLoader.js";
import "../design-diff.js";
import "../repo-models.js";
import { parseKicadBoard } from "@spike/boardParser";
import { layerThreeColor } from "@spike/layerPalette";
import { trackCapsuleDimensions } from "@spike/trackGeometry";
import { viewportSceneIdentity } from "@spike/viewportScenePolicy";
import { populationMask, uniqueComponentIndexes } from "./componentState.mjs";

const STYLE = `
  :host{display:block;width:100%;height:100%;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
    --ink:#e7f3ef;--surface:#0b1720;--bar:#172832;--border:#39515a;--accent:#9ee4c2;
    --muted:#b1c9cf;--button:#27414a;--button-border:#4a6870;--button-ink:#f0faf7;
    --hint:#0d1c27e8;--panel:#10232df2;--menu:#1a333a;--notice:#18272d;color:var(--ink)}
  :host([data-theme="light"]){--ink:#172e36;--surface:#f3f7f5;--bar:#e5efea;--border:#a7bdb9;
    --accent:#175d48;--muted:#405c61;--button:#fff;--button-border:#83a79b;--button-ink:#173b33;
    --hint:#fffefaed;--panel:#fffffff2;--menu:#fff;--notice:#e8f1ec}
  *{box-sizing:border-box}.shell{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--surface)}
  .bar{display:flex;align-items:center;gap:9px;min-height:42px;padding:6px 9px;background:var(--bar);border-bottom:1px solid var(--border);flex-wrap:wrap}
  .title{font-weight:700;color:var(--accent);white-space:nowrap}.detail{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}.spacer{flex:1}
  button{background:var(--button);border:1px solid var(--button-border);color:var(--button-ink);padding:5px 9px;border-radius:5px;font:600 12px system-ui;cursor:pointer}
  button:hover{border-color:var(--accent)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  label{display:flex;align-items:center;gap:4px;white-space:nowrap;color:var(--ink)}input{accent-color:var(--accent)}
  .stage{position:relative;flex:1;min-height:0;overflow:hidden}.canvas{position:absolute;inset:0}.canvas canvas{display:block;width:100%;height:100%}
  .hint{position:absolute;left:12px;bottom:10px;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--hint);color:var(--ink);pointer-events:none}
  .inspector{position:absolute;right:12px;bottom:12px;width:min(280px,45%);max-height:50%;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:10px;box-shadow:0 8px 28px #0005}
  .inspector[hidden],.menu[hidden]{display:none}.inspector h2{font-size:13px;margin:0 0 6px;color:var(--accent)}.inspector dl{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin:0}.inspector dt{color:var(--muted)}.inspector dd{margin:0;overflow-wrap:anywhere}
  .menu{position:absolute;z-index:4;display:grid;gap:3px;padding:5px;border:1px solid var(--border);border-radius:5px;background:var(--menu);box-shadow:0 7px 25px #0005}
  .notice{padding:5px 9px;background:var(--notice);color:var(--muted);font-size:11px;border-top:1px solid var(--border)}
  @media(max-width:700px){.detail{display:none}.bar{gap:5px}.hint{display:none}.inspector{width:min(260px,65%)}}
`;

function pathFor(points, transform) {
  const path = new THREE.Path();
  points.forEach((point, index) => {
    const [x, y] = transform(point);
    if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
  });
  return path;
}

function boardShape(board, transform) {
  const loops = board.outlineLoops?.filter((loop) => loop.length >= 3) || [];
  const outer = loops[0] || [
    [board.bounds.minX, board.bounds.minY], [board.bounds.maxX, board.bounds.minY],
    [board.bounds.maxX, board.bounds.maxY], [board.bounds.minX, board.bounds.maxY]
  ];
  const shape = new THREE.Shape();
  pathFor(outer, transform).getPoints().forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y); else shape.lineTo(point.x, point.y);
  });
  for (const loop of loops.slice(1)) shape.holes.push(pathFor(loop, transform));
  return shape;
}

function makeInstanced(group, geometry, material, records, place, identity) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  const object = new THREE.Object3D();
  records.forEach((item, index) => {
    place(object, item);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.records = records;
  mesh.userData.identity = identity;
  group.add(mesh);
  return mesh;
}

export function mountBoard3D(container, source, options = {}) {
  options ||= {};
  const initialDark = options.dark !== false;
  const board = parseKicadBoard(source);
  if (!board?.bounds || !Number.isFinite(board.width) || !Number.isFinite(board.height)) {
    throw new Error("SPIKE could not parse this PCB layout.");
  }
  const host = document.createElement("div");
  host.dataset.theme = initialDark ? "dark" : "light";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style"); style.textContent = STYLE;
  const shell = document.createElement("div"); shell.className = "shell";
  const bar = document.createElement("div"); bar.className = "bar";
  const stage = document.createElement("div"); stage.className = "stage";
  const canvasHost = document.createElement("div"); canvasHost.className = "canvas";
  const hint = document.createElement("div"); hint.className = "hint";
  hint.textContent = "Drag to orbit · right-drag to pan · wheel to zoom · click to inspect";
  const inspector = document.createElement("div"); inspector.className = "inspector"; inspector.hidden = true;
  const menu = document.createElement("div"); menu.className = "menu"; menu.hidden = true;
  const notice = document.createElement("div"); notice.className = "notice";
  notice.textContent = "SPIKE 3D · footprint boxes remain where linked model geometry is unavailable.";
  stage.append(canvasHost, hint, inspector, menu); shell.append(bar, stage, notice); shadow.append(style, shell); container.append(host);

  const title = document.createElement("strong"); title.className = "title"; title.textContent = "SPIKE 3D";
  const detail = document.createElement("span"); detail.className = "detail";
  detail.textContent = `${board.width.toFixed(1)} × ${board.height.toFixed(1)} mm · ${board.components.length} parts · ${board.tracks.length} tracks`;
  const spacer = document.createElement("span"); spacer.className = "spacer";
  function action(label, handler) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.addEventListener("click", handler); bar.append(button); return button;
  }
  function toggle(label, initial, handler) {
    const wrapper = document.createElement("label"), input = document.createElement("input");
    input.type = "checkbox"; input.checked = initial; input.addEventListener("change", () => handler(input.checked));
    wrapper.append(input, document.createTextNode(label)); bar.append(wrapper); return input;
  }
  bar.append(title, detail, spacer);

  const centerX = (board.bounds.minX + board.bounds.maxX) / 2;
  const centerY = (board.bounds.minY + board.bounds.maxY) / 2;
  const world = ([x, y]) => [x - centerX, centerY - y];
  const width = Math.max(1, board.width), height = Math.max(1, board.height), extent = Math.max(width, height);
  const thickness = board.stackup?.filter((layer) => Number.isFinite(layer.thickness))
    .reduce((sum, layer) => sum + layer.thickness, 0) || 1.6;
  const top = thickness / 2, bottom = -top;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(initialDark ? 0x0d1b26 : 0xf3f7f5);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, Math.max(3000, extent * 30));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasHost.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.screenSpacePanning = true;
  controls.minDistance = Math.max(2, extent * .04); controls.maxDistance = extent * 8;
  scene.add(new THREE.HemisphereLight(0xe6f5ff, 0x263d39, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.7); sun.position.set(extent * .6, -extent * .3, extent); scene.add(sun);
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const copperGroups = new Map(), pickables = [];
  const groupFor = (layer) => {
    if (!copperGroups.has(layer)) { const group = new THREE.Group(); group.name = layer; boardGroup.add(group); copperGroups.set(layer, group); }
    return copperGroups.get(layer);
  };
  const shape = boardShape(board, world);
  const substrate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({ color: 0x1b6553, roughness: .58, metalness: .04, side: THREE.DoubleSide }));
  substrate.position.z = bottom;
  substrate.userData.record = { type: "Board", name: "Substrate", layer: "Edge.Cuts", id: "board" };
  substrate.userData.identity = viewportSceneIdentity("substrate", "Edge.Cuts", "board");
  boardGroup.add(substrate); pickables.push(substrate);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(substrate.geometry, 20),
    new THREE.LineBasicMaterial({ color: 0x8ce4bc, transparent: true, opacity: .68 }));
  edges.position.z = bottom; boardGroup.add(edges);

  for (const [layer, color] of [["F.Cu", 0xdf6d67], ["B.Cu", 0x6899ed]]) {
    const z = layer === "F.Cu" ? top + .025 : bottom - .025;
    const tracks = board.tracks.filter((item) => item.layer === layer);
    const trackMesh = makeInstanced(groupFor(layer), new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color, metalness: .65, roughness: .32, side: THREE.DoubleSide }), tracks,
      (object, track) => {
        const a = world(track.start), b = world(track.end);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const capsule = trackCapsuleDimensions(length, track.width);
        object.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
        object.rotation.set(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]));
        object.scale.set(Math.max(.04, capsule.shapeLength), Math.max(.04, capsule.width), 1);
      }, viewportSceneIdentity("copper-track", layer, "tracks"));
    if (trackMesh) pickables.push(trackMesh);
    const pads = board.pads.filter((item) => item.layer === layer || item.layers?.includes(layer));
    const padMesh = makeInstanced(groupFor(layer), new THREE.BoxGeometry(1, 1, .04),
      new THREE.MeshStandardMaterial({ color: layerThreeColor(layer), metalness: .72, roughness: .28 }), pads,
      (object, pad) => {
        const [x, y] = world(pad.at);
        object.position.set(x, y, z); object.rotation.set(0, 0, -pad.rotation * Math.PI / 180);
        object.scale.set(Math.max(.15, pad.width), Math.max(.15, pad.height), 1);
      }, viewportSceneIdentity("copper-pad", layer, "pads"));
    if (padMesh) pickables.push(padMesh);
    for (const zone of board.zones.filter((item) => item.layer === layer).slice(0, 300)) {
      if (zone.points.length < 3) continue;
      const zoneShape = new THREE.Shape();
      pathFor(zone.points, world).getPoints().forEach((point, index) => {
        if (index === 0) zoneShape.moveTo(point.x, point.y); else zoneShape.lineTo(point.x, point.y);
      });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(zoneShape),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.z = z - (layer === "F.Cu" ? .005 : -.005); mesh.userData.record = { ...zone, type: "Zone" };
      groupFor(layer).add(mesh); pickables.push(mesh);
    }
  }
  const viaMesh = makeInstanced(boardGroup, new THREE.CylinderGeometry(.5, .5, 1, 16).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd0ac56, metalness: .8, roughness: .3 }), board.vias,
    (object, via) => { const [x, y] = world(via.at); object.position.set(x, y, 0); object.rotation.set(0, 0, 0);
      object.scale.set(Math.max(.2, via.size), Math.max(.2, via.size), thickness + .08); },
    viewportSceneIdentity("via-barrel", "through", "vias"));
  if (viaMesh) pickables.push(viaMesh);
  const parts = new THREE.Group(); boardGroup.add(parts);
  const componentMesh = makeInstanced(parts, new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xdee5d9, metalness: .08, roughness: .72 }), board.components,
    (object, part) => { const [x, y] = world(part.at); const below = part.layer?.startsWith("B.");
      object.position.set(x, y, below ? bottom - 1.1 : top + 1.1);
      object.rotation.set(0, 0, -part.rotation * Math.PI / 180);
      object.scale.set(Math.max(.6, part.width), Math.max(.6, part.height), 2.1); },
    viewportSceneIdentity("component", "F.Fab", "proxies"));
  if (componentMesh) pickables.push(componentMesh);
  const componentIndexes = uniqueComponentIndexes(board.components);
  const componentMatrices = board.components.map((_, index) => {
    const matrix = new THREE.Matrix4();
    componentMesh?.getMatrixAt(index, matrix);
    return matrix;
  });
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const modelGroups = new Map(), loadedModelIndexes = new Set();
  let population = board.components.map(() => true);
  function updateComponentVisibility() {
    board.components.forEach((_, index) => componentMesh?.setMatrixAt(index,
      population[index] && !loadedModelIndexes.has(index) ? componentMatrices[index] : hiddenMatrix));
    if (componentMesh) { componentMesh.instanceMatrix.needsUpdate = true; componentMesh.computeBoundingSphere(); }
    for (const [index, group] of modelGroups) group.visible = population[index];
  }
  const modelDiagnostics = [];
  function showModelDiagnostics() {
    const resolved = loadedModelIndexes.size;
    const problems = modelDiagnostics.length;
    notice.textContent = `Real model geometry: ${resolved}/${board.components.length} footprints · ${board.components.length-resolved} without linked geometry (procedural proxies)`
      + (problems ? ` · ${problems} diagnostic samples: ${modelDiagnostics.slice(0, 3).join(" | ")}${problems>3?` | +${problems-3} more`:""}` : "");
    notice.title = modelDiagnostics.join("\n");
  }
  function glbIsSelfContained(bytes) {
    if (bytes.byteLength < 20) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) return false;
    const length = view.getUint32(12, true);
    if (length > bytes.byteLength - 20) return false;
    let descriptor;
    try { descriptor = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))); }
    catch { return false; }
    return [...(descriptor.buffers || []), ...(descriptor.images || [])]
      .every(item => !item.uri || /^data:/i.test(item.uri));
  }
  async function sceneFromAsset(entry, asset) {
    const base64 = asset?.base64;
    if (typeof base64 !== "string" || base64.length > 11_200_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error("invalid or oversized model asset response");
    }
    const binary = atob(base64), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("model asset exceeds 8 MiB");
    if (entry.format === "glb") {
      if (!glbIsSelfContained(bytes)) throw new Error("GLB has an external dependency or invalid header");
      return (await new GLTFLoader().parseAsync(bytes.buffer, "")).scene;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/\b(?:Inline|ImageTexture|MovieTexture|AudioClip)\b|\burl\s*(?:\[|\")/i.test(text)) {
      throw new Error("VRML has an external resource reference");
    }
    return new VRMLLoader().parse(text);
  }
  async function loadRepositoryModels() {
    if (!options.boardPath || typeof options.loadAsset !== "function") return;
    let inventory;
    try { inventory = globalThis.KiCadRepoModels.collect(source, options.boardPath); }
    catch (error) { modelDiagnostics.push(`Cannot read model references: ${error.message}`); showModelDiagnostics(); return; }
    modelDiagnostics.push(...inventory.diagnostics);
    showModelDiagnostics();
    const cache = new Map();
    const componentIndexes=new Map(board.components.map((component,index)=>[component.id,index]));
    let totalBytes = 0, cursor = 0;
    async function one(entry) {
      const index = componentIndexes.get(entry.footprintId);
      if (index === undefined) { modelDiagnostics.push(`${entry.reference}: footprint identity not found`); return; }
      try {
        if (!cache.has(entry.path)) cache.set(entry.path, (async () => {
          const asset = await options.loadAsset(entry.path);
          const bytes = Math.floor((asset?.base64?.length || 0) * 3 / 4);
          totalBytes += bytes;
          if (totalBytes > 24 * 1024 * 1024) throw new Error("3D model assets exceed 24 MiB in this viewer");
          return sceneFromAsset(entry, asset);
        })());
        const template = await cache.get(entry.path);
        if (!active) return;
        const clone = template.clone(true);
        let meshCount = 0;
        clone.traverse(object => {
          if (object.isMesh && object.geometry?.attributes?.position?.count) {
            meshCount++;
            object.userData.record = { ...board.components[index], type: "Component", modelPath: entry.path };
            pickables.push(object);
          }
        });
        if (!meshCount) throw new Error("asset has no drawable mesh");
        const pose = globalThis.KiCadRepoModels.modelPose(entry, centerX, centerY, thickness);
        const group = new THREE.Group();
        group.position.set(...pose.position);
        group.rotation.z = pose.footprintAngle;
        const local = new THREE.Group();
        // KiCad's VRML exporter composes X/Y/Z model rotations before footprint rotation.
        local.rotation.set(...pose.modelRotation, "ZYX");
        local.scale.set(...pose.scale);
        local.add(clone); group.add(local);
        if (!modelGroups.has(index)) {
          const footprintModels = new THREE.Group();
          modelGroups.set(index, footprintModels); parts.add(footprintModels);
        }
        modelGroups.get(index).add(group);
        loadedModelIndexes.add(index);
        if (entry.format === "glb") modelDiagnostics.push(`${entry.reference}: GLB geometry is interpreted in millimetres.`);
        updateComponentVisibility();
      } catch (error) {
        modelDiagnostics.push(`${entry.reference}: ${entry.path}: ${error?.message || String(error)}`);
      }
      showModelDiagnostics();
    }
    await Promise.all(Array.from({ length: Math.min(3, inventory.models.length) }, async () => {
      while (cursor < inventory.models.length && active) await one(inventory.models[cursor++]);
    }));
    if(active)showModelDiagnostics();
  }

  function fit(topView = false) {
    const distance = extent * (topView ? .85 : .95) + 5;
    camera.position.set(topView ? 0 : extent * .45, topView ? 0 : -extent * .38, distance);
    camera.up.set(0, 1, 0); controls.target.set(0, 0, 0); controls.update();
  }
  action("Fit", () => fit()); action("Top", () => fit(true));
  toggle("Front copper", true, (visible) => { groupFor("F.Cu").visible = visible; });
  toggle("Back copper", true, (visible) => { groupFor("B.Cu").visible = visible; });
  toggle("Parts", true, (visible) => { parts.visible = visible; });
  fit();

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let selected = null, down = null;
  const highlight = new THREE.Mesh(new THREE.BoxGeometry(1.04, 1.04, 1.04),
    new THREE.MeshBasicMaterial({ color: initialDark ? 0xffdf7d : 0x9b5500,
      wireframe: true, depthTest: false, depthWrite: false }));
  highlight.matrixAutoUpdate = false;
  highlight.renderOrder = 100;
  highlight.visible = false;
  scene.add(highlight);
  const instanceMatrix = new THREE.Matrix4(), bounds = new THREE.Box3();
  const highlightCenter = new THREE.Vector3(), highlightSize = new THREE.Vector3();
  function showHighlight(object, instanceId) {
    object.updateWorldMatrix(true, false);
    if (Number.isInteger(instanceId)) {
      object.getMatrixAt(instanceId, instanceMatrix);
      highlight.matrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
    } else {
      bounds.setFromObject(object);
      if (bounds.isEmpty()) { highlight.visible = false; return; }
      bounds.getCenter(highlightCenter); bounds.getSize(highlightSize);
      highlight.matrix.compose(highlightCenter, new THREE.Quaternion(), highlightSize);
    }
    highlight.matrixWorldNeedsUpdate = true;
    highlight.visible = true;
  }
  function clearSelection() {
    selected = null; inspector.hidden = true; menu.hidden = true; highlight.visible = false;
    options.onSelect?.(null);
  }
  function select(record, point, object, instanceId) {
    selected = { record, point: point.clone() };
    showHighlight(object, instanceId);
    options.onSelect?.(record);
    inspector.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = record.ref || record.name || record.type || "Board object";
    const list = document.createElement("dl");
    for (const [label, value] of Object.entries({ Type: record.type || (record.ref ? "Component" : "Copper"),
      Reference: record.ref, Value: record.value, Layer: record.layer || record.layers?.join(", "), Net: record.net,
      Model: record.modelPath || record.modelPaths?.join(", ") })) {
      if (value == null || value === "") continue;
      const term = document.createElement("dt"), desc = document.createElement("dd");
      term.textContent = label; desc.textContent = String(value); list.append(term, desc);
    }
    inspector.append(heading, list); inspector.hidden = false;
  }
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const visible = item => { for (let node = item; node; node = node.parent) if (!node.visible) return false; return true; };
    const hit = raycaster.intersectObjects(pickables.filter(visible), false)[0];
    if (!hit) { clearSelection(); return; }
    const record = hit.object.userData.records?.[hit.instanceId] || hit.object.userData.record;
    if (!record) return;
    select(record, hit.point, hit.object, hit.instanceId);
  }
  renderer.domElement.addEventListener("pointerdown", (event) => { down = [event.clientX, event.clientY]; menu.hidden = true; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (down && Math.hypot(event.clientX - down[0], event.clientY - down[1]) < 4) pick(event);
    down = null;
  });
  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault(); pick(event); if (!selected) return;
    menu.replaceChildren();
    const actions = [["Focus object", () => { controls.target.copy(selected.point); controls.update(); }],
      ["Copy reference", () => navigator.clipboard.writeText(selected.record.ref || selected.record.name || "")]];
    if (typeof options.onComment === "function") actions.push(["Comment on object", () => options.onComment(selected.record)]);
    for (const [label, handler] of actions) {
      const button = document.createElement("button"); button.textContent = label; button.type = "button";
      button.addEventListener("click", () => { handler(); menu.hidden = true; }); menu.append(button);
    }
    const rect = stage.getBoundingClientRect();
    menu.style.left = `${Math.min(event.clientX - rect.left, rect.width - 150)}px`;
    menu.style.top = `${Math.min(event.clientY - rect.top, rect.height - 80)}px`;
    menu.hidden = false;
  });
  const resize = () => { const width = Math.max(1, canvasHost.clientWidth), height = Math.max(1, canvasHost.clientHeight);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(canvasHost); resize();
  let active = true, frame = 0;
  const layoutFrame = requestAnimationFrame(() => { if (active) resize(); });
  const animate = () => { if (!active) return; frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
  animate();
  void loadRepositoryModels();
  return { host, board,
    fit(topView=false){if(active)fit(topView);},
    zoom(factor){if(!active||!Number.isFinite(factor)||factor<=0)return;const offset=camera.position.clone().sub(controls.target);const distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()/factor));if(offset.length()>0)camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();},
    setTheme(dark) {
      if (!active) return;
      host.dataset.theme = dark ? "dark" : "light";
      scene.background.setHex(dark ? 0x0d1b26 : 0xf3f7f5);
      highlight.material.color.setHex(dark ? 0xffdf7d : 0x9b5500);
      resize();
      renderer.render(scene, camera);
    },
    selectReference(reference) {
      const index = componentIndexes.get(reference);
      if (index == null || !componentMesh || !componentMatrices[index] || !active || !population[index]) return false;
      const model = modelGroups.get(index);
      if (model?.children.length) {
        const record = board.components[index];
        const [x, y] = world(record.at);
        select(record, new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom : top), model);
        return true;
      }
      const current = new THREE.Matrix4(); componentMesh.getMatrixAt(index, current);
      if (current.determinant() === 0) return false;
      const record = board.components[index];
      const [x, y] = world(record.at);
      const point = new THREE.Vector3(x, y, record.layer?.startsWith("B.") ? bottom - 1.1 : top + 1.1);
      componentMesh.localToWorld(point);
      select(record, point, componentMesh, index);
      return true;
    },
    setPopulation(entries) {
      if (!componentMesh || !active) return;
      population = populationMask(board.components, entries);
      updateComponentVisibility();
      if (selected?.record?.ref) {
        const index = componentIndexes.get(selected.record.ref);
        if (index != null && !population[index]) clearSelection();
      }
    },
    dispose() { active = false; cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); observer.disconnect(); controls.dispose();
    const resources = new Set(); scene.traverse((object) => { if (object.geometry) resources.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach((item) => resources.add(item)); }); resources.forEach((item) => item.dispose()); renderer.dispose(); host.remove(); } };
}
