const { defineString } = require('firebase-functions/params');

/** Shared DATABASE_URL param for the whole project (Firebase params / .env). */
const databaseUrlParam = defineString('DATABASE_URL');

/**
 * Reusable: require a param/value; throw with a clear message if missing.
 * Use in Cloud Function handlers to avoid repeating the same validation and 500 response.
 *
 * @param {*} value - The param value (e.g. from defineString().value() or env).
 * @param {string} paramName - Name of the param for the error message (e.g. 'DATABASE_URL').
 * @param {string} [hint] - Optional hint (e.g. 'e.g. in .env or Firebase params').
 * @returns {*} The same value (for chaining).
 * @throws {Error} If value is undefined, null, or empty string.
 */
function requireParam(value, paramName, hint = '') {
  if (value === undefined || value === null || value === '') {
    const msg = hint ? `Param missing: set ${paramName} (${hint})` : `Param missing: set ${paramName}`;
    throw new Error(msg);
  }
  return value;
}

/**
 * Return a 500 JSON response body for a missing param. Use when you prefer not to throw.
 *
 * @param {string} paramName - Name of the param.
 * @param {string} [hint] - Optional hint.
 * @returns {{ success: false, error: string }}
 */
function missingParamBody(paramName, hint = '') {
  const error = hint ? `Param missing: set ${paramName} (${hint})` : `Param missing: set ${paramName}`;
  return { success: false, error };
}

const DEFAULT_DATABASE_URL_HINT = 'e.g. in .env or Firebase params';

/**
 * Reusable: get required DATABASE_URL for Cloud Functions.
 * Uses the shared project param (defineString('DATABASE_URL')) or process.env.DATABASE_URL.
 * Use in any handler that needs a DB connection string.
 *
 * @param {function(): string|undefined} [getter] - Optional. If provided, used instead of the shared param/env. Pass a function that returns the URL.
 * @param {string} [hint] - Optional hint for the error message.
 * @returns {string} The database URL.
 * @throws {Error} If the value is missing or empty.
 */
function getRequiredDatabaseUrl(getter, hint = DEFAULT_DATABASE_URL_HINT) {
  const value = typeof getter === 'function'
    ? getter()
    : (databaseUrlParam.value() || process.env.DATABASE_URL);
  return requireParam(value, 'DATABASE_URL', hint);
}

module.exports = {
  requireParam,
  missingParamBody,
  getRequiredDatabaseUrl,
  databaseUrlParam,
  DEFAULT_DATABASE_URL_HINT,
};
