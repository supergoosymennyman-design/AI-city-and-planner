const positions = [
  0,0,0, 0,2,0, 1,0,0,  0,0,0, 1,0,0, 0,0,1,
  0,0,0, 0,0,1, 0,2,0,  1,0,0, 0,2,0, 0,0,1,
];
exports.makeGLB = () => {
  const bin = Buffer.alloc(positions.length * 4);
  positions.forEach((v, i) => bin.writeFloatLE(v, i * 4));
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [2,1,3], scale: [1,2,0.5], children: [1] },
      { mesh: 0, translation: [0.5,2,1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteLength: bin.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0,0,0], max: [1,2,1] }] };
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(json);
  const out = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20);
  const offset = 20 + json.length;
  out.writeUInt32LE(bin.length, offset); out.writeUInt32LE(0x004e4942, offset + 4); bin.copy(out, offset + 8);
  return out;
};
