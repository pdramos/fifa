'use strict';

/**
 * Backup & restore for the optimizer.
 *
 * Two layers:
 *   1. Per-optimization backups — the optimization engine records exactly what
 *      it needs to undo a single tweak (previous registry value, previous
 *      service state, or a copy of an edited config file). These live in the
 *      state store; file copies are kept here under backups/files/.
 *   2. Restore points — a named, timestamped snapshot of the whole applied
 *      state, so the user can roll everything back with one click even after
 *      many changes. Exported/imported as a single JSON manifest.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { paths } = require('./paths');
const stateStore = require('./stateStore');
const logger = require('./logger');

function fileBackupDir() {
  const dir = path.join(paths.backups(), 'files');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Copy a config file into the backup store; returns the stored copy path. */
function snapshotFile(originalPath) {
  if (!fs.existsSync(originalPath)) return null;
  const hash = crypto
    .createHash('sha1')
    .update(originalPath + '|' + Date.now())
    .digest('hex')
    .slice(0, 12);
  const dest = path.join(fileBackupDir(), `${path.basename(originalPath)}.${hash}.bak`);
  fs.copyFileSync(originalPath, dest);
  logger.info(`Backed up file: ${originalPath} -> ${dest}`);
  return dest;
}

/** Restore a previously backed-up config file over its original location. */
function restoreFile(backupPath, originalPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    logger.warn(`Backup file missing, cannot restore: ${backupPath}`);
    return false;
  }
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.copyFileSync(backupPath, originalPath);
  logger.success(`Restored file: ${originalPath}`);
  return true;
}

/* -------------------------------------------------------- Restore points */

function restorePointsIndex() {
  return path.join(paths.backups(), 'restore-points.json');
}

function loadRestorePoints() {
  try {
    return JSON.parse(fs.readFileSync(restorePointsIndex(), 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveRestorePoints(list) {
  fs.writeFileSync(restorePointsIndex(), JSON.stringify(list, null, 2));
}

/**
 * Create a named restore point capturing the full applied state. The engine
 * passes a `describe()` result so the manifest is human-readable.
 */
function createRestorePoint(label, systemSnapshot) {
  const id = 'rp_' + Date.now();
  const rp = {
    id,
    label: label || `Ponto de restauro ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    state: stateStore.snapshot(),
    system: systemSnapshot || null,
  };
  const list = loadRestorePoints();
  list.unshift(rp);
  // Keep the 30 most recent restore points.
  saveRestorePoints(list.slice(0, 30));
  logger.success(`Ponto de restauro criado: ${rp.label}`);
  return rp;
}

function listRestorePoints() {
  return loadRestorePoints().map((rp) => ({
    id: rp.id,
    label: rp.label,
    createdAt: rp.createdAt,
    count: Object.keys(rp.state.applied || {}).length,
  }));
}

function getRestorePoint(id) {
  return loadRestorePoints().find((rp) => rp.id === id) || null;
}

function deleteRestorePoint(id) {
  const list = loadRestorePoints().filter((rp) => rp.id !== id);
  saveRestorePoints(list);
  return true;
}

module.exports = {
  snapshotFile,
  restoreFile,
  createRestorePoint,
  listRestorePoints,
  getRestorePoint,
  deleteRestorePoint,
};
