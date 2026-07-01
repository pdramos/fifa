'use strict';

/**
 * Lightweight structured logger.
 *
 * Writes newline-delimited JSON to a daily log file and also keeps an
 * in-memory ring buffer so the UI can render the "Logs" panel instantly.
 * A callback can be registered to stream new entries to the renderer.
 */

const fs = require('fs');
const path = require('path');
const { paths } = require('./paths');

const RING_SIZE = 2000;

class Logger {
  constructor() {
    this._ring = [];
    this._listeners = new Set();
    this._stream = null;
    this._currentDay = null;
  }

  _openStreamForToday() {
    const day = new Date().toISOString().slice(0, 10);
    if (day === this._currentDay && this._stream) return;
    if (this._stream) {
      try {
        this._stream.end();
      } catch (_) {
        /* ignore */
      }
    }
    this._currentDay = day;
    const file = path.join(paths.logs(), `fc26-optimizer-${day}.log`);
    this._stream = fs.createWriteStream(file, { flags: 'a' });
  }

  onEntry(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit(entry) {
    for (const l of this._listeners) {
      try {
        l(entry);
      } catch (_) {
        /* never let a listener break logging */
      }
    }
  }

  log(level, message, meta) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message: String(message),
      ...(meta ? { meta } : {}),
    };

    this._ring.push(entry);
    if (this._ring.length > RING_SIZE) this._ring.shift();

    try {
      this._openStreamForToday();
      this._stream.write(JSON.stringify(entry) + '\n');
    } catch (_) {
      /* disk logging is best-effort */
    }

    // Mirror to console for `npm start` debugging.
    const line = `[${entry.ts}] ${level.toUpperCase()}: ${entry.message}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);

    this._emit(entry);
    return entry;
  }

  info(msg, meta) {
    return this.log('info', msg, meta);
  }
  warn(msg, meta) {
    return this.log('warn', msg, meta);
  }
  error(msg, meta) {
    return this.log('error', msg, meta);
  }
  success(msg, meta) {
    return this.log('success', msg, meta);
  }

  recent(limit = 500) {
    return this._ring.slice(-limit);
  }
}

module.exports = new Logger();
