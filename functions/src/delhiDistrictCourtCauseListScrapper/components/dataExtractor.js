const { wait } = require('./utils');

/**
 * Wait for results to load and count PDF links
 * @param {Object} page - Page instance
 * @returns {Promise<number>} - Number of PDF links found
 */
const waitForResults = async (page) => {
  console.log('[debug] [dataExtractor] Waiting for results to load...');
  await page.waitForFunction(
    () => {
      const links = document.querySelectorAll('a[href*=".pdf" i]');
      const error = document.querySelector('.error-message, .alert-danger');
      if (error) throw new Error(error.innerText);
      return links.length > 0;
    },
    { timeout: 120_000 }
  );
  console.log('[debug] [dataExtractor] Results loaded successfully');
  
  console.log('[debug] [dataExtractor] Counting PDF links...');
  const total = await page.evaluate(
    () => document.querySelectorAll('a[href*=".pdf" i]').length);
  console.log(`[info] [dataExtractor] Found ${total} cause list(s)`);

  // Wait for table to be fully loaded
  console.log('[debug] [dataExtractor] Waiting for table to fully load...');
  await wait(5000);
  console.log('[debug] [dataExtractor] Table loading wait completed');

  return total;
};

/**
 * Extract table data from the results page
 * @param {Object} page - Page instance
 * @returns {Promise<Array>} - Array of extracted row data
 */
const extractTableData = async (page) => {
  console.log('[debug] Extracting displayed case numbers...');

  const caseNumbers = await page.evaluate(() => {
    // Find all links containing case numbers
    const links = document.querySelectorAll('a.viewCnrDetails');

    return Array.from(links).map(a => a.textContent.trim());
  });

  console.log(`[info] Found ${caseNumbers.length} case numbers`);

  return caseNumbers;
};

module.exports = {
  waitForResults,
  extractTableData
};
