'use strict';

/**
 * Locates the EA SPORTS FC 26 installation across every common launcher
 * (EA app / Origin, Steam, Epic Games) and finds the game's own settings
 * folder under Documents.
 *
 * Detection is read-only: it inspects the registry, parses Steam's public
 * library manifest files, and checks well-known folder paths. Nothing here
 * modifies the game.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { regRead, IS_WINDOWS } = require('./winexec');
const { paths } = require('./paths');
const logger = require('./logger');

const GAME_FOLDER_NAMES = ['EA SPORTS FC 26', 'EA SPORTS FC 26 Trial', 'FC 26'];
const GAME_EXES = ['FC26.exe', 'Fc26.exe', 'FC26_x64.exe'];
const STEAM_APPID_CANDIDATES = []; // Filled from manifests; FC 26 appid resolved dynamically by folder name.

function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

async function detectEaInstallDir() {
  // The EA app records installs under HKLM. Try the canonical keys.
  const keys = [
    ['HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Sports FC 26', 'Install Dir'],
    ['HKLM\\SOFTWARE\\Electronic Arts\\EA Sports FC 26', 'Install Dir'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\EA Games\\EA SPORTS FC 26', 'Install Dir'],
  ];
  for (const [key, val] of keys) {
    const r = await regRead(key, val);
    if (r.exists && r.value) {
      const dir = r.value.replace(/"/g, '').trim();
      if (fs.existsSync(dir)) return { dir, launcher: 'EA app' };
    }
  }
  // Fallback: default EA install roots.
  const roots = [
    'C:\\Program Files\\EA Games',
    'C:\\Program Files (x86)\\EA Games',
    'C:\\Program Files\\Electronic Arts',
  ];
  for (const root of roots) {
    for (const name of GAME_FOLDER_NAMES) {
      const dir = path.join(root, name);
      if (fs.existsSync(dir)) return { dir, launcher: 'EA app' };
    }
  }
  return null;
}

function parseSteamLibraryFolders(steamRoot) {
  const libs = [steamRoot];
  const vdf = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    const text = fs.readFileSync(vdf, 'utf8');
    const re = /"path"\s+"([^"]+)"/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      libs.push(m[1].replace(/\\\\/g, '\\'));
    }
  } catch (_) {
    /* no extra libraries */
  }
  return [...new Set(libs)];
}

async function detectSteamInstallDir() {
  let steamRoot = null;
  const r = await regRead('HKCU\\SOFTWARE\\Valve\\Steam', 'SteamPath');
  if (r.exists && r.value) steamRoot = r.value.replace(/"/g, '').trim();
  if (!steamRoot) {
    steamRoot = firstExisting([
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
    ]);
  }
  if (!steamRoot) return null;

  for (const lib of parseSteamLibraryFolders(steamRoot)) {
    for (const name of GAME_FOLDER_NAMES) {
      const dir = path.join(lib, 'steamapps', 'common', name);
      if (fs.existsSync(dir)) return { dir, launcher: 'Steam' };
    }
  }
  return null;
}

async function detectEpicInstallDir() {
  const manifestsDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  try {
    if (!fs.existsSync(manifestsDir)) return null;
    for (const f of fs.readdirSync(manifestsDir)) {
      if (!f.endsWith('.item')) continue;
      const data = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), 'utf8'));
      const name = (data.DisplayName || '') + ' ' + (data.InstallLocation || '');
      if (/FC\s*26|EA SPORTS FC 26/i.test(name) && data.InstallLocation && fs.existsSync(data.InstallLocation)) {
        return { dir: data.InstallLocation, launcher: 'Epic Games' };
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function findExecutable(dir) {
  if (!dir) return null;
  for (const exe of GAME_EXES) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  // Search one level deep (some builds nest the exe).
  try {
    for (const entry of fs.readdirSync(dir)) {
      const sub = path.join(dir, entry);
      if (fs.statSync(sub).isDirectory()) {
        for (const exe of GAME_EXES) {
          const p = path.join(sub, exe);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Locate the folder where FC 26 stores its editable settings (`fcsetup`).
 * FC 26 uses %LOCALAPPDATA%\EA SPORTS FC 26\; older titles used Documents.
 */
function findSettingsDir() {
  const docs = paths.documents();
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(local, 'EA SPORTS FC 26'),
    path.join(local, 'EA SPORTS FC25'),
    path.join(docs, 'EA SPORTS FC 26'),
    path.join(docs, 'FC 26'),
    path.join(docs, 'FIFA 26'),
  ];
  const dir = firstExisting(candidates);
  return dir;
}

async function detect() {
  if (!IS_WINDOWS) {
    logger.warn('Game detection runs only on Windows; returning empty result in dev.');
    return {
      found: false,
      platform: process.platform,
      installDir: null,
      executable: null,
      launcher: null,
      settingsDir: null,
      settingsFiles: [],
    };
  }

  let hit =
    (await detectEaInstallDir()) ||
    (await detectSteamInstallDir()) ||
    (await detectEpicInstallDir());

  const installDir = hit ? hit.dir : null;
  const launcher = hit ? hit.launcher : null;
  const executable = findExecutable(installDir);
  const settingsDir = findSettingsDir();

  let settingsFiles = [];
  if (settingsDir) {
    try {
      settingsFiles = fs
        .readdirSync(settingsDir)
        .filter((f) => /\.(ini|cfg|xml|dat|txt)$/i.test(f) || /settings/i.test(f))
        .map((f) => path.join(settingsDir, f));
    } catch (_) {
      /* ignore */
    }
  }

  const found = Boolean(installDir || settingsDir);
  logger.info(`Game detection: found=${found} launcher=${launcher || 'n/a'} dir=${installDir || 'n/a'}`);

  return {
    found,
    platform: process.platform,
    installDir,
    executable,
    launcher,
    settingsDir,
    settingsFiles,
    processName: executable ? path.basename(executable) : GAME_EXES[0],
  };
}

module.exports = { detect, findSettingsDir, GAME_EXES };
