/* Stable schemas throughout the school. These are editable practice examples,
 * never an inference-time controller or evaluation scenarios. SI units. */
(function () {
  'use strict';
  const numeric = (id, min, max, name) => ({ id, min, max, name });
  const schemas = {
    steering: { id: 'drive-steering-v2', nameKey: 'dataset.drive.steering.name', size: 375, name: 'Steering / 轉向', kind: 'labels', studyDefault: 1,
      features: [numeric('laneOffset', -3, 3, 'Lane offset (m) / 偏移'), numeric('headingError', -.6, .6, 'Heading error (rad) / 角度誤差'), numeric('roadDirection', -.6, .6, 'Road ahead (rad) / 前方方向'), numeric('speed', 0, 8, 'Speed (m/s) / 車速')],
      answer: { name: 'Steering / 轉向', labels: ['straight', 'gentle-left', 'gentle-right', 'sharp-left', 'sharp-right'] } },
    speed: { id: 'drive-speed-v2', nameKey: 'dataset.drive.speed.name', size: 1200, name: 'Speed / 車速', kind: 'labels', studyDefault: 1,
      features: [numeric('speed', 0, 8, 'Speed (m/s) / 車速'), numeric('clearance', 0, 40, 'Clearance (m) / 前方距離'), numeric('closingSpeed', -8, 8, 'Closing speed (m/s) / 接近速度'), { id: 'signal', options: ['none', 'green', 'amber', 'red'], name: 'Signal / 交通燈' }, numeric('signalDistance', 0, 40, 'Stop line (m) / 停車線距離'), { id: 'crossing', options: ['clear', 'occupied'], name: 'Crossing / 行人過路處' }, numeric('bend', 0, .6, 'Bend (rad) / 彎度'), numeric('finishDistance', 0, 40, 'Finish (m) / 終點距離')],
      answer: { name: 'Speed / 車速', labels: ['go', 'slow', 'stop'] } },
  };
  const clear = { speed: 0, clearance: 40, closingSpeed: 0, signal: 'none', signalDistance: 40, crossing: 'clear', bend: 0, finishDistance: 40 };
  function rows(role) {
    const out = [], schema = schemas[role];
    const add = (features, answer) => out.push({ i: out.length, features, answer, face: schema.features.map(f => `${f.id} ${features[f.id]}`).join(' · ') });
    if (role === 'steering') {
      for (const laneOffset of [-2,-1,0,1,2]) for (const headingError of [-.4,-.2,0,.2,.4]) for (const roadDirection of [-.4,-.2,0,.2,.4]) for (const speed of [0,3,6]) {
        const correction = roadDirection * .65 - headingError - laneOffset * .22;
        const answer = Math.abs(correction) < .055 ? 'straight' : (Math.abs(correction) > .26 ? 'sharp-' : 'gentle-') + (correction > 0 ? 'left' : 'right');
        add({ laneOffset, headingError, roadDirection, speed }, answer);
      }
    } else if (role === 'speed') {
      for (const speed of [0,2,4,6,8]) for (const distance of [0,1,2,3,4,6,9,14,22,40]) for (const bend of [0,.2,.4]) {
        const stop = speed * speed / 10 + 1.5;
        const label = d => d <= stop ? 'stop' : d < stop + 7 || bend > .16 ? 'slow' : 'go';
        add({ ...clear, speed, bend, finishDistance: distance }, label(distance));
        for (const closingSpeed of [0,4,8]) add({ ...clear, speed, bend, clearance: distance, closingSpeed }, label(distance));
        for (const signal of ['green','red','amber']) add({ ...clear, speed, bend, signal, signalDistance: distance }, signal === 'green' ? label(40) : label(distance));
        add({ ...clear, speed, bend, crossing: 'occupied', clearance: distance }, label(distance));
      }
    } else throw new Error('Unknown driving model');
    return out;
  }
  const steeringConvention = 'driver-left-positive-v3';
  const oppositeLabels = Object.freeze({'gentle-left':'gentle-right','gentle-right':'gentle-left','sharp-left':'sharp-right','sharp-right':'sharp-left'});
  const reverseSteeringLabel = label => Object.hasOwn(oppositeLabels, label) ? oppositeLabels[label] : label;
  // Move entire shelves; retain IDs, raw readings, vectors and teaching metadata.
  function migrateSteeringPiece(piece) {
    if (piece.drivingRole !== 'steering' || piece.steeringConvention === steeringConvention) return false;
    const brain = piece.learning?.data?.brain;
    if (brain?.shelves) brain.shelves = Object.fromEntries(Object.entries(brain.shelves).map(([label, examples]) => [reverseSteeringLabel(label), examples]));
    piece.steeringConvention = steeringConvention;
    return true;
  }
  const api = { schemas, rows, clear, steeringConvention, reverseSteeringLabel, migrateSteeringPiece, preprocessing: 'data-minmax-onehot-level1-unit-v1' };
  globalThis.WorkshopDrivingPairData = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
