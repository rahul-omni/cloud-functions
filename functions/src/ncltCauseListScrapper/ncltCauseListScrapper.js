const { launchBrowser } = require('./components/browserManager');
const { fillForm, submitFormAndWaitForResults } = require('./components/formHandler');
const { handleCaptcha } = require('./components/captchaSolver');
const { extractCauseListData } = require('./components/dataExtractor');
const { transformNCLTData } = require('./components/dataTransformer');

/* ─── main routine ─── */
const fetchNCLTCauseList = async (formData) => {
  console.log(`[start] [fetchNCLTCauseList] Scraping NCLT cause list with parameters:`, formData);

  let browser, page;
  try {
    // Launch browser and create page
    browser = await launchBrowser();
    page = await browser.newPage();
    
    // Set user agent and viewport for better compatibility
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to NCLT cause list page
    console.log('[info] [fetchNCLTCauseList] Navigating to NCLT cause list page');
    await page.goto('https://nclt.gov.in/all-couse-list', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Fill form with provided data
    console.log('[info] [fetchNCLTCauseList] Filling form with data:', formData);
    await fillForm(page, formData);
    
    // Solve captcha if present
    console.log('[info] [fetchNCLTCauseList] Attempting to solve CAPTCHA');
    await handleCaptcha(page);
    
    // Submit form and wait for results
    console.log('[info] [fetchNCLTCauseList] Submitting form and waiting for results');
    await submitFormAndWaitForResults(page);
    
    // Extract data from results table
    console.log('[info] [fetchNCLTCauseList] Extracting cause list data');
    const extractedData = await extractCauseListData(page);
    
    // Transform data to standardized format
    console.log('[info] [fetchNCLTCauseList] Transforming extracted data');
    const transformedData = transformNCLTData(extractedData, formData);

    console.log(`[success] [fetchNCLTCauseList] Successfully extracted ${transformedData.totalRecords} records`);
    return transformedData;

  } catch (error) {
    console.error('[error] [fetchNCLTCauseList] Failed to scrape NCLT cause list:', error.message);
    console.log('[debug] [fetchNCLTCauseList] Error details:', error);
    throw error;
  } finally {
    if (browser) {
      console.log('[info] [fetchNCLTCauseList] Closing browser');
      await browser.close();
    }
    console.log("[end] [fetchNCLTCauseList] NCLT Cause List Scraping completed");
  }
};

module.exports = {
  fetchNCLTCauseList
};