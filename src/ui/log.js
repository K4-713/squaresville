// Leveled logging for system visibility. The active level is a *setting*, not
// code: change it from the browser console with
//   localStorage.setItem('squaresville.logLevel', 'debug')
// and reload — no deploy needed (project logging guideline).

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL_SETTING = 'squaresville.logLevel';
const DEFAULT_LEVEL = 'info';

function activeLevel() {
  let configured = null;
  try {
    configured = globalThis.localStorage?.getItem(LOG_LEVEL_SETTING);
  } catch {
    // Storage can be unavailable (e.g. blocked cookies); fall back to default.
  }
  return LEVELS[configured] ?? LEVELS[DEFAULT_LEVEL];
}

function emit(level, consoleMethod, args) {
  if (LEVELS[level] <= activeLevel()) {
    consoleMethod(`[squaresville:${level}]`, ...args);
  }
}

export const log = {
  error: (...args) => emit('error', console.error, args),
  warn: (...args) => emit('warn', console.warn, args),
  info: (...args) => emit('info', console.info, args),
  debug: (...args) => emit('debug', console.debug, args),
};
