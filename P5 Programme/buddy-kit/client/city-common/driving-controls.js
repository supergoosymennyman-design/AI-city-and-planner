// Runtime action mappings shared by the Workshop preview and City physics.
// Forward is (sin heading, cos heading); positive heading turns driver-left.
export const STEERING = Object.freeze({ straight: 0, 'gentle-left': .10, 'gentle-right': -.10, 'sharp-left': .25, 'sharp-right': -.25 });
export const SPEED = Object.freeze({ go: 6, slow: 2, stop: 0 });
export const DRIVING_CONTROLS = Object.freeze({ steering: STEERING, speed: SPEED });
