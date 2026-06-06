import type { KgGameModule } from '@edu/contract';
import { manifest } from './manifest.js';
import { Game } from './Game.js';

/**
 * Color the Rainbow as a contract {@link KgGameModule} (§3): a manifest + the standalone
 * `Game` component. A host imports `game` and mounts `<Game ctx={…} />`. No City surface
 * (kindergarten games never carry sim weight — split-by-track contract).
 */
export const game: KgGameModule = { manifest, Game };

// Re-export the parts so a host can also import them individually.
export { manifest, Game };
