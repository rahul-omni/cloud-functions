/**
 * Wait for a specified number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Convert date format to DD/MM/YYYY (jQuery UI datepicker format)
 * @param {string} date - Date in various formats (DD-MM-YYYY, MM/DD/YYYY, etc.)
 * @returns {string} - Date in DD/MM/YYYY format
 */
const convertDateFormat = (date) => {
  if (!date) return null;
  
  // If already in DD/MM/YYYY format, return as is
  if (date.includes('/')) {
    const parts = date.split('/');
    if (parts.length === 3) {
      // Check if it's already DD/MM/YYYY (first part > 12) or MM/DD/YYYY (first part <= 12)
      if (parseInt(parts[0]) > 12) {
        // Already DD/MM/YYYY
        return date;
      } else {
        // MM/DD/YYYY, convert to DD/MM/YYYY
        return `${parts[1]}/${parts[0]}/${parts[2]}`;
      }
    }
    return date;
  }
  
  // Convert from DD-MM-YYYY to DD/MM/YYYY
  if (date.includes('-')) {
    const parts = date.split('-');
    if (parts.length === 3) {
      // Assume DD-MM-YYYY format
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
  }
  
  return date;
};

module.exports = {
  wait,
  convertDateFormat
};

