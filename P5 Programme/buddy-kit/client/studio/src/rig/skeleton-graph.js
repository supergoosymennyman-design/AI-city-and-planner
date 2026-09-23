// src/rig/skeleton-graph.js
// The skeleton the child builds (task 014, spec §1): a joint is a point, a parent and the shape it
// was tapped inside; a link (a "bone" for the bending maths) runs from a parent joint to a child
// joint. Pure data — no three.js — so it runs in Node and serialises straight into the document
// snapshot.
//
// A joint's numbers are in ITS SHAPE'S LOCAL FRAME (owner ruling 2, 20 September): when the shape
// moves, turns or scales, the joint rides with it and nothing here changes. Anything that needs
// positions in one frame asks a resolver (see toBones); the graph never learns what a shape is.
//
// Removing a joint removes its whole subtree: a child who presses Undo expects the last thing to
// vanish, and a joint whose parent disappeared has nowhere sensible to go (spec §1).

const ID_PATTERN = /^j\d+$/;

function copyPosition(position) {
  if (!Array.isArray(position) && !ArrayBuffer.isView(position)) throw new Error('joint position must be three finite numbers');
  const p = [Number(position[0]), Number(position[1]), Number(position[2])];
  if (position.length !== 3 || !p.every(Number.isFinite)) throw new Error('joint position must be three finite numbers');
  return p;
}

/** The owning shape is its `userData.id`: an integer the studio hands out, stable across a snapshot. */
function checkShape(shape) {
  if (!Number.isInteger(shape)) throw new Error('joint needs a shape');
  return shape;
}

export class SkeletonGraph {
  constructor() {
    /** @type {Array<{id:string,x:number,y:number,z:number,parent:string|null,shape:number}>} in creation order; x,y,z in the shape's local frame */
    this.joints = [];
    this.byId = new Map();
    /** @type {Map<string, number[]>} joint id → [x, y, z, w] quaternion; absent means unrotated */
    this.pose = new Map();
    this.nextId = 1;
  }

  get size() { return this.joints.length; }
  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id) || null; }

  /** Add a joint at `position` in `shape`'s local frame. `parent` null starts a new chain. Returns the new id. */
  add(position, parent = null, shape) {
    const [x, y, z] = copyPosition(position);
    checkShape(shape);
    if (parent !== null && !this.byId.has(parent)) throw new Error(`unknown parent joint ${parent}`);
    const id = `j${this.nextId++}`;
    const joint = { id, x, y, z, parent, shape };
    this.joints.push(joint);
    this.byId.set(id, joint);
    return id;
  }

  move(id, position) {
    const joint = this.byId.get(id);
    if (!joint) throw new Error(`unknown joint ${id}`);
    [joint.x, joint.y, joint.z] = copyPosition(position);
  }

  children(id) {
    return this.joints.filter((j) => j.parent === id).map((j) => j.id);
  }

  /** The joint and everything below it, depth first, the joint itself first. */
  subtree(id) {
    if (!this.byId.has(id)) throw new Error(`unknown joint ${id}`);
    const out = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      out.push(current);
      const kids = this.children(current);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return out;
  }

  /** Remove a joint and its subtree. Returns the removed ids, the joint itself first. */
  remove(id) {
    const gone = this.subtree(id);
    const goneSet = new Set(gone);
    this.joints = this.joints.filter((j) => !goneSet.has(j.id));
    for (const g of gone) {
      this.byId.delete(g);
      this.pose.delete(g);
    }
    return gone;
  }

  roots() {
    return this.joints.filter((j) => j.parent === null).map((j) => j.id);
  }

  /** Store a rotation for a joint; null forgets it. Stored as a copy. */
  setPose(id, quaternion) {
    if (!this.byId.has(id)) throw new Error(`unknown joint ${id}`);
    if (quaternion == null) { this.pose.delete(id); return; }
    const q = [Number(quaternion[0]), Number(quaternion[1]), Number(quaternion[2]), Number(quaternion[3])];
    if (!q.every(Number.isFinite)) throw new Error('pose must be four finite numbers');
    this.pose.set(id, q);
  }

  clearPose() { this.pose.clear(); }

  /** A string that changes when joints, parents, positions or shapes change — and not when the pose does. */
  structureKey() {
    return this.joints.map((j) => `${j.id}:${j.parent || ''}:${j.x.toFixed(6)},${j.y.toFixed(6)},${j.z.toFixed(6)}:${j.shape}`).join('|');
  }

  validate() {
    const problems = [];
    const seen = new Set();
    for (const j of this.joints) {
      if (!ID_PATTERN.test(j.id)) problems.push(`bad id ${j.id}`);
      if (seen.has(j.id)) problems.push(`duplicate id ${j.id}`);
      seen.add(j.id);
      if (j.parent !== null && !this.byId.has(j.parent)) problems.push(`unknown parent ${j.parent} on ${j.id}`);
      if (![j.x, j.y, j.z].every(Number.isFinite)) problems.push(`non-finite position on ${j.id}`);
      if (!Number.isInteger(j.shape)) problems.push(`joint ${j.id} has no shape`);
      // walk up; a cycle never reaches null
      let hops = 0;
      let p = j.parent;
      while (p !== null && hops <= this.joints.length) { const pj = this.byId.get(p); p = pj ? pj.parent : null; hops++; }
      if (hops > this.joints.length) problems.push(`cycle through ${j.id}`);
    }
    for (const id of this.pose.keys()) if (!this.byId.has(id)) problems.push(`pose on unknown joint ${id}`);
    return { ok: problems.length === 0, problems };
  }

  toJSON() {
    const pose = {};
    for (const [id, q] of this.pose) pose[id] = q.slice();
    return { joints: this.joints.map((j) => ({ ...j })), pose, nextId: this.nextId,
      ...(this.motion?.key === this.structureKey() ? { motion: JSON.parse(JSON.stringify(this.motion)) } : {}),
      ...(this.targetShapes ? { targetShapes: this.targetShapes.slice() } : {}) };
  }

  /** Store reproducible animation settings; structural edits invalidate their joint mapping. */
  setMotion(settings) {
    for (const [id, knee] of Object.entries(settings?.knees || {})) {
      if (!this.has(id) || !knee || !this.subtree(id).includes(knee.foot) || knee.foot === id || ![1, -1].includes(knee.bend)
        || !Number.isFinite(knee.minFlex) || !Number.isFinite(knee.maxFlex) || knee.minFlex < 3 || knee.maxFlex > 150 || knee.minFlex >= knee.maxFlex) throw new Error(`Invalid hip/knee/foot mapping for ${id} (foot: ${knee?.foot || 'unassigned'}). Open Body roles and choose a knee with a foot below it; check its bend direction and limits.`);
    }
    if (!settings || !Array.isArray(settings.legs) || settings.legs.some((id) => !this.get(id)?.parent)
      || !settings.roles || Object.entries(settings.roles).some(([id, role]) => !this.get(id)?.parent || !['head', 'arm', 'tail'].includes(role))
      || !['auto', 'step', 'waddle'].includes(settings.gait) || !['+z', '-z', '+x', '-x'].includes(settings.forward)
      || !Number.isFinite(settings.softness) || settings.softness < 0 || settings.softness > 1
      || !Number.isFinite(settings.stride) || settings.stride < 1 || settings.stride > 60
      || !Number.isFinite(settings.duration) || settings.duration < .4 || settings.duration > 4) throw new Error('Invalid saved animation settings.');
    this.motion = { key: this.structureKey(), settings: JSON.parse(JSON.stringify(settings)) };
  }

  /** Rebuild from toJSON() output. Throws on a graph that is not a forest. */
  static fromJSON(json) {
    const g = new SkeletonGraph();
    if (json?.targetShapes !== undefined) {
      if (!Array.isArray(json.targetShapes) || !json.targetShapes.every(Number.isInteger)) throw new Error('invalid rig target shapes');
      g.targetShapes = [...new Set(json.targetShapes)];
    }
    const joints = json && Array.isArray(json.joints) ? json.joints : [];
    let maxId = 0;
    for (const j of joints) {
      if (typeof j.id !== 'string' || !ID_PATTERN.test(j.id)) throw new Error(`bad joint id ${j && j.id}`);
      if (g.byId.has(j.id)) throw new Error(`duplicate joint id ${j.id}`);
      if (!Number.isInteger(j.shape)) throw new Error(`joint ${j.id} has no shape`);
      const [x, y, z] = copyPosition([j.x, j.y, j.z]);
      const joint = { id: j.id, x, y, z, parent: j.parent == null ? null : String(j.parent), shape: j.shape };
      g.joints.push(joint);
      g.byId.set(j.id, joint);
      maxId = Math.max(maxId, Number(j.id.slice(1)));
    }
    const report = g.validate();
    if (!report.ok) throw new Error(`skeleton is not valid: ${report.problems.join('; ')}`);
    const pose = json && json.pose && typeof json.pose === 'object' ? json.pose : {};
    for (const [id, q] of Object.entries(pose)) if (g.byId.has(id)) g.setPose(id, q);
    g.nextId = Math.max(maxId + 1, Number.isInteger(json && json.nextId) ? json.nextId : 1);
    if (json?.motion?.key === g.structureKey()) {
      try { g.setMotion(json.motion.settings); } catch { /* Invalid optional animation data never prevents model recovery. */ }
    }
    return g;
  }
}

/**
 * The links between joints, in the form computeHeatWeights consumes: one bone per joint that has
 * a parent, head at the parent joint, tail at the joint. `name` is the child joint's id, `from`
 * the parent's; `parent` is the name of the link that ends at the head joint, or null when the
 * head is a chain root.
 *
 * `at(joint) → [x, y, z]` says which frame the heads and tails are in. The default reads the
 * stored numbers (each joint's own shape frame — only right when every joint shares one unmoved
 * shape, as the graph tests do); the rig passes a resolver that answers in document space, the
 * frame the solver, `partFromMesh` and `tapPoint` work in.
 * @param {SkeletonGraph} graph
 * @param {(joint: object) => number[]} [at]
 * @returns {Array<{name:string, from:string, head:number[], tail:number[], parent:string|null}>}
 */
export function toBones(graph, at = (j) => [j.x, j.y, j.z]) {
  const bones = [];
  for (const j of graph.joints) {
    if (j.parent === null) continue;
    const p = graph.get(j.parent);
    const [hx, hy, hz] = at(p);
    const [tx, ty, tz] = at(j);
    bones.push({ name: j.id, from: p.id, head: [hx, hy, hz], tail: [tx, ty, tz], parent: p.parent === null ? null : p.id });
  }
  return bones;
}
