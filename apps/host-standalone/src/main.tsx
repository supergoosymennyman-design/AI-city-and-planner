import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './host.css';
import { game } from '@edu/game-k2-03-color-the-rainbow';
import en from '@edu/game-k2-03-color-the-rainbow/i18n/en.json';
import { createContext } from './context/createContext.js';

/**
 * Entry point: build one concrete `ctx` for this game's lesson and mount it full-screen.
 * A real launcher (R20) would pick the game + catalog dynamically; standalone runs one.
 */
const ctx = createContext({
  manifestId: game.manifest.id,
  ageBand: game.manifest.ageBand,
  catalog: en as Record<string, string>,
});
const { Game } = game;

/**
 * Error boundary (§4h fault tolerance): a thrown render error shows a friendly recover
 * screen instead of a blank page — so one bad touch can never leave a child staring at
 * nothing with no way back. Both hosts will wrap games in this.
 */
class GameErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[host] game crashed', error, info);
  }
  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--edu-font, system-ui)' }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 800 }}>🌈 Oops! Let&apos;s try again.</p>
          <button type="button" className="edu-btn" onClick={() => window.location.reload()}>
            Start again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function HostShell() {
  return (
    <div className="host-root">
      <GameErrorBoundary>
        <Game ctx={ctx} />
      </GameErrorBoundary>
      {/* Minimal teacher overlay (R3): reset clears progress, replay restarts teaching. */}
      <div className="host-teacher" role="toolbar" aria-label="Teacher controls">
        <button type="button" onClick={() => ctx.teacher.reset()} aria-label="Reset" title="Reset">
          ↻
        </button>
        <button type="button" onClick={() => ctx.teacher.replay()} aria-label="Re-teach" title="Re-teach">
          ⟳
        </button>
      </div>
    </div>
  );
}

/**
 * Boot the host. In dev (and unless `?realvoice` is set) we install the click-driven voice
 * simulator FIRST — so the game's `probe('listen')` already sees a recognizer when it mounts —
 * then render. Both imports are dynamic + DEV-gated, so production never bundles @edu/testing.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  // DEV-only `?camera`: mount the live teachable-image harness instead of the game, to test the
  // real `ctx.ai` camera path (trainImageClass → classifyImage) against an actual webcam (§5).
  if (import.meta.env.DEV && params.has('camera')) {
    const { DevCameraSim } = await import('./DevCameraSim.js');
    createRoot(rootEl).render(
      <StrictMode>
        <DevCameraSim ai={ctx.ai} />
      </StrictMode>,
    );
    return;
  }

  // DEV-only `?pose`: mount the live hand/pose harness to test `ctx.ai.detectPose` (§5).
  if (import.meta.env.DEV && params.has('pose')) {
    const { DevPoseSim } = await import('./DevPoseSim.js');
    createRoot(rootEl).render(
      <StrictMode>
        <DevPoseSim ai={ctx.ai} />
      </StrictMode>,
    );
    return;
  }

  const useVoiceSim = import.meta.env.DEV && !params.has('realvoice');
  if (useVoiceSim) {
    const [{ installFakeSpeechRecognition }, { mountVoiceSim }] = await Promise.all([
      import('@edu/testing'),
      import('./DevVoiceSim.js'),
    ]);
    mountVoiceSim(installFakeSpeechRecognition());
  }
  createRoot(rootEl).render(
    <StrictMode>
      <HostShell />
    </StrictMode>,
  );
}

void boot();
