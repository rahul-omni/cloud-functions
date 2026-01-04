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
 * @param {string} url - URL to navigate to
 * @returns {Promise<Object>} - Configured page
 */
const createPage = async (browser, url = "https://hcraj.nic.in/quick-causelist-jp/") => {
  const page = await browser.newPage();
  console.log('[info] [browserManager] New page created');
  
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  console.log('[info] [browserManager] User agent and viewport set');

  await page.setRequestInterception(true);
  page.on('request', request => request.continue());
  page.on('response', async response => {
    if (response.status() === 403) {
      console.log('[error] [browserManager] Access forbidden (403) =>', response.url());
    }
  });
  console.log('[info] [browserManager] Request interception enabled');

  // Navigate to the page
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 300000 }); // 5 minutes timeout
  console.log(`[info] [browserManager] Navigated to ${url}`);

  return page;
};

/**
 * Navigate to the cause list page
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const navigateToPage = async (page) => {
  const url = 'https://hcraj.nic.in/quick-causelist-jp/';
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 300000 // 5 minutes timeout
  });
  console.log('[info] [browserManager] Navigated to cause list page');
  
  // Wait for the form to be visible
  await page.waitForSelector('#causelist-form', { visible: true, timeout: 120000 }); // 2 minutes timeout
  console.log('[info] [browserManager] Form elements loaded');
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

