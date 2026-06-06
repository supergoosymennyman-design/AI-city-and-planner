import { z } from 'zod';
import type { FC } from 'react';
import type { GameContext } from './context.js';
import type { SeededRng } from './rng.js';

/** The three toggleable City layers (§4). */
export const LayerName = z.enum(['power-utility', 'logistics-waste', 'social-safety']);
export type LayerName = z.infer<typeof LayerName>;

/**
 * CityState — the single source of truth (§4a). JSON-serializable ONLY
 * (no Map/Set/class/closure/typed-array). All sim-critical quantities are
 * integers in MILLI-UNITS (value × 1000) with truncating math (§4c fixed-point)
 * so determinism is reproducible on the pinned engine.
 *
 * Cross-subsystem cascades flow through `ext`, namespaced by subsystem id
 * (`tiles[i].ext['waste'].trash`) — additive, never a core-schema edit (§4d).
 * Each `ext['<id>']` shape has its own Zod schema owned by that subsystem and
 * registered with @edu/city; readers import the type, never redefine it.
 */
export const TileSchema = z.object({
  id: z.number().int(),
  x: z.number().int(),
  y: z.number().int(),
  ext: z.record(z.string(), z.unknown()).default({}),
});
export type Tile = z.infer<typeof TileSchema>;

export const DistrictSchema = z.object({
  id: z.string(),
  tileIds: z.array(z.number().int()),
  ext: z.record(z.string(), z.unknown()).default({}),
});
export type District = z.infer<typeof DistrictSchema>;

export const GlobalsSchema = z.object({
  tick: z.number().int(), // sim tick count
  timeScale: z.number().int(), // 1, 1000, ... (extreme scale is precomputed §4b)
  temperatureMilli: z.number().int(), // fixed-point example global
  budgetTokens: z.number().int(),
});
export type Globals = z.infer<typeof GlobalsSchema>;

export const CityStateSchema = z.object({
  schemaVersion: z.number().int(),
  rngSeed: z.number().int(),
  globals: GlobalsSchema,
  tiles: z.array(TileSchema),
  districts: z.array(DistrictSchema),
  /** Per-subsystem private serializable blob, namespaced by subsystem id. */
  subsystems: z.record(z.string(), z.unknown()).default({}),
});
export type CityState = z.infer<typeof CityStateSchema>;

/**
 * A primary game's City face (§4). The standalone game and the subsystem share
 * `logic/` but are different surfaces.
 */
export interface CitySubsystem {
  id: string; // unique: 'power' | 'waste' | 'traffic' ...
  lesson: number;
  /** ids whose tick must run first; host topo-sorts → fixed deterministic order (DAG, §4c). */
  dependsOn: string[];
  init(state: CityState, ctx: GameContext): void;
  /**
   * MODEL (live, 1×–1000×): integrate `dtSim` (a DURATION in sim-seconds).
   * Closed-form where natural, else ≤K bounded macro-steps (§4b) — never one
   * step per sim-second. Deterministic (fixed-point; use `rng`, never Math.random);
   * mutate serializable fields only. Extreme scale is precomputed, not this path.
   */
  tick(state: CityState, dtSim: number, rng: SeededRng): void;
  /** VIEW: subscribes to coarse/throttled store slices (§4e). */
  Layer: FC<{ layer: LayerName }>;
  /** Optional tap-to-inspect at 1×. */
  Inspector?: FC<{ entityId: string }>;
}

/** A schema migration step in the @edu/city registry (§4f). */
export interface Migration {
  from: number;
  to: number;
  migrate(old: unknown): unknown;
}
