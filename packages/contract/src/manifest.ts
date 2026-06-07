import { z } from 'zod';
import { Capability } from './capability.js';
import { LayerName } from './city.js';

/** A localized string map; `en` is required (English-primary), others optional. */
const LocalizedString = z
  .object({ en: z.string().min(1) })
  .catchall(z.string());

/**
 * GameManifest — Zod schema + inferred type in one (§3). `validate-contracts`
 * enforces this plus: per-namespace `ext` schemas, the `dependsOn` DAG, and the
 * a11y two-channel rule (R17). The inner sim schema is additive-only + versioned
 * under core-guardian (split freeze §0.5); the outer surface here is frozen.
 */
export const GameManifest = z.object({
  id: z.string().min(1), // globally unique; reserved at issue-distribution
  track: z.enum(['kindergarten', 'primary']),
  lesson: z.number().int(),
  ageBand: z.string().min(1), // single band in caps, e.g. 'K2' / 'P5' — never a range (lesson cut TBD)
  lessonGroup: z.string().optional(), // links age-variants (future fan-out)
  title: LocalizedString,
  concept: z.string().min(1),

  // --- pedagogy (this is a teaching product — §5b) ---
  objective: LocalizedString, // what the child should LEARN (not "do")
  successCriteria: z.array(z.string().min(1)).min(1), // observable "they got it"
  misconception: z.string().optional(),
  bigIdea: z.number().int().min(1).max(5), // AI4K12 Big Idea this game serves
  /** Honest label of how the "AI" is implemented (§5b internal consistency). */
  aiRepresentation: z.enum(['real-model', 'rule-based', 'remix', 'remote-real']),

  // --- accessibility: two-channel redundancy is contract law (§6b R17) ---
  a11y: z.object({
    instructionChannels: z.array(z.enum(['audio', 'visual', 'symbol'])).min(2),
    inputChannels: z.array(z.enum(['tap', 'voice', 'camera', 'keyboard', 'switch'])).min(2),
    reducedMotion: z.boolean(),
  }),

  capabilities: z.array(Capability),
  assetMode: z.enum(['composed', 'curated', 'remote']), // 'remote' needs sign-off
  assets: z.array(z.string()),
  orientation: z.enum(['portrait', 'landscape', 'any']),

  /** Auto-derives City layout; no central index file (§4g). */
  cityPlacement: z
    .object({
      subsystem: z.string(),
      layer: LayerName,
      gridArea: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    })
    .optional(),
});

export type GameManifest = z.infer<typeof GameManifest>;
