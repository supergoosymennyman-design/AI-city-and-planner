/**
 * @edu/contract — the single source of truth for the platform contract (§3/§4).
 * Outer surfaces (GameModule/GameManifest/GameContext) are FROZEN; the inner sim
 * schema (CityState, Capability, tick rules) is additive-only + versioned under
 * core-guardian (split freeze §0.5).
 */
export * from './capability.js';
export * from './rng.js';
export * from './services.js';
export * from './context.js';
export * from './city.js';
export * from './manifest.js';
export * from './module.js';
