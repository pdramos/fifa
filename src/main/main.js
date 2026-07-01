'use strict';

/**
 * Electron main process — creates the frameless window, wires IPC, and kicks
 * off a non-blocking update check.
 *
 * Security posture: contextIsolation ON, nodeIntegration OFF, sandbox ON,
 * remote module unused. The renderer is a pure UI that talks only through the
 * preload bridge.
 */

const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');
const logger = require('./core/logger');
const ipc = require('./ipc');
const updater = require('./core/updater');

const isDev = process.argv.includes('--dev');
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0a0e17',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  nativeTheme.themeSource = 'dark';
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  ipc.register(mainWindow);
  updater.attach(mainWindow);

  // Non-blocking background update check shortly after launch.
  setTimeout(() => {
    updater.check().catch(() => {});
  }, 4000);
}

// Single-instance lock so backups/state aren't corrupted by two copies.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    logger.info(`FC26 Optimizer iniciado (v${app.getVersion()}) — by PEDRO RAMOS`);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  process.on('uncaughtException', (err) => {
    logger.error('Exceção não tratada: ' + (err && err.stack ? err.stack : err));
  });
}
