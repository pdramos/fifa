'use strict';

/**
 * IPC surface — the ONLY bridge between the sandboxed renderer and the
 * privileged main process. The preload script exposes a whitelisted subset of
 * these channels; the renderer can never call Node APIs directly.
 */

const { ipcMain, shell, app } = require('electron');
const os = require('os');

const logger = require('./core/logger');
const gameDetector = require('./core/gameDetector');
const systemInfo = require('./core/systemInfo');
const backupManager = require('./core/backupManager');
const profileManager = require('./core/profileManager');
const stateStore = require('./core/stateStore');
const updater = require('./core/updater');
const engine = require('./optimizations/engine');
const { paths } = require('./core/paths');

function handle(channel, fn) {
  ipcMain.handle(channel, async (_evt, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      logger.error(`IPC ${channel} falhou: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });
}

function register(win) {
  // Stream log entries to the renderer as they happen.
  logger.onEntry((entry) => {
    if (win && !win.isDestroyed()) win.webContents.send('log:entry', entry);
  });

  // Stream optimization progress.
  engine.onProgress((payload) => {
    if (win && !win.isDestroyed()) win.webContents.send('progress', payload);
  });

  /* ── Analysis / diagnostics ── */
  handle('app:info', async () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    isAdmin: await isElevated(),
    userData: paths.userData(),
  }));

  handle('analyze', async () => {
    logger.info('A analisar o sistema e a instalação do jogo…');
    const [game, system] = await Promise.all([gameDetector.detect(), systemInfo.collect()]);
    engine.setContext({ game, system });
    const status = await engine.status();
    logger.success('Análise concluída.');
    return {
      game,
      system,
      status,
      list: engine.list(),
      categories: engine.getCategories(),
      manual: engine.getManualRecommendations(),
      appliedCount: stateStore.appliedIds().length,
    };
  });

  handle('optimizations:status', async () => engine.status());

  /* ── Apply / revert ── */
  handle('optimize:apply', async (ids, label) => engine.applyMany(ids, { label }));
  handle('optimize:applyOne', async (id) => engine.applyOne(id));
  handle('optimize:revertOne', async (id) => engine.revertOne(id));
  handle('optimize:revertAll', async () => engine.revertAll());

  handle('profile:apply', async (profileId) => {
    const profile = profileManager.get(profileId);
    if (!profile) throw new Error('Perfil não encontrado.');
    stateStore.setLastProfile(profileId);
    const applicable = engine.list().filter((o) => o.applicable).map((o) => o.id);
    const ids = profile.ids.filter((id) => applicable.includes(id));
    return engine.applyMany(ids, { label: `Perfil: ${profile.name}` });
  });

  /* ── Profiles ── */
  handle('profiles:list', async () => ({
    profiles: profileManager.all(),
    lastProfile: stateStore.getLastProfile(),
  }));
  handle('profiles:save', async (data) => profileManager.saveCustomProfile(data));
  handle('profiles:delete', async (id) => profileManager.deleteCustomProfile(id));

  /* ── Backups / restore points ── */
  handle('backups:list', async () => backupManager.listRestorePoints());
  handle('backups:create', async (label) => {
    const system = await systemInfo.collect();
    return backupManager.createRestorePoint(label, system);
  });
  handle('backups:restore', async (id) => engine.restoreToPoint(id));
  handle('backups:delete', async (id) => backupManager.deleteRestorePoint(id));

  /* ── Logs ── */
  handle('logs:recent', async (limit) => logger.recent(limit || 500));
  handle('logs:openFolder', async () => {
    await shell.openPath(paths.logs());
    return true;
  });

  /* ── Updates ── */
  handle('update:check', async () => updater.check());
  handle('update:download', async () => updater.download());
  handle('update:install', async () => {
    updater.quitAndInstall();
    return true;
  });

  /* ── Window controls (frameless window) ── */
  ipcMain.on('window:minimize', () => win && win.minimize());
  ipcMain.on('window:maximize', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win && win.close());

  /* ── Misc ── */
  handle('open:external', async (url) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
    return true;
  });
}

/** Detect whether the process is elevated (admin), needed for HKLM tweaks. */
async function isElevated() {
  if (process.platform !== 'win32') return false;
  const { run } = require('./core/winexec');
  const res = await run('net', ['session'], { timeout: 5000 });
  return res.ok;
}

module.exports = { register };
