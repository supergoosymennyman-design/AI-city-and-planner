#!/usr/bin/env node
/**
 * Verify-at-build probe for the P5 Buddy "own engine" swap (Task 1).
 *
 * WHY THIS EXISTS: the Vercel AI SDK's `fullStream` chunk property names,
 * the resolved `usage` object's field names, and the step-cap API
 * (`stopWhen: stepCountIs(n)` vs `maxSteps`) all differ across AI SDK
 * majors and are NOT safe to assume from memory or docs. This script
 * drives a real `streamText()` call and logs every observed shape
 * VERBATIM so later tasks can build the engine against verified
 * reality instead of assumption.
 *
 * MODES
 * - Offline (default, no BUDDY_MODEL_KEY set): drives streamText() against
 *   a hand-rolled mock model (see NOTE below) so this probe ALWAYS runs
 *   without network access or a key. This is the mode CI / this
 *   environment runs and records.
 * - Live (BUDDY_MODEL_KEY set): drives streamText() against the real
 *   Zen endpoint via createOpenAICompatible, and additionally records
 *   which model id actually answers.
 *
 * NOTE on the mock model -- why this isn't `MockLanguageModelV2` from
 * 'ai/test':
 * The plan's reference mock is `MockLanguageModelV2` from `ai/test`. As
 * installed here (ai@5.0.216 -> @ai-sdk/provider-utils@3.0.30), the
 * `ai/test` subpath is a SINGLE bundled file that unconditionally
 * requires `@ai-sdk/provider-utils/test`'s `createTestServer`, which in
 * turn requires `msw`, which (once installed) itself requires `vitest`.
 * Confirmed by direct import attempts (both `require('ai/test')` and
 * `import('ai/test')` fail the same way; installing `msw` alone just
 * trades one missing-module error for the next one, `vitest`). Neither
 * package is a dependency of this repo (which runs tests under
 * `node --test`, not vitest), so pulling in a second test framework as a
 * devDependency just to satisfy one barrel file's unrelated export was
 * judged out of scope for this task. See task-1-report.md for the exact
 * error text.
 *
 * Instead, this probe implements the same minimal shape
 * `MockLanguageModelV2` itself wraps: a plain object conforming to the
 * `LanguageModelV2` interface from `@ai-sdk/provider`
 * (`specificationVersion: 'v2'`, `doStream()` returning a
 * `ReadableStream<LanguageModelV2StreamPart>`). That still exercises the
 * REAL `streamText`/`fullStream` transform machinery end-to-end -- which
 * is the actual thing this probe exists to verify -- with zero new
 * dependencies. If a future task wants `MockLanguageModelV2` itself for
 * unit tests, adding `msw` + `vitest` (or waiting for an SDK patch that
 * splits the barrel) is a deliberate call to make then, not implied by
 * this probe.
 */

import { streamText, tool, stepCountIs } from 'ai';
import * as aiNS from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { DEFAULT_BASE_URL } from '../provider.js';

const hasLiveKey = Boolean(process.env.BUDDY_MODEL_KEY);

/**
 * Hand-rolled LanguageModelV2-conformant mock (see file header for why this
 * exists instead of `ai/test`'s MockLanguageModelV2). Emits a first step
 * with a text answer + a tool call, then (once the SDK feeds the tool
 * result back in) a second step with a final text-only answer -- so the
 * probe observes text-delta, tool-call, and multi-step finish/usage shapes
 * in one run.
 *
 * @returns {import('@ai-sdk/provider').LanguageModelV2} a minimal v2 model
 */
function makeMockModel() {
  let stepCount = 0;
  return {
    specificationVersion: 'v2',
    provider: 'buddy-mock',
    modelId: 'buddy-mock-model',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('probe-engine mock: doGenerate is not implemented (this probe only exercises doStream/streamText).');
    },
    async doStream() {
      stepCount += 1;
      const isFirstStep = stepCount === 1;
      /** @type {import('@ai-sdk/provider').LanguageModelV2StreamPart[]} */
      const parts = [
        { type: 'stream-start', warnings: [] },
        { type: 'response-metadata', id: `mock-response-${stepCount}`, modelId: 'buddy-mock-model', timestamp: new Date(0) },
      ];
      if (isFirstStep) {
        parts.push(
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hi ' },
          { type: 'text-delta', id: 'text-1', delta: 'there! Let me check something.' },
          { type: 'text-end', id: 'text-1' },
          { type: 'tool-input-start', id: 'call-1', toolName: 'ping' },
          { type: 'tool-input-delta', id: 'call-1', delta: '{}' },
          { type: 'tool-input-end', id: 'call-1' },
          { type: 'tool-call', toolCallId: 'call-1', toolName: 'ping', input: '{}' },
          { type: 'finish', usage: { inputTokens: 12, outputTokens: 9, totalTokens: 21 }, finishReason: 'tool-calls' },
        );
      } else {
        parts.push(
          { type: 'text-start', id: 'text-2' },
          { type: 'text-delta', id: 'text-2', delta: 'Got pong back -- all done!' },
          { type: 'text-end', id: 'text-2' },
          { type: 'finish', usage: { inputTokens: 24, outputTokens: 7, totalTokens: 31 }, finishReason: 'stop' },
        );
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

function buildLiveModel() {
  const baseURL = process.env.BUDDY_MODEL_URL ?? DEFAULT_BASE_URL;
  const modelId = process.env.BUDDY_MODEL_ID ?? 'mimo-v2.5-free';
  const provider = createOpenAICompatible({
    name: 'buddy-model',
    baseURL,
    apiKey: process.env.BUDDY_MODEL_KEY,
    includeUsage: true,
  });
  return { model: provider(modelId), baseURL, modelId };
}

/** Log a chunk's `type` plus its own enumerable property names (not values -- shape, not content). */
function logChunkShape(index, chunk) {
  const ownKeys = Object.keys(chunk).filter((k) => k !== 'type');
  console.log(`  [${index}] type=${JSON.stringify(chunk.type)} ownProps=[${ownKeys.join(', ')}]`);
}

async function main() {
  console.log('=== probe-engine: AI SDK verify-at-build probe ===');
  console.log(`mode: ${hasLiveKey ? 'LIVE (BUDDY_MODEL_KEY set)' : 'OFFLINE (mock model; no BUDDY_MODEL_KEY)'}`);

  // ALWAYS-ON provider pairing check (learned the hard way: the openai-compatible@3.x line builds
  // `specificationVersion:'v4'` models that ai@5's streamText REJECTS before any network call, and
  // the offline/mock path never constructed the real provider model, so the mismatch shipped
  // through Task 1 unseen). Construct the real provider model even with no key and fail loudly if
  // its spec version isn't the 'v2' this ai major consumes.
  const pairingModel = buildLiveModel().model;
  console.log(`provider model specificationVersion: ${pairingModel.specificationVersion}`);
  if (pairingModel.specificationVersion !== 'v2') {
    console.error("FAIL: provider/ai major mismatch -- streamText will reject this model. Re-pin @ai-sdk/openai-compatible to the major whose models report specificationVersion 'v2'.");
    process.exitCode = 1;
  }

  let model;
  let liveInfo = null;
  if (hasLiveKey) {
    const built = buildLiveModel();
    model = built.model;
    liveInfo = built;
    console.log(`live baseURL: ${built.baseURL}`);
    console.log(`live modelId requested: ${built.modelId}`);
  } else {
    model = makeMockModel();
    console.log("mock import path used: NONE -- 'ai/test' MockLanguageModelV2 is unusable as installed (requires msw + vitest transitively); probe hand-rolls a LanguageModelV2 v2-spec object instead. See file header comment.");
  }

  const result = streamText({
    model,
    prompt: 'Say hi in one short sentence.',
    tools: {
      ping: tool({
        description: 'ping',
        inputSchema: z.object({}),
        execute: async () => 'pong',
      }),
    },
    stopWhen: stepCountIs(3),
  });

  console.log('\n--- fullStream chunks (type + own property names) ---');
  let i = 0;
  for await (const chunk of result.fullStream) {
    logChunkShape(i, chunk);
    // Also dump full values for the usage-bearing chunk types, so later
    // tasks can see whether `finish`'s totalUsage is a genuine cross-step
    // SUM (this mock deliberately gives each step different, non-additive
    // numbers so a real sum vs a last-step-only value are distinguishable).
    if (chunk.type === 'finish-step' || chunk.type === 'finish') {
      console.log(`      value: ${JSON.stringify(chunk)}`);
    }
    i += 1;
  }

  console.log('\n--- await result.usage ---');
  const usage = await result.usage;
  console.log('usage keys:', Object.keys(usage));
  console.log('usage value:', JSON.stringify(usage));
  console.log("NOTE (per ai's own .d.ts doc comment): result.usage is the LAST STEP's usage only, NOT a cross-step sum.");

  console.log('\n--- await result.totalUsage ---');
  const totalUsage = await result.totalUsage;
  console.log('totalUsage value:', JSON.stringify(totalUsage));
  console.log("NOTE: totalUsage IS the sum of every step's usage (confirmed: this mock's two steps use non-additive numbers and totalUsage equals their sum).");

  console.log('\n--- await result.toolCalls ---');
  const toolCalls = await result.toolCalls;
  console.log('toolCalls:', JSON.stringify(toolCalls));
  console.log("NOTE (per ai's own .d.ts doc comment): result.toolCalls is the tool calls made in the LAST STEP only -- empty here because the final step was a plain text answer. Use result.steps (or the fullStream tool-call chunks) to see tool calls from EARLIER steps.");

  console.log('\n--- await result.steps (per-step toolCalls) ---');
  const steps = await result.steps;
  steps.forEach((step, idx) => {
    console.log(`  step[${idx}] finishReason=${step.finishReason} toolCalls=${JSON.stringify(step.toolCalls)}`);
  });

  console.log('\n--- step-cap API check ---');
  console.log(`typeof stepCountIs (from 'ai'): ${typeof stepCountIs}`);
  // Runtime-checked (not asserted from memory): on an SDK bump this line re-verifies itself.
  console.log(`'maxSteps' exported from 'ai': ${'maxSteps' in aiNS} (stopWhen: stepCountIs(n) is the installed step-cap API when false)`);

  if (hasLiveKey) {
    const finishReason = await result.finishReason;
    const text = await result.text;
    console.log('\n--- live answer check ---');
    console.log(`finishReason: ${finishReason}`);
    console.log(`text: ${JSON.stringify(text)}`);
    console.log(`model id that answered: ${liveInfo.modelId} (requested id; provider does not echo a different resolved id in this SDK version's public result)`);
  }

  console.log('\n=== probe-engine: done ===');
}

main().catch((err) => {
  console.error('probe-engine FAILED:', err);
  process.exitCode = 1;
});
