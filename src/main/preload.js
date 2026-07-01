'use strict';

/**
 * Secure bridge. contextIsolation is ON and nodeIntegration is OFF, so the
 * renderer only ever sees this tiny, explicit `window.fc26` API — never Node,
 * never ipcRenderer directly. Every method maps to a whitelisted IPC channel.
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('fc26', {
  appInfo: () => invoke('app:info'),
  analyze: () => invoke('analyze'),
  status: () => invoke('optimizations:status'),

  applyMany: (ids, label) => invoke('optimize:apply', ids, label),
  applyOne: (id) => invoke('optimize:applyOne', id),
  revertOne: (id) => invoke('optimize:revertOne', id),
  revertAll: () => invoke('optimize:revertAll'),

  applyProfile: (profileId) => invoke('profile:apply', profileId),
  listProfiles: () => invoke('profiles:list'),
  saveProfile: (data) => invoke('profiles:save', data),
  deleteProfile: (id) => invoke('profiles:delete', id),

  listBackups: () => invoke('backups:list'),
  createBackup: (label) => invoke('backups:create', label),
  restoreBackup: (id) => invoke('backups:restore', id),
  deleteBackup: (id) => invoke('backups:delete', id),

  recentLogs: (limit) => invoke('logs:recent', limit),
  openLogsFolder: () => invoke('logs:openFolder'),

  checkUpdate: () => invoke('update:check'),
  downloadUpdate: () => invoke('update:download'),
  installUpdate: () => invoke('update:install'),

  openExternal: (url) => invoke('open:external', url),

  /* Window controls */
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  /* Event streams (main → renderer) */
  onLog: (cb) => ipcRenderer.on('log:entry', (_e, entry) => cb(entry)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
});
