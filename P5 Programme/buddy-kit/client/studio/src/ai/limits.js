/**
 * limits.js — the single source of truth for the AI path's hard caps.
 *
 * These live in ONE module so a cap can never drift between the two places
 * that enforce it (the preview renderer and the apply path) or between the
 * response reader and the error formatter. The values are deliberately
 * generous for a children's modelling app but small enough that a hostile (or
 * merely over-enthusiastic) model reply cannot freeze the browser tab.
 *
 * Pure ESM, zero dependencies, no DOM — importable from Node tests and from the
 * UI modules alike.
 */

/**
 * Most AI objects that may ever be RENDERED in the preview or APPLIED to the
 * scene from one reply.
 *
 * A model can legitimately return hundreds of primitives, but each one is its
 * own geometry + material + mesh build and a single undo entry, so an unbounded
 * set stalls the main thread (measured: ~20,000 objects blocked an apply for
 * ~28–35 s). The preview and the apply path share this ONE constant, so the
 * number of shapes a child sees promised is exactly the number that can land in
 * the scene. Anything above the cap is reported to the user, never silently
 * dropped.
 *
 * @type {number}
 */
export const MAX_AI_OBJECTS = 150;

/**
 * Largest response body (in characters) accepted from an AI endpoint before it
 * is parsed.
 *
 * The client reads the body as text and rejects anything longer BEFORE
 * `JSON.parse`/fence-scanning/render, because that processing is what blocks the
 * UI thread (measured: an 8 MB body blocked for ~5 s; a 5 MB body for ~18 s).
 * A 2 MiB ceiling is far above any reasonable primitive-shape reply — even a
 * 20,000-object reply fits under it — while refusing the pathological sizes.
 *
 * @type {number}
 */
export const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;

/**
 * Largest absolute coordinate accepted on any axis of an AI transform.
 *
 * `1e308` is legal JSON but makes three.js bounds/camera maths non-finite, which
 * blanks the preview. Clamping to a world scale far larger than any lesson
 * scene yet far inside IEEE-754's comfortable range keeps every downstream
 * bounding box and camera finite. Out-of-range values are recorded as soft
 * repairs so the adjustment is visible, never silent.
 *
 * @type {number}
 */
export const MAX_COORD = 1e6;
