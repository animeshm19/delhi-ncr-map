// MapLibre 6 runs its tile parsing in a separate worker module that bundlers don't
// emit. Copy it next to the site's static files; MapExplorer points setWorkerUrl at it.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = path.resolve("public/maplibre");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(dist, "maplibre-gl-worker.mjs"), path.join(out, "maplibre-gl-worker.mjs"));
console.log("copied maplibre worker →", path.relative(process.cwd(), out));
