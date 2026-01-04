// Import all components from index
const {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  waitForResults,
  extractPdfLinks,
  wait
} = require('./components');

/**
 * Main routine to fetch Rajasthan High Court Jaipur cause list
 * @param {Object} formData - Form data containing date
 * @returns {Promise<Object>} - Object with pdfLinks, cookies, and cookieHeader
 */
const fetchRHCJaipurCauseList = async (formData) => {
  console.log(`[start] [fetchRHCJaipurCauseList] Scraping cause list with parameters:`, formData);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);

    // Navigate to the page
    await navigateToPage(page);
    
    // Wait for page to fully load
    await wait(3000);
    console.log('[debug] [fetchRHCJaipurCauseList] Page loaded, waiting additional 2 seconds...');
    await wait(2000);
    
    // Fill form and submit
    await fillForm(page, formData);
    
    // Wait for results to load
    console.log('[debug] [fetchRHCJaipurCauseList] Form submitted, waiting for results...');
    await waitForResults(page);
    
    // Additional wait to ensure table is fully rendered
    console.log('[debug] [fetchRHCJaipurCauseList] Table found, waiting 3 seconds for full render...');
    await wait(3000);
    
    // Extract PDF links with metadata
    const pdfLinks = await extractPdfLinks(page, formData.date);
    
    // Extract cookies from the browser session before closing
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log(`[info] [fetchRHCJaipurCauseList] Extracted ${cookies.length} cookie(s) from session`);

    console.log(`[info] [fetchRHCJaipurCauseList] Scraped ${pdfLinks.length} PDF link(s)`);

    return {
      pdfLinks: pdfLinks,
      cookies: cookies,
      cookieHeader: cookieHeader
    };

  } catch (error) {
    console.error('[error] [fetchRHCJaipurCauseList] Failed to get results:', error.message);
    console.log('[debug] [fetchRHCJaipurCauseList] Error details:', error);
    throw error;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log("[end] [fetchRHCJaipurCauseList] Rajasthan High Court Jaipur Cause List Scraping completed");
  }
};

module.exports = {
  fetchRHCJaipurCauseList,
};

