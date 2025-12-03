import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fpath = path.resolve(__dirname, '..', 'public', 'sgmrt.geojson');
const raw = fs.readFileSync(fpath, 'utf8');
const data = JSON.parse(raw);
const counts = {};
for (const feat of (data.features || [])) {
  const n = feat.properties && feat.properties.network ? feat.properties.network : 'unknown';
  counts[n] = (counts[n] || 0) + 1;
}
console.log('Network counts:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k, v));
