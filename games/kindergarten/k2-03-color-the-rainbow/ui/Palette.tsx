import type { FC } from 'react';
import { PALETTE } from '../logic/data.js';

/** Props for {@link Palette}. `label` resolves a colour name to localized text. */
export interface PaletteProps {
  selectedHex: string | null;
  onPick: (hex: string) => void;
  /** i18n: colour key (e.g. 'red') → aria label, so swatches aren't colour-only (§6b). */
  label: (colour: string) => string;
  /** Localized aria-label for the swatch group (no hardcoded text — golden rule #3). */
  groupLabel: string;
}

/**
 * The colour swatches the child paints with. Each is a real <button> (keyboard + tap +
 * screen-reader operable) with an aria-label, so the choice is conveyed by NAME as well
 * as hue — colour is never the only cue (accessibility, golden rule #6). `onClick` (not
 * pointerdown) so Enter/Space work; CSS `touch-action: manipulation` kills the tap delay.
 */
export const Palette: FC<PaletteProps> = ({ selectedHex, onPick, label, groupLabel }) => (
  <div className="ctr-palette" role="group" aria-label={groupLabel}>
    {PALETTE.map((c) => (
      <button
        key={c.hex}
        type="button"
        className={'ctr-swatch' + (selectedHex === c.hex ? ' sel' : '')}
        style={{ background: c.hex }}
        aria-label={label(c.name)}
        aria-pressed={selectedHex === c.hex}
        onClick={() => onPick(c.hex)}
      />
    ))}
  </div>
);
