'use strict';

/**
 * Thin, safe wrapper around Windows command-line utilities.
 *
 * SAFETY MODEL — read before extending:
 *   Everything here operates ONLY on:
 *     - the Windows Registry (via `reg`)
 *     - power plans (via `powercfg`)
 *     - services / scheduled tasks (via `sc` / `schtasks`)
 *     - process priority of an ALREADY-RUNNING game (via `wmic`/PowerShell)
 *     - files the user owns (game config, caches)
 *
 *   It NEVER reads or writes the memory of the game process, never injects
 *   code/DLLs, never installs drivers, never hooks APIs, and never touches
 *   the EA Anti-Cheat. Those are exactly the techniques that get accounts
 *   banned, so they are intentionally impossible to express with this module.
 */

const { execFile } = require('child_process');
const logger = require('./logger');

const IS_WINDOWS = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    if (!IS_WINDOWS && !opts.allowNonWindows) {
      // In dev on non-Windows we short-circuit so the UI still works.
      logger.warn(`Skipped (not Windows): ${cmd} ${args.join(' ')}`);
      resolve({ ok: false, code: -1, stdout: '', stderr: 'not-windows', skipped: true });
      return;
    }
    execFile(
      cmd,
      args,
      { windowsHide: true, timeout: opts.timeout || 30000, maxBuffer: 1024 * 1024 * 8 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err ? (err.code == null ? -1 : err.code) : 0,
          stdout: (stdout || '').toString(),
          stderr: (stderr || '').toString(),
        });
      }
    );
  });
}

/** Run a PowerShell snippet and return stdout. */
function powershell(script, opts = {}) {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    opts
  );
}

/* ---------------------------------------------------------------- Registry */

const REG_TYPES = new Set(['REG_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_EXPAND_SZ', 'REG_MULTI_SZ', 'REG_BINARY']);

/**
 * Read a single registry value.
 * Returns { exists, type, value } — value is a string as reported by `reg`.
 */
async function regRead(keyPath, valueName) {
  const res = await run('reg', ['query', keyPath, '/v', valueName]);
  if (!res.ok) return { exists: false, type: null, value: null };
  // Output line looks like:  "    ValueName    REG_DWORD    0x1"
  const re = new RegExp(
    `\\s+${escapeRegExp(valueName)}\\s+(REG_\\w+)\\s+(.*)`,
    'i'
  );
  const line = res.stdout.split(/\r?\n/).find((l) => re.test(l));
  if (!line) return { exists: false, type: null, value: null };
  const m = line.match(re);
  return { exists: true, type: m[1], value: m[2].trim() };
}

/** Write a registry value. */
async function regWrite(keyPath, valueName, type, data) {
  if (!REG_TYPES.has(type)) throw new Error(`Unsupported registry type: ${type}`);
  const args = ['add', keyPath, '/v', valueName, '/t', type, '/d', String(data), '/f'];
  return run('reg', args);
}

/** Delete a registry value. */
async function regDelete(keyPath, valueName) {
  return run('reg', ['delete', keyPath, '/v', valueName, '/f']);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  IS_WINDOWS,
  run,
  powershell,
  regRead,
  regWrite,
  regDelete,
};
