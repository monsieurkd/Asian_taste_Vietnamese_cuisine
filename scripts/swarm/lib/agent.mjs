// The bridge to the agent roles.
//
// Each role is a skill under .reasonix/skills/<name>/SKILL.md, which Reasonix
// exposes as `reasonix subagent run <name> <task>`. That indirection is the whole
// reason this driver can be small: the agents' behaviour lives in reviewable
// markdown, and the driver only sequences them.
//
// Two things here are load-bearing:
//
//  1. The prompt is passed on **stdin**, because chunk intents and acceptance
//     criteria contain quotes, backticks and newlines that would otherwise need
//     shell escaping — and a mis-escaped criterion is a silently wrong task.
//  2. Roles must return machine-readable JSON, and models wrap that JSON in prose
//     and fences. `extractJson` digs it out by brace balance rather than trusting
//     the first or last code fence, because a role that quotes a JSON example
//     (the PM does, in its own spec) would otherwise be parsed wrongly.

import { sh, log, truncate } from './exec.mjs';

const DEFAULT_TIMEOUT = 45 * 60 * 1000;

/**
 * Invoke a swarm role. Returns { ok, json, text, code }.
 * Never throws on a non-zero exit: a role that fails is data for the PM, not a
 * reason to kill the run.
 */
export async function runAgent({ role, task, repoRoot, model, maxSteps, timeoutMs, logFile }) {
  const args = ['reasonix', 'subagent', 'run', role];
  if (model) args.push('--model', model);
  if (maxSteps) args.push('--max-steps', String(maxSteps));
  const quoted = args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ');

  log.info(`\n── agent: ${role} ──${model ? ` (model ${model})` : ''}`);
  const started = Date.now();
  const r = await sh(quoted, {
    cwd: repoRoot,
    timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT,
    input: task,
  });
  const secs = Math.round((Date.now() - started) / 1000);
  const text = r.combined ?? `${r.out}${r.err}`;

  if (logFile) {
    try {
      const { appendFileSync, mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(logFile), { recursive: true });
      appendFileSync(
        logFile,
        `\n\n===== ${role} @ ${new Date().toISOString()} (exit ${r.code}, ${secs}s) =====\n${text}\n`,
      );
    } catch {
      /* never let logging break a run */
    }
  }

  if (r.timedOut) log.warn(`${role} timed out after ${secs}s`);
  else log.info(`── ${role} finished: exit ${r.code}, ${secs}s ──`);

  const json = extractJson(text);
  return { ok: r.code === 0 && !!json, code: r.code, json, text, timedOut: r.timedOut, secs };
}

/**
 * Pull the last balanced top-level JSON object out of a text blob.
 *
 * Scans for `{` at brace depth 0, tracks string/escape state so a `}` inside a
 * string does not close the object, and returns the LAST complete candidate.
 * Last, not first, because a role's reply often restates the schema before
 * emitting the real payload — and the real payload is what a driver should obey.
 */
export function extractJson(text) {
  const s = String(text ?? '');
  const candidates = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(s.slice(start, i + 1));
        start = -1;
      } else if (depth < 0) {
        depth = 0;
        start = -1;
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* not valid JSON on its own — keep looking further back */
    }
  }
  return null;
}

/** Compact rendering of a role's JSON for the next agent's prompt. */
export function jsonForPrompt(value, limit = 6000) {
  return truncate(JSON.stringify(value, null, 2), limit);
}
