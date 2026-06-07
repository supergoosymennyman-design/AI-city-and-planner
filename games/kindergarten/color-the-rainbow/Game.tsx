import type { FC } from 'react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GameContext, TFunction } from '@edu/contract';
import { Button } from '@edu/ui';
import type { BubbleMsg } from './logic/types.js';
import { COLOURS, SHAPES, TOTAL_ROUNDS, WRONG_PHRASE_COUNT, freshData, rgbToHex, shuffle } from './logic/data.js';
import { pickRound, reduce } from './logic/reducer.js';
import { ShapeSvg } from './ui/Shape.js';
import { Palette } from './ui/Palette.js';
import { PaintableShape } from './ui/PaintableShape.js';
import './styles.css';

/**
 * Resolve the bot's semantic line ({@link BubbleMsg}) to localized text via `ctx.t`.
 * Keeping this OUT of the reducer is what lets the same FSM speak any language —
 * colour names and phrases are themselves catalog keys, composed here (golden rule #3).
 */
function bubbleText(t: TFunction, msg: BubbleMsg): string {
  switch (msg.k) {
    case 'teach.alreadyKnow':
      return t('teach.alreadyKnow', { colour: t(`colour.${msg.colour}`) });
    case 'teach.learned':
      return t('teach.learned', { colour: t(`colour.${msg.colour}`), assoc: t(`assoc.${msg.colour}`) });
    case 'game.wrong':
      // Framed as the AI's OWN claim (no child-blame): the AI states what IT learned, even
      // when that's "wrong" — surfacing its mistraining instead of scolding the child (§5b).
      return t('game.wrong', {
        phrase: t(`feedback.wrong.${msg.phrase % WRONG_PHRASE_COUNT}`),
        actual: t(`colour.${msg.actual}`),
      });
    case 'result':
      return t('result', { score: msg.score, total: TOTAL_ROUNDS });
    default:
      // Simple, var-free lines (intro, teach.colorPrompt, game.ask, …).
      return t(msg.k);
  }
}

/**
 * Color the Rainbow — the standalone lesson (§3 `BaseGameModule.Game`).
 * All platform I/O goes through `ctx`: text via `ctx.t`, chimes via `ctx.audio.play`,
 * TTS via `ctx.audio.speak`, STT via `ctx.ai`, reduce-motion via `ctx.reducedMotion`,
 * teacher reset/replay via `ctx.teacher`. No `window.*`, no globals (golden rule #2).
 *
 * Architecture: a pure reducer holds the FSM; React effects perform the side-effects.
 * `reduce` returns the *same* object for ignored actions, so React bails out and effects
 * don't fire — and a `useRef` guard keeps one-shot sounds single under StrictMode.
 */
export const Game: FC<{ ctx: GameContext }> = ({ ctx }) => {
  const [data, dispatch] = useReducer(reduce, undefined, freshData);
  const t = ctx.t;
  const [listening, setListening] = useState(false);
  const reducedMotion = ctx.reducedMotion;

  // One-shot audio feedback. The ref guards against React 18 StrictMode's double-invoke
  // (same `data` object seen twice) so a chime never plays twice.
  const lastSoundData = useRef<typeof data | null>(null);
  useEffect(() => {
    if (data.sound && lastSoundData.current !== data) {
      lastSoundData.current = data;
      // Best-effort: a flaky/suspended AudioContext must never crash a child's game (§4h).
      try {
        ctx.audio.play(data.sound);
      } catch {
        /* chime is non-critical */
      }
    }
  }, [data, ctx]);

  // The bot SPEAKS its current line (TTS) — the audio twin of the on-screen bubble (§6b).
  // CRITICAL: game progression must NOT depend on TTS resolving. Chrome's speechSynthesis
  // frequently never fires `onend` after cancel() (which interrupt:true calls), which used to
  // wedge the quiz on the feedback screen forever (answer buttons are disabled during feedback
  // → only a reload recovered). So we speak best-effort (fire-and-forget) and advance the round
  // on our OWN guaranteed timer, independent of whether the utterance ever ends.
  useEffect(() => {
    // Best-effort + crash-proof: a TTS device that throws synchronously (e.g. a vendor shim
    // throwing on cancel()) would escape the effect into React's commit phase and unmount the
    // whole game; a rejecting promise would leak. Swallow both — the on-screen bubble is the
    // visual twin (§6b), and progression is on its own timer below, never gated on TTS.
    try {
      void ctx.audio.speak(bubbleText(t, data.bubble), { interrupt: true }).catch(() => {});
    } catch {
      /* TTS unavailable — non-fatal */
    }
    if (data.state === 'game' && data.gameFeedback) {
      const advanceTimer = setTimeout(() => dispatch({ type: 'ADVANCE_AFTER_FEEDBACK' }), 1600);
      return () => clearTimeout(advanceTimer);
    }
    return undefined;
  }, [data.bubble, data.state, data.gameFeedback, ctx, t]);

  // Teacher overlay → game. reset clears everything; replay restarts teaching (§ R3).
  useEffect(() => {
    return ctx.teacher.onChange((action) => {
      if (action === 'reset') dispatch({ type: 'RESET' });
      if (action === 'replay' || action === 'back') dispatch({ type: 'RETEACH' });
    });
  }, [ctx]);

  // In the quiz with no active question → roll the next round (randomness lives here).
  // Deps are the three fields read in the guard — NOT `data` itself, which would re-fire on
  // every transition and (under StrictMode) double-dispatch START_ROUND.
  useEffect(() => {
    if (data.state === 'game' && !data.gamePick && !data.gameFeedback) {
      const { pick, shape } = pickRound(data);
      dispatch({ type: 'START_ROUND', pick, shape });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` intentionally omitted (see above)
  }, [data.state, data.gamePick, data.gameFeedback]);

  // Latest state, read by the async voice handler at resolve-time — the ~6s listen window is
  // long enough that the child could tap or the teacher could reset meanwhile, so dispatching
  // off this closure's `data` snapshot would risk acting on a stale phase.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Probe STT once. Voice is an OPTIONAL extra (Android-Chrome only, §5); when absent the mic
  // simply doesn't render and tap/keyboard carries the whole lesson (R21 graceful gating).
  const [canListen, setCanListen] = useState(false);
  useEffect(() => {
    let mounted = true;
    void ctx.ai
      .probe('listen')
      .then((ok) => {
        if (mounted) setCanListen(ok);
      })
      .catch(() => {
        if (mounted) setCanListen(false); // probe failed → treat as no STT (tap carries the lesson)
      });
    return () => {
      mounted = false;
    };
  }, [ctx]);

  // True after a listen heard nothing usable → a gentle "try again" (we KEEP listening).
  const [micHint, setMicHint] = useState(false);

  // Is the game in a phase that wants a spoken colour? (the teach-name step, or an active quiz
  // round). The mic is meaningful only here.
  const wantsColour =
    (data.state === 'teaching' && data.awaitingColorName) ||
    (data.state === 'game' && !!data.gamePick && !data.gameFeedback);

  // AUTO-START / STOP the mic with the prompt. Pressing "Teach AI!" (or a new quiz round) opens
  // the naming step → the mic turns on and STAYS on (continuous); leaving the prompt turns it
  // off. This is the requested behaviour: voice keeps listening after Teach AI instead of needing
  // a re-tap. Privacy (§5c): the cloud mic is open only DURING an active prompt, the child/teacher
  // can Stop it (the mic button toggles), and tap/keyboard is always available.
  useEffect(() => {
    setListening(wantsColour && canListen);
  }, [wantsColour, canListen]);

  // Clear the "try again" nudge each time a fresh prompt begins.
  useEffect(() => {
    setMicHint(false);
  }, [data.awaitingColorName, data.gamePick]);

  // CONTINUOUS LISTEN LOOP — re-arms itself, so a miss / silence / non-colour word is NEVER a
  // dead end (the bug: the old one-shot left the mic dead after a miss; saying a non-colour in
  // the quiz looked frozen). Runs only while listening + in an active prompt; stops on a matched
  // colour, on Stop, or when the phase changes. The small pace delay stops a tight spin if
  // listenOnce resolves instantly (the real STT paces itself via its own ~5s timeout).
  useEffect(() => {
    if (!listening || !canListen || !wantsColour) return undefined;
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        // Real Web Speech REJECTS on onerror (no-speech / network / not-allowed / aborted). A
        // rejection must behave like silence, NOT kill the loop — otherwise the mic dead-ends,
        // regressing the very bug this loop exists to fix. Treat any failure as "heard nothing".
        let heard: string | null = null;
        try {
          heard = await ctx.ai.listenOnce({ lang: 'en-US', timeoutMs: 5000 });
        } catch {
          heard = null;
        }
        if (cancelled) return;
        const match = COLOURS.find((c) => (heard ?? '').toLowerCase().includes(c));
        if (match) {
          // Dispatch against the LATEST state, not this closure's snapshot (see dataRef above).
          const now = dataRef.current;
          if (now.state === 'teaching' && now.awaitingColorName) dispatch({ type: 'ANSWER_COLOUR', colour: match });
          else if (now.state === 'game' && now.gamePick && !now.gameFeedback) dispatch({ type: 'GAME_TAP', chosen: match });
          return; // got a colour → stop; the phase change resets `listening`
        }
        setMicHint(true); // heard nothing usable — keep listening, just nudge the child
        await new Promise((r) => setTimeout(r, 350));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listening, canListen, wantsColour, ctx]);

  // Quiz answer buttons get a stable shuffled order per round (don't reshuffle on re-render).
  const answerOrder = useMemo(() => shuffle(COLOURS), [data.gameRound, data.gamePick]);

  const colourName = (c: string): string => t(`colour.${c}`);

  return (
    <div className="ctr-app" data-state={data.state}>
      <header className="ctr-top">
        <div className="ctr-bot">
          <span className="ctr-bot-char" role="img" aria-label={t('bot.name')}>
            🤖
          </span>
          {/* aria-live so screen readers announce the bot's line (the audio twin, §6b) */}
          <p className="ctr-bubble" aria-live="polite">
            {bubbleText(t, data.bubble)}
          </p>
        </div>
        {(data.state === 'game' || data.state === 'result') && (
          <div className="ctr-score" aria-label={t('score.label', { score: data.gameScore, total: TOTAL_ROUNDS })}>
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
              <span key={i} className={i < data.gameScore ? 'star f' : 'star e'}>
                {i < data.gameScore ? '★' : '☆'}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="ctr-stage">{renderStage()}</main>
    </div>
  );

  // --- phase renderers (closures over data/dispatch/t) ---

  /**
   * The shared mic (teaching + quiz). Continuous: it auto-listens during a prompt and the button
   * TOGGLES listening (Stop / Start) — never a dead end. Rendered only when STT is available
   * (R21 gating); otherwise voice is silently absent and tap carries the lesson.
   */
  function renderMic() {
    if (!canListen) return null;
    return (
      <div className="ctr-mic-area">
        <button
          type="button"
          className="ctr-mic"
          aria-pressed={listening}
          aria-label={listening ? t('mic.stop') : t('mic.tap')}
          onClick={() => setListening((on) => !on)}
        >
          <span aria-hidden="true">{listening ? t('mic.stopLabel') : t('mic.label')}</span>
        </button>
        {/* aria-live announces listening / retry for screen readers (the audio twin, §6b) */}
        <p className="ctr-listening" aria-live="polite">
          {listening ? t('listening') : micHint ? t('mic.again') : ''}
        </p>
      </div>
    );
  }

  function renderStage() {
    switch (data.state) {
      case 'intro':
        return (
          <div className="ctr-center">
            <p className="ctr-prompt">{t('intro.title')}</p>
            <p className="ctr-sub">{t('intro.sub')}</p>
            <Button onClick={() => dispatch({ type: 'START_TEACHING' })}>{t('intro.start')}</Button>
          </div>
        );

      case 'teaching':
        return (
          <div className="ctr-center">
            <p className="ctr-prompt">{t(data.shapeFilled ? 'teach.name' : 'teach.paint')}</p>
            {/* Pick a crayon, then drag to paint (or "Fill it!"). Hidden once we ask for the
                NAME, so there aren't two Red/Blue/Yellow control sets on screen at once. */}
            {!data.awaitingColorName && (
              <Palette
                selectedHex={data.selectedHex}
                onPick={(hex) => dispatch({ type: 'SELECT_COLOUR', hex })}
                label={colourName}
                groupLabel={t('palette.label')}
              />
            )}
            <PaintableShape
              shape={SHAPES[data.taughtCount % SHAPES.length] ?? 'circle'}
              colour={data.selectedHex}
              filled={data.shapeFilled}
              onFilled={() => dispatch({ type: 'TAP_SHAPE' })}
              reducedMotion={reducedMotion}
              fillLabel={t('teach.fillBtn')}
              ariaLabel={t('teach.shapeAria')}
              coverageLabel={(pct) => t('teach.coverage', { pct })}
            />
            {data.awaitingColorName ? (
              <div className="ctr-answer-area">
                {renderMic()}
                <div className="ctr-answers" role="group" aria-label={t('teach.name')}>
                  {COLOURS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`ctr-name-btn ctr-name-${c}`}
                      onClick={() => dispatch({ type: 'ANSWER_COLOUR', colour: c })}
                    >
                      {colourName(c)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // The explicit "Teach AI!" beat (reinforces Big Idea 3) appears once painted.
              data.shapeFilled && (
                <Button variant="secondary" onClick={() => dispatch({ type: 'TEACH_COLOR' })}>
                  {t('teach.teachBtn')}
                </Button>
              )
            )}
          </div>
        );

      case 'game': {
        const pick = data.gamePick;
        const fill = pick && data.learned[pick].rgb ? rgbToHex(data.learned[pick].rgb!) : '#e0e0e0';
        return (
          <div className="ctr-center">
            <p className="ctr-prompt">{t('game.round', { round: data.gameRound + 1, total: TOTAL_ROUNDS })}</p>
            <div className="ctr-shape-wrap" data-feedback={data.gameFeedback ?? ''}>
              <ShapeSvg shape={data.gameShape ?? 'circle'} fill={fill} ariaLabel={t('game.shapeAria')} />
            </div>
            {!data.gameFeedback && renderMic()}
            <div className="ctr-answers" role="group" aria-label={t('game.ask')}>
              {answerOrder.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ctr-name-btn ctr-name-${c}`}
                  disabled={!!data.gameFeedback}
                  onClick={() => dispatch({ type: 'GAME_TAP', chosen: c })}
                >
                  {colourName(c)}
                </button>
              ))}
            </div>
          </div>
        );
      }

      case 'result':
        return (
          <div className="ctr-center">
            <p className="ctr-result-score">{t('result.score', { score: data.gameScore, total: TOTAL_ROUNDS })}</p>
            <div className="ctr-stars-big" aria-hidden="true">
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <span key={i} className={i < data.gameScore ? 'star f' : 'star e'}>
                  {i < data.gameScore ? '★' : '☆'}
                </span>
              ))}
            </div>
            <div className="ctr-answers">
              <Button onClick={() => dispatch({ type: 'PLAY_AGAIN' })}>{t('result.playAgain')}</Button>
              <Button variant="secondary" onClick={() => dispatch({ type: 'RETEACH' })}>
                {t('result.reteach')}
              </Button>
            </div>
          </div>
        );
    }
  }
};
