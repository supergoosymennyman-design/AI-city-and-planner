/**
 * @edu/ui — the shared, accessible, tablet-first design system (§1, §6b).
 * Kept deliberately tiny for now: design tokens (`tokens.css`) + the primitives the
 * first games actually use. Grow it as the 2nd/3rd game needs a primitive — never
 * speculatively (YAGNI). Every primitive must satisfy the a11y floor (≥44px targets,
 * keyboard focus, two-channel-friendly) so games inherit it for free.
 */
export { Button } from './Button.js';
export type { ButtonProps } from './Button.js';
