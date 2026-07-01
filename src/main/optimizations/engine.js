'use strict';

/**
 * Optimization engine — orchestrates the catalog.
 *
 * Responsibilities:
 *   • materialize function-valued fields against the runtime context
 *   • decide which optimizations are applicable to this machine
 *   • report each optimization's current status
 *   • apply / revert single optimizations or whole profiles, recording the
 *     backup payload in the state store so everything is one-click reversible
 *   • emit progress events for the UI progress bar
 *
 * The engine owns NO Windows-specific logic itself — it only calls the safe
 * executors, which is what keeps the whole system reversible and ban-safe.
 */

const { catalog, manualRecommendations, CATEGORIES } = require('./catalog');
const { getExecutor } = require('./executors');
const stateStore = require('../core/stateStore');
const backupManager = require('../core/backupManager');
const logger = require('../core/logger');

class Engine {
  constructor() {
    this._context = { game: null, system: null };
    this._progressCb = null;
    this._byId = new Map(catalog.map((o) => [o.id, o]));
  }

  setContext(ctx) {
    this._context = { ...this._context, ...ctx };
  }

  onProgress(cb) {
    this._progressCb = cb;
  }

  _emitProgress(payload) {
    if (this._progressCb) {
      try {
        this._progressCb(payload);
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** Replace any function-valued field with its value for the current context. */
  _materialize(opt) {
    const ctx = this._context;
    const out = {};
    for (const [k, v] of Object.entries(opt)) {
      out[k] = typeof v === 'function' && k !== 'requires' ? v(ctx) : v;
    }
    return out;
  }

  _isApplicable(opt) {
    if (typeof opt.requires === 'function') {
      try {
        return Boolean(opt.requires(this._context));
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  getCategories() {
    return CATEGORIES;
  }

  getManualRecommendations() {
    const vendor = this._context.system && this._context.system.gpuVendor;
    return manualRecommendations.filter(
      (r) => !r.vendor || !vendor || vendor === 'unknown' || r.vendor === vendor
    );
  }

  /** List every optimization with metadata and applicability (no status I/O). */
  list() {
    return catalog.map((opt) => ({
      id: opt.id,
      name: opt.name,
      description: opt.description,
      category: opt.category,
      categoryLabel: CATEGORIES[opt.category] || opt.category,
      impact: opt.impact,
      default: Boolean(opt.default),
      caution: Boolean(opt.caution),
      reboot: Boolean(opt.reboot),
      needsAdmin: Boolean(opt.needsAdmin),
      stateless: ['cleanup', 'command'].includes(opt.type) && !opt.statusCmd,
      applicable: this._isApplicable(opt),
    }));
  }

  /** Read the live status of every applicable optimization. */
  async status() {
    const results = [];
    for (const opt of catalog) {
      if (!this._isApplicable(opt)) {
        results.push({ id: opt.id, applicable: false, applied: false });
        continue;
      }
      const m = this._materialize(opt);
      try {
        const ex = getExecutor(opt.type);
        const st = await ex.status(m, this._context);
        results.push({
          id: opt.id,
          applicable: true,
          applied: st.applied,
          current: st.current,
          stateless: Boolean(st.stateless),
          // A stateful tweak is "applied" if the store says so OR the live
          // system already matches the desired value.
          recorded: stateStore.isApplied(opt.id),
        });
      } catch (e) {
        results.push({ id: opt.id, applicable: true, applied: false, error: e.message });
      }
    }
    return results;
  }

  async applyOne(id) {
    const opt = this._byId.get(id);
    if (!opt) throw new Error(`Optimização desconhecida: ${id}`);
    if (!this._isApplicable(opt)) {
      logger.warn(`Ignorada (não aplicável a este sistema): ${opt.name}`);
      return { id, skipped: true, reason: 'not-applicable' };
    }
    const m = this._materialize(opt);
    const ex = getExecutor(opt.type);
    logger.info(`A aplicar: ${opt.name}`);
    const backup = await ex.apply(m, this._context);
    // Stateless actions (cleanup/command without status) aren't tracked as
    // reversible state, but everything else is.
    if (!['cleanup'].includes(opt.type) && !(opt.type === 'command' && !opt.revertCmd)) {
      stateStore.markApplied(id, backup || {});
    }
    logger.success(`Aplicado: ${opt.name}`);
    return { id, applied: true, backup };
  }

  async revertOne(id) {
    const opt = this._byId.get(id);
    if (!opt) throw new Error(`Optimização desconhecida: ${id}`);
    const m = this._materialize(opt);
    const ex = getExecutor(opt.type);
    const backup = stateStore.getBackup(id);
    logger.info(`A reverter: ${opt.name}`);
    await ex.revert(m, backup, this._context);
    stateStore.markReverted(id);
    logger.success(`Revertido: ${opt.name}`);
    return { id, reverted: true };
  }

  /**
   * Apply a set of optimization ids, emitting progress. Creates a restore
   * point first so the whole batch can be undone in one click.
   */
  async applyMany(ids, { label } = {}) {
    backupManager.createRestorePoint(label || 'Antes de otimizar', this._context.system);
    const total = ids.length;
    let done = 0;
    const outcomes = [];
    this._emitProgress({ phase: 'start', total, done: 0, current: null });
    for (const id of ids) {
      const opt = this._byId.get(id);
      this._emitProgress({
        phase: 'apply',
        total,
        done,
        current: opt ? opt.name : id,
      });
      try {
        outcomes.push(await this.applyOne(id));
      } catch (e) {
        logger.error(`Falha ao aplicar ${id}: ${e.message}`);
        outcomes.push({ id, error: e.message });
      }
      done += 1;
      this._emitProgress({ phase: 'apply', total, done, current: opt ? opt.name : id });
    }
    this._emitProgress({ phase: 'done', total, done, current: null });
    const rebootNeeded = ids.some((id) => this._byId.get(id) && this._byId.get(id).reboot);
    return { outcomes, rebootNeeded };
  }

  /** Revert every currently-applied optimization. */
  async revertAll() {
    const ids = stateStore.appliedIds();
    const total = ids.length;
    let done = 0;
    this._emitProgress({ phase: 'start', total, done: 0, current: null });
    for (const id of ids) {
      const opt = this._byId.get(id);
      this._emitProgress({ phase: 'revert', total, done, current: opt ? opt.name : id });
      try {
        await this.revertOne(id);
      } catch (e) {
        logger.error(`Falha ao reverter ${id}: ${e.message}`);
      }
      done += 1;
      this._emitProgress({ phase: 'revert', total, done, current: opt ? opt.name : id });
    }
    this._emitProgress({ phase: 'done', total, done, current: null });
    return { reverted: ids.length };
  }

  /** Restore the applied-state described by a restore point. */
  async restoreToPoint(pointId) {
    const rp = backupManager.getRestorePoint(pointId);
    if (!rp) throw new Error('Ponto de restauro não encontrado.');
    // Revert everything currently applied, then re-apply what the point had.
    await this.revertAll();
    const targetIds = Object.keys(rp.state.applied || {});
    return this.applyMany(targetIds, { label: `Restauro: ${rp.label}` });
  }
}

module.exports = new Engine();
