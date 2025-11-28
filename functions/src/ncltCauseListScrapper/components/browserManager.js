// Use different puppeteer setup for local vs cloud
let puppeteer, chromium;

const isLocalEnvironment = process.env.NODE_ENV !== 'production' && !process.env.FUNCTIONS_EMULATOR;

if (isLocalEnvironment) {
  // Local development - use regular puppeteer
  try {
    puppeteer = require('puppeteer');
    console.log('[info] [browserManager] Using local puppeteer for development');
  } catch (error) {
    console.log('[warn] [browserManager] Regular puppeteer not found, falling back to puppeteer-core');
    puppeteer = require('puppeteer-core');
    chromium = require('chrome-aws-lambda');
  }
} else {
  // Cloud environment - use puppeteer-core with chrome-aws-lambda
  puppeteer = require('puppeteer-core');
  chromium = require('chrome-aws-lambda');
  console.log('[info] [browserManager] Using puppeteer-core for cloud deployment');
}

/**
 * Launch and configure browser for scraping
 * @returns {Promise<Object>} - Browser instance
 */
const launchBrowser = async () => {
  let browser;
  
  if (isLocalEnvironment && !chromium) {
    // Local development with regular puppeteer
    browser = await puppeteer.launch({
      headless: false, // Show browser for debugging in local
      devtools: false,
      slowMo: 100,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-dev-shm-usage'
      ]
    });
  } else {
    // Cloud environment or fallback
    browser = await puppeteer.launch({ 
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    });
  }
  
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
  
  return page;
};

/**
 * Navigate to the NCLT cause list page
 * @param {Object} page - Puppeteer page instance
 */
const navigateToPage = async (page) => {
  const url = 'https://nclt.gov.in/all-couse-list'; // Updated to correct NCLT URL
  console.log(`[info] [browserManager] Navigating to ${url}`);
  
  await page.goto(url, { 
    waitUntil: 'networkidle2',
    timeout: 60000 
  });
  
  console.log('[info] [browserManager] Page loaded successfully');
};

/**
 * Close browser instance
 * @param {Object} browser - Browser instance
 */
const closeBrowser = async (browser) => {
  if (browser) {
    await browser.close();
    console.log('[info] [browserManager] Browser closed successfully');
  }
};

module.exports = {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser
};
