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
const createPage = async (browser, url = "https://example.com") => {
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

  // 👇 navigate
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`[info] [browserManager] Navigated to ${url}`);

  return page;
};


/**
 * Navigate to the cause list page
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const navigateToPage = async (page) => {
  await page.goto('https://hcservices.ecourts.gov.in/hcservices/main.php', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  console.log('[info] Landed on main page');

  let modalHandled = false;

  // Attach the dialog handler first
  page.removeAllListeners('dialog');
  page.on('dialog', async dialog => {
    console.log(`[modal] JS Alert says: ${dialog.message()}`);
    await dialog.accept();  // accept immediately
    modalHandled = true;
    console.log('[modal] JS Alert accepted');
  });

  // Click "Cause List" (will trigger JS alert)
  await page.waitForSelector('#leftPaneMenuCL', { visible: true });
  await page.click('#leftPaneMenuCL');
  console.log('[info] Clicked on Cause List button');

  // Wait briefly for alert to be handled
  await delay(1000);

  if (!modalHandled) {
    console.log('[modal] No JS alert detected, checking for custom HTML modal...');
    const okClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
        .find(el => el.offsetParent !== null && /ok/i.test(el.textContent || el.value));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (okClicked) {
      console.log('[modal] Custom HTML modal OK clicked via evaluate.');
      await delay(1000);
      modalHandled = true;
    } else {
      console.log('[modal] No custom HTML modal found.');
    }
  } else {
    console.log('[modal] JS alert was already handled.');
  }

  console.log('[navigateToPage] navigation complete');

  // 🔑 Extract cookies from the current session
  const cookies = await page.cookies();
  console.log('[cookies] Extracted cookies:', cookies);

  // If you want a single header string (for axios)
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log('[cookies] Cookie header:', cookieHeader);

  return { cookies, cookieHeader };
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
