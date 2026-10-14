// public/models/maps/map.glb varsa okur, mesh sınırlarından çarpışma kutuları üretir.
// İsteğe bağlı ayar dosyası: public/models/maps/map.json
//   { "fit": 90, "scale": 1, "rotY": 0, "minHeight": 0.5, "ignore": ["grass","tree"], "spawnX": 36, "goals": [[x,z],...] }
// fit: haritanın en uzun kenarını bu metreye ölçekler (scale verilmezse). Varsayılan 90.
import fs from 'fs';
import path from 'path';

const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { // sütun-öncelikli 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const tp = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

function readGlbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB değil');
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    off += 8 + len;
  }
  throw new Error('GLB JSON bölümü yok');
}

export function loadCustomMap(dir) {
  const glb = path.join(dir, 'map.glb');
  if (!fs.existsSync(glb)) return null;
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8')); } catch { /* ayar yok */ }
  const j = readGlbJson(fs.readFileSync(glb));
  const scene = j.scenes?.[j.scene ?? 0];
  if (!scene) throw new Error('GLB içinde sahne yok');

  // 1) her mesh düğümü için dünya AABB'si (ham birimde)
  const raw = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const m = mul(parent, n.matrix || trs(n.translation, n.rotation, n.scale));
    if (n.mesh !== undefined) {
      const mesh = j.meshes[n.mesh];
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const pr of mesh.primitives) {
        const acc = j.accessors[pr.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        for (let k = 0; k < 8; k++) {
          const c = [k & 1 ? acc.max[0] : acc.min[0], k & 2 ? acc.max[1] : acc.min[1], k & 4 ? acc.max[2] : acc.min[2]];
          const w = tp(m, c);
          for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], w[a]); hi[a] = Math.max(hi[a], w[a]); }
        }
      }
      if (lo[0] < 1e8) raw.push({ name: (n.name || mesh.name || '').toLowerCase(), lo, hi });
    }
    for (const c of n.children || []) walk(c, m);
  };
  let root = I();
  const rot = (cfg.rotY || 0) * Math.PI / 180;
  if (rot) { const h = rot / 2; root = trs([0, 0, 0], [0, Math.sin(h), 0, Math.cos(h)]); }
  for (const ni of scene.nodes) walk(ni, root);
  if (!raw.length) throw new Error('GLB içinde mesh yok');

  // 2) ölçek ve merkezleme: zemin y=0, harita x/z merkezde
  const L = [1e9, 1e9, 1e9], H = [-1e9, -1e9, -1e9];
  for (const r of raw) for (let a = 0; a < 3; a++) { L[a] = Math.min(L[a], r.lo[a]); H[a] = Math.max(H[a], r.hi[a]); }
  const sizeX = H[0] - L[0], sizeZ = H[2] - L[2];
  const scale = cfg.scale || (cfg.fit || 90) / Math.max(sizeX, sizeZ);
  const offset = [-(L[0] + H[0]) / 2 * scale, -L[1] * scale + (cfg.yOffset || 0), -(L[2] + H[2]) / 2 * scale];
  const halfX = Math.ceil(sizeX * scale / 2), halfZ = Math.ceil(sizeZ * scale / 2);

  // 3) kutular
  const minH = cfg.minHeight ?? 0.6, ignore = (cfg.ignore || []).map(s => s.toLowerCase());
  const boxes = [];
  for (const r of raw) {
    if (ignore.some(s => r.name.includes(s))) continue;
    const lo = r.lo.map((v, a) => v * scale + offset[a]), hi = r.hi.map((v, a) => v * scale + offset[a]);
    const w = hi[0] - lo[0], d = hi[2] - lo[2], top = hi[1];
    if (top < minH) continue;                      // zemin / çok alçak parçalar
    if (w < 0.25 && d < 0.25) continue;            // ince direkler, tel vb.
    if (hi[1] - lo[1] < 0.3) continue;             // levha gibi yatay yüzeyler
    if (w > halfX * 1.7 && d > halfZ * 1.7) continue; // tüm haritayı kaplayan zemin
    if (lo[1] > 2.8) continue;                      // yüksekte asılı parçalar (çatı, tavan)
    boxes.push({ x: +((lo[0] + hi[0]) / 2).toFixed(2), z: +((lo[2] + hi[2]) / 2).toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2), h: +Math.min(top, 6).toFixed(2), k: 'wall' });
  }
  // dış sınır duvarları
  boxes.push({ x: 0, z: -halfZ - 0.5, w: halfX * 2 + 2, d: 1, h: 6, k: 'outer' }, { x: 0, z: halfZ + 0.5, w: halfX * 2 + 2, d: 1, h: 6, k: 'outer' },
    { x: -halfX - 0.5, z: 0, w: 1, d: halfZ * 2 + 2, h: 6, k: 'outer' }, { x: halfX + 0.5, z: 0, w: 1, d: halfZ * 2 + 2, h: 6, k: 'outer' });

  const spawnX = cfg.spawnX ?? Math.max(5, halfX - 5);
  const goals = cfg.goals || [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [-.25, 0], [.25, 0], [0, -.3], [0, .3]]
    .map(([a, b]) => [Math.round(a * halfX * 1.6), Math.round(b * halfZ * 1.6)]);
  return {
    name: cfg.name || 'Özel Harita', halfX, halfZ, spawnX, goals, boxes,
    custom: { file: 'models/maps/map.glb', scale, offset, rotY: rot },
  };
}
