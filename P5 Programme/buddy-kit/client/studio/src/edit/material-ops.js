/**
 * material-ops.js — the ONE place that knows a shape's material may be an array.
 *
 * Every shape a child builds by hand has exactly one MeshStandardMaterial, so the studio grew up
 * writing `mesh.material.clone()` and `mesh.material.color.set(...)`. A model generated with a
 * texture can arrive with one material PER PAINTED REGION, and each of those bare accesses then
 * throws (`clone is not a function`) or silently writes to the Array object instead of a material.
 * Route every material access through here rather than sprinkling `Array.isArray` at each call
 * site — a rule that lives in one function cannot be half-remembered at the next one.
 *
 * It also serialises a shape's LOOK for snapshots (undo/redo and the IndexedDB document). The
 * snapshot format is plain JSON, so a texture travels as a data URL, encoded once and cached on
 * the texture itself.
 */
import * as THREE from 'three';

/**
 * Texture slots carried through a snapshot. Base colour ONLY: it is the thing the child sees, and
 * every extra slot writes another full-size image into every undo step and every saved document.
 * Widening this list is a deliberate size trade, not a default.
 */
export const SNAPSHOT_TEXTURES = ['map'];

/** Always an array, never holes: `mesh.material` may be one material, an array, or missing. */
export function materialList(material) {
  return (Array.isArray(material) ? material : [material]).filter(Boolean);
}

/** Clone keeping the shape (one → one, array → array), so the copy owns its own materials. */
export function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map((m) => (m && m.clone ? m.clone() : m));
  return material && material.clone ? material.clone() : material;
}

/** Free every material a mesh holds — an array member leaks otherwise. */
export function disposeMaterial(material) {
  for (const m of materialList(material)) if (m.dispose) m.dispose();
}

/** The colour the properties panel and the tree icon show: the first material that has one. */
export function primaryColorHex(material) {
  for (const m of materialList(material)) if (m.color && m.color.getHex) return m.color.getHex();
  return null;
}

/**
 * Tint every material of a shape. On a textured model the colour multiplies the map, so the
 * control stays honest: the child moves it and something visibly changes.
 */
export function setMaterialColor(material, value) {
  for (const m of materialList(material)) if (m.color) m.color.set(value);
}

/** The View menu's wireframe toggle, reaching every material of a multi-material model. */
export function setWireframe(material, on) {
  for (const m of materialList(material)) if ('wireframe' in m) m.wireframe = !!on;
}

/** Encode a texture's image to a data URL once, caching it on the texture. Null outside a browser. */
function encodeTextureToDataUrl(texture) {
  const img = texture && texture.image;
  const width = img && (img.width || img.videoWidth);
  const height = img && (img.height || img.videoHeight);
  if (!width || !height || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    // WebP keeps a 2048-square albedo map in the hundreds of KB where PNG runs to several MB,
    // and this repo already ships webp everywhere. Browsers that refuse it fall back to PNG.
    const webp = canvas.toDataURL('image/webp', 0.92);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } catch (err) {
    // A cross-origin or otherwise tainted canvas throws on read. Losing the texture in a snapshot
    // is bad; throwing inside takeSnapshot would lose the whole document.
    console.warn('[material-ops] could not encode a texture for the snapshot:', err && err.message);
    return null;
  }
}

/** The data URL for a texture, from cache, from the encoder, or null. */
function textureDataUrl(texture, encode) {
  if (!texture) return null;
  if (typeof texture.userData.dataUrl === 'string') return texture.userData.dataUrl;
  const url = encode(texture);
  if (url) texture.userData.dataUrl = url;
  return url || null;
}

/** Sampler settings a re-decoded image does NOT inherit on its own. */
const TEXTURE_SETTINGS = ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'repeat', 'offset'];

function describeMaterial(m, encode) {
  // What this material was BUILT from, when it came out of a previous snapshot (see
  // materialFromAppearance). It is the only record left when the image never decoded.
  const stash = m.userData.appearanceSource || null;
  const out = {
    color: m.color && m.color.getHex ? m.color.getHex() : 0xffffff,
    side: m.side,
    vertexColors: !!m.vertexColors,
    transparent: !!m.transparent,
    opacity: typeof m.opacity === 'number' ? m.opacity : 1,
  };
  if (typeof m.roughness === 'number') out.roughness = m.roughness;
  if (typeof m.metalness === 'number') out.metalness = m.metalness;
  for (const slot of SNAPSHOT_TEXTURES) {
    const tex = m[slot];
    const url = textureDataUrl(tex, encode);
    if (url) {
      out[slot] = url;
      // A re-decoded image defaults to flipY:true / no colour space. glTF maps are the opposite,
      // so an unrecorded orientation comes back upside down and an unrecorded space washes out.
      out.flipY = tex.flipY;
      out.colorSpace = tex.colorSpace;
      out.wrapS = tex.wrapS;
      out.wrapT = tex.wrapT;
      out.repeat = tex.repeat.toArray();
      out.offset = tex.offset.toArray();
    } else if (stash && typeof stash[slot] === 'string') {
      // The image is not attached — it never decoded, or is still decoding. Carry the bytes and
      // their settings forward regardless, or a document loses its texture one undo at a time.
      out[slot] = stash[slot];
      for (const key of TEXTURE_SETTINGS) if (key in stash) out[key] = stash[key];
    }
  }
  return out;
}

/**
 * A plain-JSON record of a mesh's look, or null when there is nothing a flat `color` cannot say.
 *
 * Returning null for ordinary shapes matters: a snapshot is taken on every undo step and every
 * autosave, and the studio is mostly hand-built primitives that need none of this.
 *
 * @param {THREE.Mesh} mesh
 * @param {{encodeTexture?: (t: THREE.Texture) => (string|null)}} [opts] injectable encoder (tests)
 * @returns {{materials: object[], groups: {start:number,count:number,materialIndex:number}[]}|null}
 */
export function describeAppearance(mesh, opts = {}) {
  const encode = opts.encodeTexture || encodeTextureToDataUrl;
  const mats = materialList(mesh && mesh.material);
  if (!mats.length) return null;
  // A restored image may still be decoding (or have failed). Its saved bytes still describe
  // a painted material, even before a live map exists; don't drop them from the next snapshot.
  const painted = mats.some((m) => m.vertexColors || SNAPSHOT_TEXTURES.some((slot) =>
    m[slot] || typeof m.userData.appearanceSource?.[slot] === 'string'));
  if (!painted && mats.length < 2) return null;
  const groups = ((mesh.geometry && mesh.geometry.groups) || [])
    .map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex || 0 }));
  return { materials: mats.map((m) => describeMaterial(m, encode)), groups };
}

/** Decode a snapshot's data URL back into a texture. Resolves null outside a browser. */
function loadTextureFromDataUrl(dataUrl) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.userData.dataUrl = dataUrl; // closes the cache loop: the next snapshot re-encodes nothing
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Rebuild material(s) from a descriptor. The surface settings are applied synchronously so the
 * restored mesh is never briefly white; each texture decodes asynchronously and attaches when it
 * arrives, the same way bakePaint applies a persisted paint a beat later.
 *
 * The data URL is stashed on `material.userData.sourceDataUrl` immediately, so the NEXT snapshot
 * carries the texture forward even if this decode fails or never runs (headless, a blocked image).
 * Without that, a document would quietly lose its texture one undo at a time.
 *
 * @param {object|null} desc from describeAppearance
 * @param {{loadTexture?: (url: string) => Promise<THREE.Texture|null>}} [opts]
 * @returns {{material: THREE.Material|THREE.Material[], ready: Promise<void>}|null}
 */
export function materialFromAppearance(desc, opts = {}) {
  if (!desc || !Array.isArray(desc.materials) || !desc.materials.length) return null;
  const load = opts.loadTexture || loadTextureFromDataUrl;
  const pending = [];
  const built = desc.materials.map((d) => {
    const mat = new THREE.MeshStandardMaterial({
      color: typeof d.color === 'number' ? d.color : 0xffffff,
      roughness: typeof d.roughness === 'number' ? d.roughness : 0.6,
      metalness: typeof d.metalness === 'number' ? d.metalness : 0.1,
      side: typeof d.side === 'number' ? d.side : THREE.DoubleSide,
      vertexColors: !!d.vertexColors,
      transparent: !!d.transparent,
      opacity: typeof d.opacity === 'number' ? d.opacity : 1,
    });
    for (const slot of SNAPSHOT_TEXTURES) {
      const url = d[slot];
      if (typeof url !== 'string') continue;
      mat.userData.appearanceSource = d;
      if (slot === 'map') mat.userData.sourceDataUrl = url;
      pending.push(Promise.resolve(load(url)).then((tex) => {
        if (!tex) return;
        if (typeof d.flipY === 'boolean') tex.flipY = d.flipY;
        if (d.colorSpace) tex.colorSpace = d.colorSpace;
        if (typeof d.wrapS === 'number') tex.wrapS = d.wrapS;
        if (typeof d.wrapT === 'number') tex.wrapT = d.wrapT;
        if (Array.isArray(d.repeat)) tex.repeat.fromArray(d.repeat);
        if (Array.isArray(d.offset)) tex.offset.fromArray(d.offset);
        tex.needsUpdate = true;
        mat[slot] = tex;
        mat.needsUpdate = true;
      }).catch(() => {}));
    }
    return mat;
  });
  return { material: built.length === 1 ? built[0] : built, ready: Promise.all(pending).then(() => {}) };
}
