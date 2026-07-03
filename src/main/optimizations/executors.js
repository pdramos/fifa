'use strict';

/**
 * Generic, data-driven executors. Every optimization in the catalog declares a
 * `type`; the matching executor knows how to read its current status, apply it
 * (returning a backup payload), and revert it from that payload.
 *
 * This keeps the catalog purely declarative and guarantees that EVERY change is
 * reversible: an optimization that cannot describe how to undo itself cannot be
 * expressed here.
 *
 * SAFE-ONLY: registry values, power plans, Windows services, scheduled tasks,
 * user-owned config files, cache folders, and priority of a running process.
 * No memory access, no injection, no drivers, no anti-cheat interaction.
 */

const fs = require('fs');
const path = require('path');
const { regRead, regWrite, regDelete, run, powershell, IS_WINDOWS } = require('../core/winexec');
const backupManager = require('../core/backupManager');
const logger = require('../core/logger');

const ULTIMATE_PERF_TEMPLATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';

/* --------------------------------------------------------------- registry */

/**
 * `reg query` reports DWORD/QWORD values in hex (e.g. "0x1"), while the
 * catalog declares `applyData` in decimal (e.g. "1"). Compare both as
 * numbers for numeric types so this doesn't perpetually read as "not
 * applied" even right after a successful write.
 */
function normalizeRegValue(type, raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (type === 'REG_DWORD' || type === 'REG_QWORD') {
    const n = /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
    return Number.isNaN(n) ? s.toLowerCase() : n;
  }
  return s.toLowerCase();
}

function regValuesEqual(type, a, b) {
  return normalizeRegValue(type, a) === normalizeRegValue(type, b);
}

const registryExec = {
  /**
   * Normalize an optimization to a list of registry writes. Supports both the
   * single-value form (opt.key/valueName/valueType/applyData) and a multi-value
   * form (opt.values = [{ key?, valueName, valueType, applyData }]) so one
   * logical tweak can flip several related values atomically — still fully
   * reversible, since each prior value is snapshotted.
   */
  _pairs(opt) {
    if (Array.isArray(opt.values) && opt.values.length) {
      return opt.values.map((v) => ({
        key: v.key || opt.key,
        valueName: v.valueName,
        valueType: v.valueType,
        applyData: v.applyData,
      }));
    }
    return [
      { key: opt.key, valueName: opt.valueName, valueType: opt.valueType, applyData: opt.applyData },
    ];
  },
  async status(opt) {
    const pairs = this._pairs(opt);
    const current = {};
    let applied = true;
    for (const p of pairs) {
      const cur = await regRead(p.key, p.valueName);
      if (!(cur.exists && regValuesEqual(p.valueType, cur.value, p.applyData))) applied = false;
      current[p.valueName] = cur.exists ? cur.value : null;
    }
    return { applied, current: pairs.length === 1 ? current[pairs[0].valueName] : current };
  },
  async apply(opt) {
    const pairs = this._pairs(opt);
    const entries = [];
    for (const p of pairs) {
      const prev = await regRead(p.key, p.valueName);
      const res = await regWrite(p.key, p.valueName, p.valueType, p.applyData);
      if (!res.ok && !res.skipped) throw new Error(`reg write failed: ${res.stderr || res.code}`);
      entries.push({
        key: p.key,
        valueName: p.valueName,
        existed: prev.exists,
        type: prev.type || p.valueType,
        value: prev.exists ? prev.value : null,
      });
    }
    return { multi: true, entries };
  },
  async revert(opt, backup) {
    if (!backup) return;
    // New multi-value backup shape.
    if (Array.isArray(backup.entries)) {
      for (const b of backup.entries) {
        if (b.existed) await regWrite(b.key, b.valueName, b.type || 'REG_SZ', b.value);
        else await regDelete(b.key, b.valueName);
      }
      return;
    }
    // Legacy single-value backup shape (state saved by older versions).
    if (backup.existed) {
      await regWrite(opt.key, opt.valueName, backup.type || opt.valueType, backup.value);
    } else {
      await regDelete(opt.key, opt.valueName);
    }
  },
};

/* ------------------------------------------------------------- power plan */

const powerPlanExec = {
  async _activeGuid() {
    const res = await powershell('powercfg /getactivescheme');
    const m = res.stdout && res.stdout.match(/([0-9a-fA-F-]{36})/);
    return m ? m[1] : null;
  },
  async status() {
    const res = await run('powercfg', ['/list']);
    const active = await this._activeGuid();
    const hasUltimate = /Ultimate Performance|Desempenho m[aá]ximo/i.test(res.stdout || '');
    // Consider applied only if an Ultimate-Performance-type plan is active.
    let applied = false;
    if (active) {
      const line = (res.stdout || '')
        .split(/\r?\n/)
        .find((l) => l.includes(active));
      applied = Boolean(line && /Ultimate Performance|Desempenho m[aá]ximo|High performance|Alto desempenho/i.test(line));
    }
    return { applied, current: active, hasUltimate };
  },
  async apply() {
    const prev = await this._activeGuid();
    // Create the Ultimate Performance plan (idempotent) and activate it.
    const dup = await run('powercfg', ['-duplicatescheme', ULTIMATE_PERF_TEMPLATE]);
    let newGuid = null;
    if (dup.ok) {
      const m = dup.stdout.match(/([0-9a-fA-F-]{36})/);
      newGuid = m ? m[1] : null;
    }
    if (!newGuid) newGuid = ULTIMATE_PERF_TEMPLATE;
    const act = await run('powercfg', ['/setactive', newGuid]);
    if (!act.ok && !act.skipped) {
      // Fall back to built-in High Performance plan GUID.
      await run('powercfg', ['/setactive', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c']);
    }
    return { previousGuid: prev, createdGuid: newGuid };
  },
  async revert(opt, backup) {
    if (backup && backup.previousGuid) {
      await run('powercfg', ['/setactive', backup.previousGuid]);
    }
  },
};

/* --------------------------------------------------------------- service */

const serviceExec = {
  _mapStart(word) {
    return { boot: 'boot', system: 'system', auto: 'auto', demand: 'demand', disabled: 'disabled' }[word] || word;
  },
  async status(opt) {
    const res = await run('sc', ['qc', opt.serviceName]);
    if (!res.ok) return { applied: false, current: 'not-found' };
    const m = res.stdout.match(/START_TYPE\s+:\s+\d+\s+(\w+)/);
    const cur = m ? m[1].toLowerCase() : 'unknown';
    const target = opt.targetStart.toLowerCase();
    const applied =
      (target === 'disabled' && cur.includes('disabled')) ||
      (target === 'demand' && (cur.includes('demand') || cur.includes('manual'))) ||
      cur.includes(target);
    return { applied, current: cur };
  },
  async apply(opt) {
    const before = await this.status(opt);
    const res = await run('sc', ['config', opt.serviceName, 'start=', this._mapStart(opt.targetStart)]);
    if (!res.ok && !res.skipped) throw new Error(`sc config failed: ${res.stderr || res.code}`);
    if (opt.stopNow) await run('sc', ['stop', opt.serviceName]);
    return { previousStart: before.current };
  },
  async revert(opt, backup) {
    const prev = backup && backup.previousStart ? backup.previousStart : 'auto';
    const norm = prev.includes('disabled')
      ? 'disabled'
      : prev.includes('demand') || prev.includes('manual')
      ? 'demand'
      : prev.includes('auto')
      ? 'auto'
      : 'demand';
    await run('sc', ['config', opt.serviceName, 'start=', norm]);
  },
};

/* --------------------------------------------------------------- command */

const commandExec = {
  async status(opt) {
    if (!opt.statusCmd) return { applied: false, current: 'action', stateless: true };
    const res = await run(opt.statusCmd.cmd, opt.statusCmd.args);
    const applied = opt.statusMatch ? new RegExp(opt.statusMatch, 'i').test(res.stdout) : res.ok;
    return { applied, current: res.ok ? 'ok' : 'no' };
  },
  async apply(opt) {
    const res = await run(opt.applyCmd.cmd, opt.applyCmd.args);
    if (!res.ok && !res.skipped) throw new Error(`command failed: ${res.stderr || res.code}`);
    return { ran: true };
  },
  async revert(opt) {
    if (opt.revertCmd) await run(opt.revertCmd.cmd, opt.revertCmd.args);
  },
};

/* ------------------------------------------------------------- gameconfig */

/**
 * Edits the game's OWN settings file (something the game itself writes and the
 * player is free to change). Line format supported: `KEY VALUE` or `KEY=VALUE`.
 * The whole original file is backed up before editing so revert is a byte-exact
 * restore.
 */
const gameConfigExec = {
  /**
   * `opt.file` may be a single name or a list of candidates (FC 26 ships the
   * file as "fcsetup.ini"; Windows hides the extension, so guides often call
   * it just "fcsetup"). The first candidate that exists on disk wins.
   */
  _resolveFile(opt, ctx) {
    if (!ctx.game || !ctx.game.settingsDir) return null;
    const names = Array.isArray(opt.file) ? opt.file : [opt.file];
    for (const name of names) {
      const p = path.join(ctx.game.settingsDir, name);
      if (fs.existsSync(p)) return p;
    }
    return null;
  },
  _read(file) {
    return fs.readFileSync(file, 'utf8');
  },
  /**
   * The community "read-only trick" marks fcsetup.ini read-only so the game
   * can't rewrite it on launch. Our own edits must still work in that state,
   * so writes temporarily lift the attribute and put it back afterwards. On
   * Windows, chmod maps the write bit onto the READONLY file attribute.
   */
  _withWritable(file, fn) {
    let wasReadOnly = false;
    try {
      wasReadOnly = (fs.statSync(file).mode & 0o200) === 0;
    } catch (_) {
      /* stat failed — let fn surface the real error */
    }
    if (wasReadOnly) fs.chmodSync(file, 0o666);
    try {
      return fn();
    } finally {
      if (wasReadOnly) {
        try {
          fs.chmodSync(file, 0o444);
        } catch (_) {
          /* best effort */
        }
      }
    }
  },
  _setKey(text, key, value, addIfMissing) {
    const lines = text.split(/\r?\n/);
    let found = false;
    const eq = text.includes(`${key}=`);
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(`^(\\s*${key})(\\s*=\\s*|\\s+)(.*)$`, 'i');
      if (re.test(lines[i])) {
        lines[i] = lines[i].replace(re, `$1$2${value}`);
        found = true;
        break;
      }
    }
    // SAFETY: by default we only flip keys the game already wrote. We never
    // invent unknown keys, so an unexpected config format can't be corrupted.
    if (!found && addIfMissing) lines.push(eq ? `${key}=${value}` : `${key} ${value}`);
    return lines.join('\n');
  },
  _getKey(text, key) {
    const m = text.match(new RegExp(`^\\s*${key}\\s*(?:=\\s*|\\s+)(.+)$`, 'im'));
    return m ? m[1].trim() : null;
  },
  async status(opt, ctx) {
    const file = this._resolveFile(opt, ctx);
    if (!file) return { applied: false, current: 'no-file' };
    const text = this._read(file);
    // Only keys that exist in the file count towards "applied" when the entry
    // refuses to invent keys (addIfMissing: false) — otherwise a build whose
    // config lacks an optional key would read as perpetually "not applied".
    const entries = Object.entries(opt.settings).filter(
      ([k]) => opt.addIfMissing || this._getKey(text, k) !== null
    );
    if (!entries.length) return { applied: false, current: 'no-keys' };
    const applied = entries.every(
      ([k, v]) => String(this._getKey(text, k)).toLowerCase() === String(v).toLowerCase()
    );
    return { applied, current: file };
  },
  async apply(opt, ctx) {
    const file = this._resolveFile(opt, ctx);
    if (!file) {
      throw new Error('Ficheiro de configuração do jogo não encontrado.');
    }
    const backupPath = backupManager.snapshotFile(file);
    let text = this._read(file);
    for (const [k, v] of Object.entries(opt.settings)) {
      text = this._setKey(text, k, v, opt.addIfMissing);
    }
    this._withWritable(file, () => fs.writeFileSync(file, text));
    return { backupPath, file };
  },
  async revert(opt, backup) {
    if (backup && backup.backupPath && backup.file) {
      this._withWritable(backup.file, () =>
        backupManager.restoreFile(backup.backupPath, backup.file)
      );
    }
  },
};

/* --------------------------------------------------------------- cleanup */

/**
 * Deletes regenerable cache content (shader caches, temp files). This is an
 * ACTION, not a stateful tweak — nothing to revert, and the caches rebuild
 * automatically. We still report how much was cleared.
 */
const cleanupExec = {
  _expand(p, ctx) {
    return p
      .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || '')
      .replace(/%APPDATA%/gi, process.env.APPDATA || '')
      .replace(/%TEMP%/gi, process.env.TEMP || '')
      .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || '')
      .replace(/%GAMEDIR%/gi, (ctx.game && ctx.game.installDir) || '');
  },
  async status() {
    return { applied: false, current: 'action', stateless: true };
  },
  async apply(opt, ctx) {
    let cleared = 0;
    for (const raw of opt.targets) {
      const target = this._expand(raw, ctx);
      if (!target) continue;
      try {
        if (!fs.existsSync(target)) continue;
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          for (const entry of fs.readdirSync(target)) {
            const full = path.join(target, entry);
            try {
              const s = fs.statSync(full);
              cleared += s.isDirectory() ? dirSize(full) : s.size;
              fs.rmSync(full, { recursive: true, force: true });
            } catch (_) {
              /* file locked/in use — skip */
            }
          }
        }
      } catch (e) {
        logger.warn(`Cleanup skip ${target}: ${e.message}`);
      }
    }
    return { clearedBytes: cleared };
  },
  async revert() {
    /* caches are regenerable — nothing to undo */
  },
};

function dirSize(dir) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir)) {
      const full = path.join(dir, e);
      const s = fs.statSync(full);
      total += s.isDirectory() ? dirSize(full) : s.size;
    }
  } catch (_) {
    /* ignore */
  }
  return total;
}

const EXECUTORS = {
  registry: registryExec,
  powerplan: powerPlanExec,
  service: serviceExec,
  command: commandExec,
  gameconfig: gameConfigExec,
  cleanup: cleanupExec,
};

function getExecutor(type) {
  const ex = EXECUTORS[type];
  if (!ex) throw new Error(`Unknown optimization type: ${type}`);
  return ex;
}

module.exports = { getExecutor, EXECUTORS };
