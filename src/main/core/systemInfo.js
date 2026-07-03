'use strict';

/**
 * Collects read-only hardware / OS diagnostics used by the "Diagnóstico"
 * panel and to tailor recommendations (e.g. only suggest GPU-specific tweaks
 * for the detected vendor). Uses os module + a few PowerShell/CIM queries.
 */

const os = require('os');
const { powershell, IS_WINDOWS } = require('./winexec');
const logger = require('./logger');

function bytesToGB(b) {
  return Math.round((b / 1024 / 1024 / 1024) * 10) / 10;
}

async function psJson(script) {
  const res = await powershell(script + ' | ConvertTo-Json -Compress');
  if (!res.ok || !res.stdout.trim()) return null;
  try {
    return JSON.parse(res.stdout.trim());
  } catch (_) {
    return null;
  }
}

async function collect() {
  const base = {
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    hostname: os.hostname(),
    cpuModel: (os.cpus()[0] || {}).model || 'Desconhecido',
    cpuCores: os.cpus().length,
    totalMemGB: bytesToGB(os.totalmem()),
    freeMemGB: bytesToGB(os.freemem()),
    uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
    gpu: null,
    gpuVendor: null,
    diskGameOnSsd: null,
    powerPlan: null,
    windowsEdition: null,
  };

  if (!IS_WINDOWS) {
    logger.warn('System diagnostics limited on non-Windows dev environment.');
    return base;
  }

  try {
    const gpu = await psJson(
      "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,DriverVersion,AdapterRAM,CurrentRefreshRate"
    );
    if (gpu) {
      base.gpu = gpu.Name || null;
      base.gpuDriver = gpu.DriverVersion || null;
      if (gpu.AdapterRAM) base.gpuVramGB = bytesToGB(gpu.AdapterRAM);
      // Current display refresh rate (Hz) — used by the fcsetup REFRESH_RATE
      // fix, which needs the monitor's real rate to unlock the 60 Hz bug.
      const hz = Number(gpu.CurrentRefreshRate);
      if (Number.isFinite(hz) && hz >= 24 && hz <= 1000) base.refreshRateHz = hz;
      const name = (gpu.Name || '').toLowerCase();
      base.gpuVendor = name.includes('nvidia')
        ? 'nvidia'
        : name.includes('amd') || name.includes('radeon')
        ? 'amd'
        : name.includes('intel')
        ? 'intel'
        : 'unknown';
    }
  } catch (e) {
    logger.warn('GPU query failed: ' + e.message);
  }

  try {
    const win = await psJson(
      "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber"
    );
    if (win) {
      base.windowsEdition = win.Caption || null;
      base.windowsBuild = win.BuildNumber || null;
    }
  } catch (_) {
    /* ignore */
  }

  try {
    const res = await powershell('powercfg /getactivescheme');
    if (res.ok) {
      const m = res.stdout.match(/\(([^)]+)\)\s*$/m);
      base.powerPlan = m ? m[1] : res.stdout.trim();
    }
  } catch (_) {
    /* ignore */
  }

  return base;
}

module.exports = { collect };
