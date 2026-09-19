import * as THREE from 'three';
import { deliveryPosition } from '../city-common/delivery-simulation.js';

function disposeObject(root) {
  root.traverse?.(object => {
    object.geometry?.dispose?.();
    if (object.material) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) material.dispose?.();
  });
  root.removeFromParent?.();
}

function line(points, color, y = 0.5, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, y, p.z)));
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
  const result = new THREE.Line(geometry, material);
  result.renderOrder = 900;
  return result;
}

export function createLearningVisuals(scene) {
  let visitor = null, delivery = null;
  function clearVisitor() { if (visitor) disposeObject(visitor); visitor = null; }
  function clearDelivery() { if (delivery) disposeObject(delivery); delivery = null; }

  function showVisitorRoute(result) {
    clearVisitor();
    if (!result?.transform?.ok || !Array.isArray(result.worldPath) || result.worldPath.length < 2) return false;
    visitor = new THREE.Group();
    visitor.name = 'visitor-route-guide';
    visitor.userData = { kind: 'visitor-route-guide', status: result.status, points: result.worldPath.length };
    visitor.add(line(result.worldPath, result.ok ? 0x39d98a : 0xff6b5f, 0.62));
    for (const [index, p] of [result.worldPath[0], result.worldPath[result.worldPath.length - 1]].entries()) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.8, 0.5, 16),
        new THREE.MeshBasicMaterial({ color: index ? 0xf6c453 : 0xffffff, depthTest: false })
      );
      marker.position.set(p.x, 0.75, p.z); marker.renderOrder = 901; visitor.add(marker);
    }
    scene.add(visitor);
    return true;
  }

  function showDelivery(state, graph, anchor = { x: 0, z: 0 }) {
    clearDelivery();
    if (!state || !graph?.nodes) return false;
    delivery = new THREE.Group();
    delivery.name = 'delivery-rule-search-demo';
    delivery.position.set(anchor.x, 18, anchor.z);
    delivery.userData = { kind: 'delivery-rule-search-demo', status: state.status, separateFromAmbient: true };
    for (const edge of graph.edges) {
      const a = graph.nodes[edge.from], b = graph.nodes[edge.to];
      delivery.add(line([a, b], edge.noFly ? 0xff6b5f : 0xa8c4c8, 0, edge.noFly ? 0.9 : 0.55));
    }
    for (const [id, node] of Object.entries(graph.nodes)) {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 0.35, 12),
        new THREE.MeshBasicMaterial({ color: node.kind === 'charger' ? 0x58d6ff : node.kind === 'customer' ? 0xf6c453 : 0xe9f2ef, depthTest: false })
      );
      marker.position.set(node.x, 0.25, node.z); marker.userData.nodeId = id; marker.renderOrder = 901; delivery.add(marker);
    }
    if (state.route?.length > 1) delivery.add(line(state.route.map(id => graph.nodes[id]), 0xffa62b, 0.65));

    // One clearly coloured demonstration drone. It is not added to city.drones
    // and is never updated by the ambient random-flight subsystem.
    const drone = new THREE.Group();
    drone.name = 'delivery-demo-drone';
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffa62b, roughness: 0.45, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 2.4), bodyMaterial);
    drone.add(body);
    for (const angle of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 12), bodyMaterial.clone());
      rotor.position.set(Math.cos(angle) * 2, 0.25, Math.sin(angle) * 2); drone.add(rotor);
    }
    const pos = deliveryPosition(state, graph);
    drone.position.set(pos.x, 4, pos.z);
    drone.userData = { kind: 'delivery-demo-drone', status: state.status };
    delivery.add(drone);
    scene.add(delivery);
    return true;
  }

  return {
    showVisitorRoute, clearVisitor, showDelivery, clearDelivery,
    get visitor() { return visitor; },
    get delivery() { return delivery; },
    destroy() { clearVisitor(); clearDelivery(); },
  };
}
