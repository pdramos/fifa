'use strict';

/**
 * Persists which optimizations are currently applied and the backup payload
 * needed to revert each one. Small JSON file, read/written atomically.
 */

const fs = require('fs');
const { paths } = require('./paths');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

class StateStore {
  constructor() {
    this._file = paths.stateFile();
    this._state = readJson(this._file, { applied: {}, lastProfile: null });
    if (!this._state.applied) this._state.applied = {};
  }

  _flush() {
    writeJsonAtomic(this._file, this._state);
  }

  isApplied(optId) {
    return Boolean(this._state.applied[optId]);
  }

  getBackup(optId) {
    const rec = this._state.applied[optId];
    return rec ? rec.backup : null;
  }

  markApplied(optId, backup) {
    this._state.applied[optId] = { backup, appliedAt: new Date().toISOString() };
    this._flush();
  }

  markReverted(optId) {
    delete this._state.applied[optId];
    this._flush();
  }

  appliedIds() {
    return Object.keys(this._state.applied);
  }

  setLastProfile(id) {
    this._state.lastProfile = id;
    this._flush();
  }

  getLastProfile() {
    return this._state.lastProfile;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this._state));
  }
}

module.exports = new StateStore();
