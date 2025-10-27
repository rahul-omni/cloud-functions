const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

/**
 * Launch and configure browser for scraping
 * @returns {Promise<Object>} - Browser instance
 */
const launchBrowser = async () => {
  const browser = await puppeteer.launch({ 
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless
  });
  console.log('[info] [browserManager] Browser launched successfully');
  return browser;
};

/**
 * Create and configure a new page
 * @param {Object} browser - Browser instance
 * @returns {Promise<Object>} - Configured page
 */
const createPage = async (browser) => {
  const page = await browser.newPage();
  console.log('[info] [browserManager] New page created');
  
  // Set a proper user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  console.log('[info] [browserManager] User agent and viewport set');

  // Enable request interception
  await page.setRequestInterception(true);
  
  // Only log critical errors
  page.on('request', request => request.continue());
  page.on('response', async response => {
    if (response.status() === 403) {
      console.log('[error] [browserManager] Access forbidden (403)');
    }
  });
  console.log('[info] [browserManager] Request interception enabled');

  return page;
};

/**
 * Navigate to the cause list page
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const navigateToPage = async (page) => {
  await page.goto('https://www.sci.gov.in/case-status-case-no/', {
    waitUntil: 'networkidle0',
    timeout: 60000
  });
  console.log('[info] [browserManager] Successfully navigated to case status page');

  // Wait for the form to be ready
  await page.waitForSelector('#case_type', { visible: true, timeout: 30000 });
  console.log('[info] [browserManager] Form is ready');
};

/**
 * Close browser
 * @param {Object} browser - Browser instance
 * @returns {Promise<void>}
 */
const closeBrowser = async (browser) => {
  console.log('[debug] [browserManager] Closing browser...');
  await browser.close();
  console.log('[info] [browserManager] Browser closed');
};

module.exports = {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser
};
