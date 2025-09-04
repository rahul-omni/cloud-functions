/**
 * Wait for a specified number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Convert date format from DD-MM-YYYY to DDMMYYYY
 * @param {string} date - Date in DD-MM-YYYY format
 * @returns {string} - Date in DDMMYYYY format
 */
const digits = d => d.replace(/-/g, ''); // 01-01-2025 → 01012025

module.exports = {
  wait,
  digits
};
