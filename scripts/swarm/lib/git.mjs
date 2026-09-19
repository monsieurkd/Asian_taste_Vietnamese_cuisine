// Git operations, and the reason they live in the driver rather than in an agent.
//
// Merging to main here triggers a real deploy: CI -> flyctl deploy -> smoke test ->
// Vercel. That is an irreversible, externally visible action, and the rule the
// swarm follows is that irreversible actions are executed by code with a fixed
// shape, never by a model reading a diff and deciding. `swarm-merger` returns a
// verdict; this module is what acts on it, and only when `--merge` was passed.
//
// Nothing in here force-pushes, resets --hard, or rewrites history. The project's
// `reasonix.toml` denies those outright, and a driver that tried would be relying
// on a safety net rather than being safe.

import { sh, shOk, log } from './exec.mjs';

export async function currentBranch(repoRoot) {
  const r = await sh('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, silent: true });
  return r.out.trim();
}

export async function headSha(repoRoot) {
  const r = await sh('git rev-parse HEAD', { cwd: repoRoot, silent: true });
  return r.out.trim();
}

export async function isClean(repoRoot) {
  const r = await sh('git status --porcelain', { cwd: repoRoot, silent: true });
  return r.out.trim() === '';
}

export async function dirtyFiles(repoRoot) {
  const r = await sh('git status --porcelain', { cwd: repoRoot, silent: true });
  return r.out.split('\n').map((s) => s.trim()).filter(Boolean);
}

export async function baseShaOf(repoRoot, baseBranch) {
  const r = await sh(`git rev-parse ${baseBranch}`, { cwd: repoRoot, silent: true });
  return r.code === 0 ? r.out.trim() : null;
}

export async function branchExists(repoRoot, branch) {
  const r = await sh(`git rev-parse --verify --quiet refs/heads/${branch}`, {
    cwd: repoRoot,
    silent: true,
  });
  return r.code === 0;
}

export async function createBranch(repoRoot, branch, fromBranch) {
  await shOk(`git checkout -B '${branch}' '${fromBranch}'`, { cwd: repoRoot });
  return headSha(repoRoot);
}

export async function checkout(repoRoot, ref) {
  await shOk(`git checkout '${ref}'`, { cwd: repoRoot });
}

/** Stage everything in the working tree and commit. No-op when nothing changed. */
export async function commitAll(repoRoot, message) {
  const dirty = await dirtyFiles(repoRoot);
  if (dirty.length === 0) return { committed: false, sha: await headSha(repoRoot) };

  await shOk('git add -A', { cwd: repoRoot });
  // Pass the message via a file so multi-line bodies survive intact.
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const msgFile = '.swarm-commit-msg';
  writeFileSync(`${repoRoot}/${msgFile}`, message);
  try {
    await shOk(`git commit -F '${msgFile}'`, { cwd: repoRoot });
  } finally {
    try {
      unlinkSync(`${repoRoot}/${msgFile}`);
    } catch {
      /* already gone */
    }
  }
  return { committed: true, sha: await headSha(repoRoot) };
}

export async function mergeNoFf(repoRoot, branch, message) {
  const r = await sh(`git merge --no-ff --no-edit -m ${JSON.stringify(message)} '${branch}'`, {
    cwd: repoRoot,
  });
  return { ok: r.code === 0, code: r.code, output: r.combined ?? '' };
}

export async function push(repoRoot, ref) {
  const r = await sh(`git push origin '${ref}'`, { cwd: repoRoot, timeoutMs: 5 * 60 * 1000 });
  return { ok: r.code === 0, output: r.combined ?? '' };
}

export async function logOneline(repoRoot, from, to = 'HEAD') {
  const r = await sh(`git log --oneline ${from}..${to}`, { cwd: repoRoot, silent: true });
  return r.code === 0 ? r.out.trim() : '';
}

/**
 * Hard-ish rollback used by the halt path: undo the merge commit on main by
 * reverting it (never by resetting), then push. A revert is safe to run against a
 * shared branch; a reset is not, and the deny rules would block it anyway.
 */
export async function revertMerge(repoRoot, sha) {
  const r = await sh(`git revert -m 1 --no-edit ${sha}`, { cwd: repoRoot });
  if (r.code !== 0) return { ok: false, output: r.combined ?? '' };
  const p = await push(repoRoot, 'HEAD:main');
  return { ok: p.ok, output: p.output };
}

export function describeRepoState() {
  return async (repoRoot) => ({
    branch: await currentBranch(repoRoot),
    sha: await headSha(repoRoot),
    clean: await isClean(repoRoot),
  });
}

export { log };
