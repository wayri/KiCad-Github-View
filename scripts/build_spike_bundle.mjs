/** Bundle the owner-provided SPIKE browser geometry engine for the extension. */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spikeRoot = path.resolve(process.env.SPIKE_SOURCE_ROOT || path.join(project, "..", "..", "SPIKE-Main"));
const appSource = path.join(spikeRoot, "app", "src");
const ownerFiles = ["boardParser.ts", "numericRange.ts", "layerPalette.ts", "trackGeometry.ts", "viewportScenePolicy.ts"];
for (const file of ownerFiles) {
  if (!existsSync(path.join(appSource, file))) throw new Error(`SPIKE source is missing: ${path.join(appSource, file)}`);
}
const depRoot = [path.join(project, "extension", "node_modules"), path.join(project, ".vizdiff", "build-deps", "node_modules")]
  .find((folder) => existsSync(path.join(folder, "esbuild")) && existsSync(path.join(folder, "three")));
if (!depRoot) throw new Error("Install esbuild and three in extension/node_modules before building the SPIKE viewer.");
const require = createRequire(import.meta.url);
const esbuild = require(path.join(depRoot, "esbuild"));
const outfile = path.join(project, "extension", "vendor", "spike-board3d.bundle.js");
await esbuild.build({
  entryPoints: [path.join(project, "extension", "spike", "board3d.js")],
  outfile, bundle: true, platform: "browser", format: "iife", globalName: "SpikeBoard3D",
  target: ["chrome116", "edge116"], minify: true, legalComments: "none",
  nodePaths: [depRoot],
  alias: {
    "@spike/boardParser": path.join(appSource, "boardParser.ts"),
    "@spike/layerPalette": path.join(appSource, "layerPalette.ts"),
    "@spike/trackGeometry": path.join(appSource, "trackGeometry.ts"),
    "@spike/viewportScenePolicy": path.join(appSource, "viewportScenePolicy.ts")
  }
});
const hashes = ownerFiles.map((file) => `${file}: ${createHash("sha256").update(readFileSync(path.join(appSource, file))).digest("hex")}`);
writeFileSync(path.join(project, "extension", "vendor", "SPIKE-ENGINE-NOTICE.md"),
  `# SPIKE browser geometry bundle\n\nBuilt from the owner's SPIKE-Main source tree. The bundled code remains under the SPIKE owner's rights; this file does not assign an open-source license. A separate license is needed before public source release.\n\nSource: SPIKE-Main/app/src\n\n${hashes.join("\n")}\n\nThe bundle also includes Three.js 0.171.0 (MIT); see THREE-LICENSE, and fzstd 0.1.1 (MIT); see fzstd/LICENSE.\n`);
console.log(outfile);
