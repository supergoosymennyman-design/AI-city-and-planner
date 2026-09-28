// Original procedural meshes, dedicated to CC0. Geometry is shared by the scanner
// asset generator and the live conveyor: object identity fixes shape and colour.
import * as THREE from 'three';
export const WASTE = Object.freeze(['metal', 'plastic', 'cardboard'].flatMap((label, c) =>
  Array.from({ length: 8 }, (_, i) => ({ id: `city-${label}-${i}`, objectId: `city-${label}-${i}`,
    label, split: i < 5 ? 'train' : 'test', variant: i,
    color: [[0xa5b3bb,0x91a2aa,0xb4bcc1,0x889ba5,0xadb8bd,0x9cacb4,0xb0bec4,0x94a5ae],
      [0x6bafbb,0x79b7bf,0x589cab,0x8ac0c5,0x64a4b4,0x76b4c3,0x69a9b9,0x83bbc4],
      [0xb78b59,0xc09667,0xa98052,0xc29b70,0xb28c5e,0xba9362,0xad8658,0xc09a68]][c][i] }))));
export function createWaste(row) {
  const group = new THREE.Group(); group.name = row.id;
  const material = new THREE.MeshStandardMaterial({ color: row.color, roughness: .65, metalness: row.label === 'metal' ? .55 : .03 });
  const add = (geo, y, mat = material) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; group.add(mesh); return mesh; };
  const h = 1.1 + row.variant * .045, r = .37 + (row.variant % 3) * .025;
  if (row.label === 'metal') {
    add(new THREE.CylinderGeometry(r,r,h,24),h/2);
    for (const y of [.04,h-.04]) add(new THREE.TorusGeometry(r,.035,6,24),y).rotation.x = Math.PI/2;
    const tab = add(new THREE.TorusGeometry(.1,.025,6,12),h+.01); tab.rotation.x = Math.PI/2;
  } else if (row.label === 'plastic') {
    add(new THREE.CylinderGeometry(r*.8,r,h*.7,16),h*.35);
    add(new THREE.CylinderGeometry(.14,r*.8,h*.2,16),h*.8);
    add(new THREE.CylinderGeometry(.15,.15,h*.14,16),h*.97,
      new THREE.MeshStandardMaterial({color:0xe8e7dd,roughness:.8}));
    for (const y of [.2,.4,.6]) add(new THREE.TorusGeometry(r*.96,.018,6,16),y*h).rotation.x = Math.PI/2;
  } else {
    add(new THREE.BoxGeometry(.85+row.variant*.02,h*.7,.75),h*.35);
    add(new THREE.BoxGeometry(.14,h*.7+.015,.77),h*.35,
      new THREE.MeshStandardMaterial({color:0xd7b78b,roughness:1}));
  }
  return group;
}
export function scannerScene(row) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe7e7df);
  scene.add(new THREE.HemisphereLight(0xffffff,0x808080,2.4));
  const light = new THREE.DirectionalLight(0xffffff,3); light.position.set(3,5,4); scene.add(light);
  const object = createWaste(row); scene.add(object);
  const camera = new THREE.PerspectiveCamera(38,1,.1,20); camera.position.set(2.4,2.1,3.4); camera.lookAt(0,.65,0);
  return { scene, camera, object };
}
