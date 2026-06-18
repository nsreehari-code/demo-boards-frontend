// Offline golden tests for the platform-free board-state reducer (board-sse-state.js).
//
// These run with Node's built-in test runner (`node --test`) and require NO live
// backend: they replay a frozen recording of the deterministic smoke SSE stream
// through `applyBoardSseFrame` and assert the converged snapshot.
//
// The fixtures are produced by the deterministic smoke subset (LLM cases excluded):
//   cd ../demo-boards-ns-code
//   node demo-board/test/my-http-test.js --skip-tests T8,T9,T8F,T9F \
//     --capture-sse-frames ../demo-boards-frontend/tests/fixtures/deterministic-smoke.frames.json
//
// Regenerate the golden snapshot after a (re)capture with: UPDATE_GOLDEN=1 node --test ...
//
// This is the Phase 0 oracle: any reimplementation (e.g. a C# port) of the reducer
// can be verified by feeding it the same frames.json and asserting the same snapshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyBoardSseFrame, createEmptyBoardSnapshot } from '../src/lib/board-sse-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const FRAMES_PATH = path.join(FIXTURES_DIR, 'deterministic-smoke.frames.json');
const SNAPSHOT_PATH = path.join(FIXTURES_DIR, 'deterministic-smoke.snapshot.json');
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

function loadFrames() {
  return JSON.parse(fs.readFileSync(FRAMES_PATH, 'utf8'));
}

function replay(frames, boardId) {
  let snapshot = createEmptyBoardSnapshot(boardId);
  for (const frame of frames) {
    snapshot = applyBoardSseFrame(snapshot, frame);
  }
  return snapshot;
}

// Stable key ordering so deep comparison and serialized golden output are canonical.
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonical(value[key]);
    }
    return out;
  }
  return value;
}

// Which independent state-keys a frame touches. Frames touching disjoint key-sets
// commute; `status` (full-board cumulative) and the bootstrap frame are barriers
// that must never be reordered.
function touchKeys(frame) {
  const keys = new Set();
  if (Array.isArray(frame?.cardDefinitions)) {
    keys.add('__bootstrap__');
  }
  for (const notification of frame?.notifications ?? []) {
    if (notification?.kind === 'status') {
      keys.add('__status__');
    } else if (notification?.kind === 'data_object') {
      keys.add(`obj:${notification.key}`);
    } else if (notification?.cardId) {
      keys.add(`card:${notification.cardId}`);
    } else {
      keys.add('__unknown__');
    }
  }
  return keys;
}

function isMovable(frame) {
  const keys = touchKeys(frame);
  return !keys.has('__status__') && !keys.has('__bootstrap__') && !keys.has('__unknown__');
}

function disjoint(a, b) {
  for (const value of a) {
    if (b.has(value)) return false;
  }
  return true;
}

const frames = loadFrames();
const boardId = frames[0]?.boardId ?? null;

test('golden: deterministic smoke frames reduce to the frozen snapshot', () => {
  const snapshot = canonical(replay(frames, boardId));

  if (UPDATE_GOLDEN || !fs.existsSync(SNAPSHOT_PATH)) {
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`[golden] wrote snapshot fixture -> ${SNAPSHOT_PATH}`);
  }

  const expected = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  assert.deepEqual(snapshot, expected);
});

test('replay is deterministic: identical frames yield an identical snapshot', () => {
  const a = canonical(replay(frames, boardId));
  const b = canonical(replay(frames, boardId));
  assert.deepEqual(a, b);
});

test('order-invariance: swapping independent adjacent frames converges to the same snapshot', () => {
  const reordered = frames.slice();
  let swaps = 0;
  for (let i = 0; i + 1 < reordered.length; i += 1) {
    const a = reordered[i];
    const b = reordered[i + 1];
    if (isMovable(a) && isMovable(b) && disjoint(touchKeys(a), touchKeys(b))) {
      reordered[i] = b;
      reordered[i + 1] = a;
      swaps += 1;
      i += 1; // don't re-touch the just-swapped pair
    }
  }

  // Each swap is between provably-independent frames, so the converged snapshot
  // must be unchanged. (If swaps === 0 the assertion still holds trivially.)
  const original = canonical(replay(frames, boardId));
  const permuted = canonical(replay(reordered, boardId));
  assert.deepEqual(permuted, original);
  assert.ok(swaps > 0, `expected at least one independent adjacent swap, got ${swaps}`);
});
