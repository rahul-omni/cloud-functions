const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Convert date format to DD-MM-YYYY
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format
 * @returns {string} - Date in DD-MM-YYYY format
 */
const convertDateFormat = (date) => {
  if (!date) return null;
  
  // If already in DD-MM-YYYY format, return as is
  if (date.includes('-')) {
    const parts = date.split('-');
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      return date;
    }
  }
  
  // Convert from DD/MM/YYYY to DD-MM-YYYY
  if (date.includes('/')) {
    const parts = date.split('/');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
  }
  
  // If format is unexpected, return original date and log warning
  console.warn(`[warning] [utils] Unexpected date format for conversion: ${date}. Returning as is.`);
  return date;
};

module.exports = { wait, convertDateFormat };

