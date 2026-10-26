// Procedural silver card: geometry from a rounded rectangle, PBR maps generated from the SVG artwork.
// Height map: engraved, blackened lettering, shallow matte engraving for the logo pattern,
// fine grain and horizontal brushing everywhere. Normal and roughness maps are derived from it.
import * as THREE from 'three';

const SVG_W = 343, SVG_H = 213, SVG_R = 24; // card.svg viewBox and corner radius
const PATTERN_W = 40, PATTERN_H = 40;       // pattern.svg tile
const WIDTH = 85.6;                          // mm, ISO ID-1 card width
const HEIGHT = WIDTH * SVG_H / SVG_W;
const RADIUS = SVG_R * WIDTH / SVG_W;
const THICKNESS = 0.8, BEVEL = 0.12;           // mm; defaults, the studio can change both

async function svgImage(url, transform = text => text) {
  const text = transform(await (await fetch(url)).text());
  const image = new Image();
  image.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  await image.decode();
  return image;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function alphaOf(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255;
  return out;
}

// Deterministic noise so the card looks the same on every load.
function random(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Artwork masks are expensive to rasterise, so they are built once; the metal surface is rebuilt from them.
// engraving (необязательно) — шлифованная плашка с гравировкой текста, в единицах card.svg:
// { text, font: px => 'css font', cx, cy, h, minW, pad, r }. Плашка без паттерна и зерна, текст гравируется как надписи.
function plateRect(ctx, px, e) {
  ctx.font = e.font(e.size * px);
  const w = Math.max(e.minW * px, ctx.measureText(e.text).width + e.pad * 2 * px), h = e.h * px;
  return [e.cx * px - w / 2, e.cy * px - h / 2, w, h];
}
function drawEngraving(ctx, px, e) {
  ctx.save();
  ctx.font = e.font(e.size * px);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.text, e.cx * px, (e.cy + e.size * 0.04) * px);
  ctx.restore();
}
function buildMasks(w, h, artwork, pattern, engraving = null) {
  const px = w / SVG_W; // texture pixels per SVG unit
  // Logo pattern mask, tiled over the whole card.
  const [pc, pctx] = canvas(w, h);
  pctx.filter = `blur(${px * 0.12}px)`;
  for (let y = 0; y < SVG_H; y += PATTERN_H)
    for (let x = 0; x < SVG_W; x += PATTERN_W)
      if (pattern) pctx.drawImage(pattern, x * px, y * px, PATTERN_W * px, PATTERN_H * px);
  const patternMask = alphaOf(pctx, w, h);

  // Lettering mask from card.svg (+ engraved text on the plate).
  const [tc, tctx] = canvas(w, h);
  if (artwork) tctx.drawImage(artwork, 0, 0, w, h);
  if (engraving) drawEngraving(tctx, px, engraving);
  const textMask = alphaOf(tctx, w, h);
  // The pattern is cleared under the lettering with a small margin, so letters sit on clean metal.
  const [kc, kctx] = canvas(w, h);
  kctx.filter = `blur(${px * 0.6}px)`;
  kctx.drawImage(tc, 0, 0);
  const knockout = alphaOf(kctx, w, h).map(a => Math.min(1, a * 3));
  for (let i = 0; i < patternMask.length; i++) patternMask[i] *= 1 - knockout[i];
  // Slightly softened copy for the engraving depth, so the letter walls read as a thin bevel.
  const [ec, ectx] = canvas(w, h);
  ectx.filter = `blur(${px * 0.12}px)`;
  ectx.drawImage(tc, 0, 0);
  const engrave = alphaOf(ectx, w, h);
  // Plate: polished, no pattern; slightly softened edge so the raised rim catches a thin highlight.
  let plate = null;
  if (engraving) {
    const [qc, qctx] = canvas(w, h);
    qctx.filter = `blur(${px * 0.25}px)`;
    qctx.fillStyle = '#fff';
    qctx.beginPath();
    qctx.roundRect(...plateRect(qctx, px, engraving), engraving.r * px);
    qctx.fill();
    plate = alphaOf(qctx, w, h);
    for (let i = 0; i < patternMask.length; i++) patternMask[i] *= 1 - plate[i];
  }
  return { w, h, patternMask, textMask, engrave, plate };
}

// Smooth value noise with roughly `cell` pixels between random grid points.
function valueNoise(w, h, cell, rnd) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() - 0.5;
  const out = new Float32Array(w * h), smooth = t => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const fy = y / cell, y0 = fy | 0, sy = smooth(fy - y0), row0 = y0 * gw, row1 = row0 + gw;
    for (let x = 0; x < w; x++) {
      const fx = x / cell, x0 = fx | 0, sx = smooth(fx - x0);
      const top = grid[row0 + x0] + (grid[row0 + x0 + 1] - grid[row0 + x0]) * sx;
      const bottom = grid[row1 + x0] + (grid[row1 + x0 + 1] - grid[row1 + x0]) * sx;
      out[y * w + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

// Height: engraved pattern and lettering, metal grain and brushing along the card's long side.
// grain 0..1 — strength of the grain, grainSize — its scale in mm, brush 0..1 — brushing strength.
// blacken 0..1 — насколько затемнять гравировку надписей в карте цвета (поверх может лежать свой цвет надписей).
// pattern 0..1 — заметность паттерна из плюсов. tint — пастельные цвета по диагонали карты
// (из левого верхнего угла в правый нижний), массив hex-строк; без него карта серая.
function hexStops(list) {
  return list.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255));
}
function buildSurface({ w, h, patternMask, textMask, engrave, plate }, { grain, grainSize, brush: brushing, blacken = 0.93, pattern = 1, tint = null }) {
  const stops = tint && tint.length ? hexStops(tint) : null;
  const rnd = random(12), heightMap = new Float32Array(w * h), brush = new Float32Array(h);
  const cell = Math.max(1.5, grainSize / WIDTH * w);
  const coarse = valueNoise(w, h, cell, rnd), fine = valueNoise(w, h, Math.max(1.2, cell / 2.4), rnd);
  for (let y = 0, v = 0; y < h; y++) brush[y] = v = v * 0.6 + (rnd() - 0.5);
  // Scaled by cell size so the slider controls slope (what the eye sees), not raw height.
  const grainHeight = grain * 0.05 * cell;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // The blackened lettering is smooth: no grain or brushing inside it.
      const q = plate ? plate[i] : 0;           // шлифованная плашка: гладкая и чуть приподнята
      const metal = (1 - engrave[i]) * (1 - q);
      heightMap[i] = -0.15 * pattern * patternMask[i] - 0.6 * engrave[i] + 0.12 * q + metal * (0.12 * brushing * brush[y]
        + grainHeight * (coarse[i] + 0.5 * fine[i]) + 0.02 * grain * (rnd() - 0.5));
    }

  const color = new ImageData(w, h), rough = new ImageData(w, h), normal = new ImageData(w, h);
  const strength = 2.2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      const l = heightMap[x > 0 ? i - 1 : i], r = heightMap[x < w - 1 ? i + 1 : i];
      const u = heightMap[y > 0 ? i - w : i], d = heightMap[y < h - 1 ? i + w : i];
      // Canvas rows go down while texture V goes up, hence the sign of ny.
      const nx = (l - r) * strength, ny = (d - u) * strength, len = Math.hypot(nx, ny, 1);
      normal.data[j] = (nx / len * 0.5 + 0.5) * 255;
      normal.data[j + 1] = (ny / len * 0.5 + 0.5) * 255;
      normal.data[j + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal.data[j + 3] = 255;
      // Niello (blackening) fills the engraved lettering.
      const p = pattern * patternMask[i], black = textMask[i], q = plate ? plate[i] : 0;
      // glTF convention: green = roughness, blue = metalness. Pattern is matte,
      // the blackened oxide is matte and only partly metallic.
      const bare = 0.45 + 0.3 * p + 0.1 * brushing * Math.abs(brush[y]) + grain * (0.2 + 0.3 * coarse[i]);
      // Шлифовка: глаже металла вокруг, но не зеркало, и металличность на плашке ниже — у неё свой светлый тон,
      // поэтому на любом наклоне она не уходит в тёмное отражение и код читается
      const polished = bare * (1 - q) + 0.4 * q;
      rough.data[j + 1] = Math.max(0, Math.min(1, polished * (1 - black) + 0.6 * black)) * 255;
      rough.data[j + 2] = (1 - 0.5 * black) * (1 - 0.45 * q) * 255;
      rough.data[j + 3] = 255;
      const shade = (1 - 0.04 * p) * (1 - 0.03 * q) * (1 - blacken * black) * 255;
      if (stops) {
        // Положение вдоль диагонали 0..1 и плавная интерполяция между соседними цветами
        const t = Math.min(0.9999, (x / w + y / h) / 2) * (stops.length - 1), k = t | 0, f = t - k;
        const a = stops[k], b = stops[k + 1];
        color.data[j] = shade * (a[0] + (b[0] - a[0]) * f);
        color.data[j + 1] = shade * (a[1] + (b[1] - a[1]) * f);
        color.data[j + 2] = shade * (a[2] + (b[2] - a[2]) * f);
      } else color.data[j] = color.data[j + 1] = color.data[j + 2] = shade;
      color.data[j + 3] = 255;
    }
  return { color, rough, normal };
}

function texture(data, srgb, anisotropy) {
  const t = new THREE.CanvasTexture(document.createElement('canvas'));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.userData.mimeType = 'image/jpeg'; // keeps the exported GLB small; the maps have no alpha
  return fill(t, data);
}

function fill(t, data) {
  const [c, ctx] = canvas(data.width, data.height);
  ctx.putImageData(data, 0, 0);
  t.image = c;
  t.needsUpdate = true;
  return t;
}

// bevel — radius of the rounded edge; it can't exceed half the thickness, so it is clamped.
function geometry(thickness = THICKNESS, bevel = BEVEL) {
  bevel = Math.min(bevel, thickness / 2 - 0.01);
  const x = WIDTH / 2 - bevel, y = HEIGHT / 2 - bevel, r = RADIUS - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y); shape.absarc(x - r, -y + r, r, -Math.PI / 2, 0);
  shape.lineTo(x, y - r); shape.absarc(x - r, y - r, r, 0, Math.PI / 2);
  shape.lineTo(-x + r, y); shape.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(-x, -y + r); shape.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 10, curveSegments: 32,
  });
  g.translate(0, 0, -(thickness - bevel * 2) / 2);
  // Map the whole card face to 0..1 so the artwork covers it exactly.
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / WIDTH + 0.5, pos.getY(i) / HEIGHT + 0.5);
  // ExtrudeGeometry puts both lids in group 0 (back first, then front): split them into front/back.
  const [lids, sides] = g.groups, half = lids.count / 2;
  g.clearGroups();
  g.addGroup(lids.start + half, half, 0); // front
  g.addGroup(sides.start, sides.count, 1); // edge and bevel
  g.addGroup(lids.start, half, 2);        // back
  return g.scale(0.001, 0.001, 0.001);    // millimetres to glTF metres
}

// surface: { grain, grainSize, brush } — see buildSurface. The returned group has
// userData.setSurface(surface) to rebuild the metal texture without rebuilding the card.
// The card as it looks on the gift landing (yandex-plus-podarok-snow-video). Values were tuned in the
// studio panel on 26.10; the landing should build the card with LANDING_LOOK and light it with LANDING_LIGHT.
// Pearl metal with a faint iridescence, pastel tint along the diagonal, lettering as a separate
// coloured layer over the face (so its colour changes instantly, without rebuilding textures).
export const LANDING_LOOK = {
  tint: ['#c9cbee', '#f6f2fa', '#efd6ea', '#c6c0dc'], // lilac-blue → white → pinkish → grey-lilac
  blacken: 0,           // lettering is painted by the ink layer instead
  pattern: 0.74,        // visibility of the plus pattern
  metal: '#ffffff', roughness: 0.49, iridescence: 0.04, sheen: 0,
  ink: '#211730',       // lettering colour
  thickness: 0.7, edgeRadius: 0.35, // mm
  grain: 0.54, grainSize: 0.04, brush: 0, // metal grain strength, grain size in mm, no brushed stripes
};

// Scene light for the card (three.js): ACES tone mapping, RoomEnvironment as the environment map,
// a hemisphere light (0xffffff / 0x8c9185) with `ambient`, and two directional lights.
export const LANDING_LIGHT = {
  keyPower: 1.4, keyColor: '#ffd9ee', key: [-3, 5, 4],   // warm pinkish key
  fillPower: 0.9, fillColor: '#c3c2ff', fill: [4, 2, -3], // cool lilac fill
  ambient: 0.2, envPower: 0.71, exposure: 1.15,
};

// surface: { grain, grainSize, brush, pattern, thickness and edgeRadius (mm) } plus LANDING_LOOK. The returned group has
// userData.setSurface(surface) to rebuild the metal texture and userData.setLook({ ink, iridescence })
// and userData.setShape(thickness, edgeRadius) for instant tweaks; both keep the panel's material copies in sync.
export async function createCard(renderer, surface) {
  const look = { ...LANDING_LOOK, ...surface };
  // assets — папка с card.svg и pattern.svg (на лендинге это ./assets/card3d/);
  // assetsVersion — добавляется к адресам как ?v=…, чтобы после замены графики браузер не взял старую из кэша
  const asset = name => (look.assets ?? './assets/') + name + (look.assetsVersion ? `?v=${look.assetsVersion}` : '');
  const [artwork, pattern, lettering] = await Promise.all([
    svgImage(asset('card.svg'), text => text.replace(/<rect[^>]*\/>/, '')),
    svgImage(asset('pattern.svg')),
    svgImage(asset('card.svg'), text => text.replace(/<rect[^>]*\/>/, '')),
  ]);
  const w = Math.min(innerWidth < 800 ? 2048 : 4096, renderer.capabilities.maxTextureSize);
  const h = Math.round(w * SVG_H / SVG_W);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const engraving = look.engraving?.text ? look.engraving : null;
  const frontMasks = buildMasks(w, h, artwork, pattern, engraving);
  const backMasks = buildMasks(1024, Math.round(1024 * SVG_H / SVG_W), null, null); // same metal, no artwork
  const metal = maps => {
    const rough = texture(maps.rough, false, maxAniso);
    return new THREE.MeshPhysicalMaterial({
      color: look.metal, metalness: 1, roughness: look.roughness, anisotropy: 0.35,
      map: texture(maps.color, true, maxAniso), roughnessMap: rough, metalnessMap: rough,
      normalMap: texture(maps.normal, false, maxAniso),
      // Thin-film iridescence: the highlight shifts lilac / pink / blue with the viewing angle
      iridescence: look.iridescence, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 480],
      sheen: look.sheen, sheenColor: 0xe3c4ff, sheenRoughness: 0.45,
    });
  };
  const face = metal(buildSurface(frontMasks, look)), backFace = metal(buildSurface(backMasks, look));
  // No anisotropy on the edge: its straight walls have degenerate UVs, and anisotropy there renders black.
  const edge = new THREE.MeshPhysicalMaterial({ color: look.metal, metalness: 1, roughness: 0.18 });
  const mesh = new THREE.Mesh(geometry(look.thickness, look.edgeRadius), [face, edge, backFace]);
  mesh.name = 'Card';

  // Lettering layer just above the face.
  const letters = document.createElement('canvas');
  letters.width = innerWidth < 800 ? 1536 : 3072;
  letters.height = Math.round(letters.width * SVG_H / SVG_W);
  letters.getContext('2d').drawImage(lettering, 0, 0, letters.width, letters.height);
  if (engraving) drawEngraving(letters.getContext('2d'), letters.width / SVG_W, engraving); // гравировка закрашена как надписи
  const lettersTex = new THREE.CanvasTexture(letters);
  lettersTex.colorSpace = THREE.SRGBColorSpace;
  lettersTex.anisotropy = maxAniso;
  const ink = new THREE.MeshPhysicalMaterial({
    name: 'Ink', color: look.ink, map: lettersTex, transparent: true, depthWrite: false,
    metalness: 0.15, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const inkPlane = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH / 1000, HEIGHT / 1000), ink);
  inkPlane.name = 'Lettering';
  const lift = thickness => thickness / 2000 + 0.00002; // half the thickness in metres, just above the face
  inkPlane.position.z = lift(look.thickness ?? THICKNESS);
  inkPlane.userData.keepMaterial = true; // the studio panel's material presets must not turn ink into metal

  const group = new THREE.Group();
  group.add(mesh, inkPlane);
  // Слой надписей наружу: лендинг дорисовывает на нём персональный промокод (после — texture.needsUpdate = true)
  group.userData.lettering = { canvas: letters, texture: lettersTex };
  const metals = () => [face, edge, backFace, ...[mesh.userData.edited ?? []].flat()];
  // Textures are updated in place, so material copies made by the panel pick up the change too.
  group.userData.setSurface = next => {
    const opts = { ...look, ...next };
    for (const [material, masks] of [[face, frontMasks], [backFace, backMasks]]) {
      const maps = buildSurface(masks, opts);
      fill(material.map, maps.color); fill(material.roughnessMap, maps.rough); fill(material.normalMap, maps.normal);
    }
  };
  group.userData.setShape = (thickness, edgeRadius) => {
    mesh.geometry.dispose();
    mesh.geometry = geometry(thickness, edgeRadius);
    inkPlane.position.z = lift(thickness);
  };
  group.userData.setLook = ({ ink: inkColor, iridescence }) => {
    ink.color.set(inkColor);
    for (const m of metals()) m.iridescence = iridescence;
  };
  return group;
}
