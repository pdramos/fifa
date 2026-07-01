'use strict';

/**
 * Auto-update wrapper around electron-updater (GitHub releases provider).
 *
 * Fails soft: if electron-updater isn't installed, there's no network, or no
 * published release exists, the app keeps working and simply reports "up to
 * date / unavailable" instead of crashing.
 */

const logger = require('./logger');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (_) {
  autoUpdater = null;
}

class Updater {
  constructor() {
    this._win = null;
    this._wired = false;
  }

  attach(win) {
    this._win = win;
    if (autoUpdater && !this._wired) this._wire();
  }

  _send(channel, payload) {
    if (this._win && !this._win.isDestroyed()) {
      this._win.webContents.send(channel, payload);
    }
  }

  _wire() {
    this._wired = true;
    autoUpdater.autoDownload = false;
    autoUpdater.on('checking-for-update', () => this._send('update:status', { state: 'checking' }));
    autoUpdater.on('update-available', (info) =>
      this._send('update:status', { state: 'available', version: info.version })
    );
    autoUpdater.on('update-not-available', () => this._send('update:status', { state: 'none' }));
    autoUpdater.on('error', (err) =>
      this._send('update:status', { state: 'error', message: String(err && err.message) })
    );
    autoUpdater.on('download-progress', (p) =>
      this._send('update:status', { state: 'downloading', percent: Math.round(p.percent) })
    );
    autoUpdater.on('update-downloaded', (info) =>
      this._send('update:status', { state: 'downloaded', version: info.version })
    );
  }

  async check() {
    if (!autoUpdater) return { state: 'unavailable', reason: 'electron-updater não instalado' };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { state: 'checked', version: r && r.updateInfo && r.updateInfo.version };
    } catch (e) {
      logger.warn('Verificação de atualizações falhou: ' + e.message);
      return { state: 'error', message: e.message };
    }
  }

  async download() {
    if (!autoUpdater) return { ok: false };
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  quitAndInstall() {
    if (autoUpdater) autoUpdater.quitAndInstall();
  }
}

module.exports = new Updater();
