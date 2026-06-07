import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { VoiceSimController } from '@edu/testing';

/**
 * Dev-only on-screen voice simulator. Real Web Speech STT is flaky/cloud-bound and absent on
 * iPad (§5), so in dev we swap it for {@link installFakeSpeechRecognition} and let you click
 * what the child "says". This drives the host's REAL `ctx.ai.listenOnce` path end-to-end —
 * the same code that runs in production — so you can verify the mic without speaking.
 *
 * NEVER shipped: `main.tsx` mounts this only behind `import.meta.env.DEV`, so it's tree-shaken
 * out of production builds.
 */

const panel: CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxWidth: 230,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(28,24,18,0.92)',
  color: '#fff',
  font: '13px/1.3 system-ui, sans-serif',
  boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
};
const chip: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
};

function VoiceSimPanel({ controller }: { controller: VoiceSimController }): JSX.Element {
  // Each says a full phrase (the game matches the colour substring), so it also exercises the
  // "AI, this is red!" wording. "banana" → a heard-but-no-colour miss; "silence" → heard nothing.
  const say = (phrase: string) => () => controller.say(phrase);
  return (
    <div style={panel} aria-hidden="true">
      <strong>🎤 Voice simulator (dev)</strong>
      <span style={{ opacity: 0.8, fontSize: 11 }}>1) Tap 🎤 in the game · 2) Click what the child says:</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" style={chip} onClick={say('this is red')}>🔴 red</button>
        <button type="button" style={chip} onClick={say('this is blue')}>🔵 blue</button>
        <button type="button" style={chip} onClick={say('this is yellow')}>🟡 yellow</button>
        <button type="button" style={chip} onClick={say('banana')}>🍌 "banana" (no match)</button>
        <button type="button" style={chip} onClick={() => controller.silence()}>🤐 silence</button>
      </div>
      <span style={{ opacity: 0.55, fontSize: 10 }}>Real mic disabled in dev — add ?realvoice to the URL to use it.</span>
    </div>
  );
}

/** Append the simulator panel to the page (its own root, so it never disturbs the game tree). */
export function mountVoiceSim(controller: VoiceSimController): void {
  const host = document.createElement('div');
  host.id = 'edu-voicesim';
  document.body.appendChild(host);
  createRoot(host).render(<VoiceSimPanel controller={controller} />);
}
