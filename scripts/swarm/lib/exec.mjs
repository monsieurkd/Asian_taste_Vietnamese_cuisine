// Shared helpers for the swarm driver: small shell runner and logging.
//
// Every external command in the swarm goes through `sh()`. That is deliberate:
// it fixes one place for timeouts, for truncation, and for recording what was
// actually run. A driver that logs "CI green" without the command and its exit
// code behind it is a driver that cannot be audited afterwards — and an
// autonomous run that merges to main is exactly the thing that must be auditable.

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const TRUNCATE_AT = 8000;

export const log = {
  _stream(path) {
    if (!path) return null;
    mkdirSync(dirname(path), { recursive: true });
    try {
      return path;
    } catch {
      return null;
    }
  },
  setLogFile(path) {
    log.file = log._stream(path);
  },
  _write(line) {
    process.stdout.write(line + '\n');
    if (log.file) {
      try {
        appendFileSync(log.file, line + '\n');
      } catch {
        /* logging must never break the run */
      }
    }
  },
  info(msg) {
    log._write(msg);
  },
  step(msg) {
    log._write(`\n${'━'.repeat(72)}\n▸ ${msg}\n${'━'.repeat(72)}`);
  },
  warn(msg) {
    log._write(`⚠️  ${msg}`);
  },
  error(msg) {
    log._write(`✖  ${msg}`);
  },
  ok(msg) {
    log._write(`✔  ${msg}`);
  },
};

export function truncate(text, limit = TRUNCATE_AT) {
  const t = String(text ?? '');
  if (t.length <= limit) return t;
  const head = t.slice(0, Math.floor(limit * 0.6));
  const tail = t.slice(-Math.floor(limit * 0.4));
  return `${head}\n… [${t.length - limit} chars elided] …\n${tail}`;
}

/**
 * Run a shell command. Never throws for a non-zero exit — returns the code, so
 * the caller decides whether that matters. A driver that throws on every failing
 * command cannot implement "try, then re-plan".
 *
 * opts: { cwd, timeoutMs, env, input, silent }
 */
export function sh(cmd, opts = {}) {
  const { cwd, timeoutMs = 20 * 60 * 1000, env, input, silent = false } = opts;
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', cmd], {
      cwd,
      env: { ...process.env, ...(env || {}) },
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      out += d.toString();
      if (!silent) process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
      if (!silent) process.stderr.write(d);
    });

    if (input !== undefined) {
      child.stdin.end(input);
    }

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 127, out, err: err + String(e), timedOut: false });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : (code ?? 1),
        out,
        err,
        timedOut,
        combined: out + err,
      });
    });
  });
}

/** Run and throw if it fails. For commands where failure must abort the run. */
export async function shOk(cmd, opts = {}) {
  const r = await sh(cmd, opts);
  if (r.code !== 0) {
    throw new Error(
      `command failed (exit ${r.code}): ${cmd}\n${truncate(r.combined ?? r.err)}`,
    );
  }
  return r;
}
