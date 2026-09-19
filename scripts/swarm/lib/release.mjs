// Making an autonomous merge to production survivable.
//
// Merging to main does not just "land code" in this project — `deploy.yml` waits
// for CI on the commit, deploys the API to Fly, runs the smoke test, and waits for
// Vercel to report READY for the frontend. So a merge is a real production
// release, and the swarm owes two things afterwards:
//
//  1. Watch the release to completion, so the run report says what actually
//     happened rather than what was requested.
//  2. Be able to undo it. If the smoke test fails, or the API never comes healthy,
//     the merge is reverted — unattended, before a customer notices.
//
// The rollback is a `git revert` of the merge commit, which re-runs the pipeline
// on the reverted state. It is not instant, and that limit is real: this module
// can shorten the window, not eliminate it. It is written down here rather than
// implied, because the alternative — claiming "auto-rollback" without the caveat —
// is how a team ends up trusting a mechanism it has never tested.

import { sh, log, truncate } from './exec.mjs';

export async function hasGh(repoRoot) {
  const r = await sh('command -v gh && gh auth status', { cwd: repoRoot, silent: true, timeoutMs: 30000 });
  return r.code === 0;
}

async function ciStatusFor(repoRoot, sha) {
  const r = await sh(
    `gh run list --workflow=ci.yml --commit '${sha}' --limit 1 --json status,conclusion,databaseId,url`,
    { cwd: repoRoot, silent: true, timeoutMs: 60000 },
  );
  if (r.code !== 0) return { error: r.combined };
  try {
    const arr = JSON.parse(r.out);
    if (!arr.length) return { state: 'not-started' };
    return {
      state: arr[0].status,
      conclusion: arr[0].conclusion,
      runId: arr[0].databaseId,
      url: arr[0].url,
    };
  } catch (e) {
    return { error: `unparseable gh output: ${e.message}` };
  }
}

export async function watchCi(repoRoot, sha, { timeoutMs = 45 * 60 * 1000, intervalMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const s = await ciStatusFor(repoRoot, sha);
    if (s.error) {
      log.warn(`CI status query failed: ${truncate(s.error, 300)}`);
      return { ok: false, state: 'unknown', output: s.error };
    }
    const now = `${s.state}/${s.conclusion ?? ''}`;
    if (now !== last) {
      log.info(`· CI on ${sha.slice(0, 8)}: ${now}`);
      last = now;
    }
    if (s.state === 'completed') {
      const ok = s.conclusion === 'success';
      return { ok, ...s };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, state: 'timeout', output: `CI did not complete within ${timeoutMs / 60000} min` };
}

export async function watchDeploy(repoRoot, sha, { timeoutMs = 30 * 60 * 1000, intervalMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await sh(
      `gh run list --workflow=deploy.yml --commit '${sha}' --limit 1 --json status,conclusion,databaseId,url`,
      { cwd: repoRoot, silent: true, timeoutMs: 60000 },
    );
    if (r.code === 0) {
      try {
        const arr = JSON.parse(r.out);
        if (arr.length && arr[0].status === 'completed') {
          return {
            ok: arr[0].conclusion === 'success',
            state: arr[0].status,
            conclusion: arr[0].conclusion,
            url: arr[0].url,
          };
        }
      } catch {
        /* keep polling */
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, state: 'timeout', output: 'deploy workflow did not complete in time' };
}

/**
 * The independent health check. Deliberately NOT the CI smoke test: this asks
 * production itself whether it is healthy, after the pipeline says it is, because
 * "the deploy job passed" and "the site works" are different claims.
 */
export async function healthCheck(repoRoot) {
  const r = await sh('./scripts/check-deployment-health.sh', {
    cwd: repoRoot,
    timeoutMs: 5 * 60 * 1000,
  });
  return { ok: r.code === 0, output: truncate(r.combined ?? '', 8000) };
}

export async function canWatch() {
  return hasGh(process.cwd());
}
