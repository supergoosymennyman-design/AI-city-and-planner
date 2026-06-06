import type { FC } from 'react';
import type { GameContext } from './context.js';
import type { GameManifest } from './manifest.js';
import type { CitySubsystem } from './city.js';

/**
 * The Game Module Contract (§3), split by track so KG games never carry
 * City-shaped weight and the Primary sim contract can evolve independently.
 */
export interface BaseGameModule {
  manifest: GameManifest;
  /** The full lesson, standalone. Games touch the platform only via `ctx`. */
  Game: FC<{ ctx: GameContext }>;
}

/** Kindergarten game — no City surface. */
export interface KgGameModule extends BaseGameModule {}

/** Primary game — optionally joins the City as a subsystem. */
export interface PrimaryGameModule extends BaseGameModule {
  subsystem?: CitySubsystem;
}

export type GameModule = KgGameModule | PrimaryGameModule;
