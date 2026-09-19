// Durable run state.
//
// The whole point of persisting this is resumability: a 40-minute swarm run that
// dies at chunk 6 of 8 must not restart from nothing, because the expensive part
// is the model work, not the bookkeeping. `run.mjs --resume` reads this file and
// continues from the first chunk that is not terminal.
//
// It is also the audit trail. After an autonomous merge to main, "what did it
// actually do and on what evidence" has to be answerable from disk without
// trusting the model's own summary — so chunk results, verdicts and commits are
// all recorded here as raw values, not as prose.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const TERMINAL = new Set(['merged', 'abandoned', 'halted', 'blocked-permanent']);

export function loadState(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`run state at ${path} is corrupt (${e.message}); refusing to resume from it`);
  }
}

export function newState({ goal, mode, branch, baseBranch, maxChunks, attemptBudget }) {
  return {
    version: 1,
    goal,
    mode,
    branch,
    baseBranch,
    maxChunks,
    attemptBudget,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: 'preflight',
    baseSha: null,
    plan: null,
    chunks: {},
    attempts: [],
    integration: null,
    verdict: null,
    merge: null,
    deploy: null,
    halted: null,
    status: 'running',
  };
}

export function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  state.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

/** Chunks that still need work, in plan order, tolerating a missing plan. */
export function pendingChunks(state) {
  if (!state.plan?.chunks) return [];
  return state.plan.chunks.filter((c) => !TERMINAL.has(state.chunks[c.id]?.status));
}

export function recordAttempt(state, entry) {
  state.attempts.push({ at: new Date().toISOString(), ...entry });
}

export function attemptCountFor(state, chunkId) {
  return state.attempts.filter((a) => a.chunk === chunkId && a.kind === 'chunk').length;
}

export function setChunk(state, chunkId, patch) {
  state.chunks[chunkId] = { ...(state.chunks[chunkId] || {}), ...patch };
}

export function isStale(state, stepIds) {
  // Resuming across a plan change: a recorded chunk result is only trustworthy if
  // the chunk still exists in the current plan with the same role.
  if (!state.plan?.chunks) return true;
  const byId = new Map(state.plan.chunks.map((c) => [c.id, c]));
  return stepIds.some((id) => {
    const rec = state.chunks[id];
    if (!rec || !TERMINAL.has(rec.status)) return false;
    const planned = byId.get(id);
    return !planned || planned.role !== rec.role;
  });
}
