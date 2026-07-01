'use strict';

/**
 * Central resolver for every path the optimizer reads or writes.
 *
 * All user data (backups, logs, profiles, settings) lives under Electron's
 * `userData` directory so the app never writes inside its own install folder
 * (which may be read-only under Program Files).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let app = null;
try {
  // Available inside the Electron main process.
  app = require('electron').app;
} catch (_) {
  // Allows the module to be required by CLI tooling / tests outside Electron.
  app = null;
}

function userDataRoot() {
  if (app && typeof app.getPath === 'function') {
    return app.getPath('userData');
  }
  return path.join(os.homedir(), '.fc26-optimizer');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const paths = {
  userData: () => ensureDir(userDataRoot()),
  backups: () => ensureDir(path.join(userDataRoot(), 'backups')),
  logs: () => ensureDir(path.join(userDataRoot(), 'logs')),
  profiles: () => ensureDir(path.join(userDataRoot(), 'profiles')),
  settingsFile: () => path.join(userDataRoot(), 'settings.json'),
  stateFile: () => path.join(userDataRoot(), 'applied-state.json'),

  documents: () => {
    if (app && typeof app.getPath === 'function') {
      try {
        return app.getPath('documents');
      } catch (_) {
        /* fallthrough */
      }
    }
    return path.join(os.homedir(), 'Documents');
  },
};

module.exports = { paths, ensureDir, userDataRoot };
