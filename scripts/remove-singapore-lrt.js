import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fpath = path.resolve(__dirname, '..', 'public', 'sgmrt.geojson');
const bak = fpath + '.bak';

console.log('Reading', fpath);
const raw = fs.readFileSync(fpath, 'utf8');
fs.writeFileSync(bak, raw);
console.log('Backup written to', bak);

const data = JSON.parse(raw);
const features = data.features || [];

const lrtPrefixes = ['BP', 'PE', 'SE', 'SW'];
const isLrtCode = c => lrtPrefixes.some(p => c.trim().startsWith(p));

const newFeatures = features.reduce((acc, feat) => {
  if (!feat || !feat.properties) return acc;
  const network = feat.properties.network || '';

  if (network === 'singapore-lrt') {
    // remove feature entirely
    return acc;
  }

  if (network.includes('singapore-lrt')) {
    // shared station/line: remove LRT part but keep the station
    const parts = network.split('.').filter(p => p !== 'singapore-lrt');
    feat.properties.network = parts.join('.');

    // update network_count if present
    if (typeof feat.properties.network_count === 'number') {
      feat.properties.network_count = Math.max(0, feat.properties.network_count - 1);
      if (feat.properties.network_count === 0) delete feat.properties.network_count;
    }

    // update station_codes to remove LRT station codes
    if (feat.properties.station_codes) {
      const codes = feat.properties.station_codes.split('-').filter(Boolean);
      const remaining = codes.filter(c => !isLrtCode(c));
      feat.properties.station_codes = remaining.join('-');
      if (!feat.properties.station_codes) delete feat.properties.station_codes;
    }

    // update station_colors to remove gray or LRT color hints (we assume 'gray')
    if (feat.properties.station_colors) {
      const colors = feat.properties.station_colors.split('-').filter(Boolean);
      const rem = colors.filter(col => col !== 'gray');
      feat.properties.station_colors = rem.join('-');
      if (!feat.properties.station_colors) delete feat.properties.station_colors;
    }

    // Also adjust stop_type? no

    // If this is a LineString feature, probably it's a line; if it contains the network 'singapore-lrt', we may fully remove the line because lines are network-specific
    if (feat.geometry && feat.geometry.type === 'LineString') {
      // Skip adding this line - remove it
      return acc;
    }

    // else keep the modified feature
    acc.push(feat);
    return acc;
  }

  // Also remove entrance / other non-station features that reference LRT-only codes
  if (feat.properties.station_codes) {
    const codes = feat.properties.station_codes.split('-').filter(Boolean);
    // if all codes are LRT codes, remove this feature (usually entrances dedicated to LRT stations)
    const allLrt = codes.length > 0 && codes.every(isLrtCode);
    if (allLrt) return acc;
  }

  // otherwise, keep feature unchanged
  acc.push(feat);
  return acc;
}, []);

const out = Object.assign({}, data, { features: newFeatures });
const str = JSON.stringify(out, null, '\t');
fs.writeFileSync(fpath, str, 'utf8');
console.log('Wrote', fpath, 'with', newFeatures.length, 'features (was', features.length, ')');

// Quick validation
try {
  JSON.parse(str);
  console.log('JSON valid');
} catch (err) {
  console.error('JSON parse error:', err);
}
