// Import all components from index
const {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  waitForResults,
  extractPdfLinks,
  extractTableData,
  wait
} = require('./components');

/**
 * Main routine to fetch Punjab & Haryana High Court cause list
 * @param {Object} formData - Form data containing date and optional listType
 * @returns {Promise<Array>} - Array of PDF links
 */
const fetchPHHCCauseList = async (formData) => {
  console.log(`[start] [fetchPHHCCauseList] Scraping cause list with parameters:`, formData);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);

    // Navigate to the page
    await navigateToPage(page);
    
    // Wait for page to fully load
    await wait(3000);
    console.log('[debug] [fetchPHHCCauseList] Page loaded, waiting additional 2 seconds...');
    await wait(2000);
    
    // Fill form and submit
    await fillForm(page, formData);
    
    // Wait longer for AJAX to process and complete
    console.log('[debug] [fetchPHHCCauseList] Form submitted, waiting 5 seconds for AJAX...');
    await wait(5000);
    
    // Check current URL for debugging
    const currentUrl = page.url();
    console.log(`[debug] [fetchPHHCCauseList] Current URL after form submission: ${currentUrl}`);
    
    // Wait for AJAX response and results table to load
    // Increase timeout since AJAX might take time
    await waitForResults(page);
    
    // Additional wait to ensure table is fully rendered
    console.log('[debug] [fetchPHHCCauseList] Table found, waiting 3 seconds for full render...');
    await wait(3000);
    
    // Debug: Check if table exists inside #show_causeList
    const tableInfo = await page.evaluate(() => {
      const showCauseListDiv = document.querySelector('#show_causeList');
      if (!showCauseListDiv) {
        return { divExists: false, tableExists: false };
      }
      const table = showCauseListDiv.querySelector('table#tables11');
      return {
        divExists: true,
        tableExists: table !== null,
        divVisible: showCauseListDiv.offsetParent !== null,
        divContentLength: showCauseListDiv.innerHTML.length
      };
    });
    console.log(`[debug] [fetchPHHCCauseList] #show_causeList info:`, JSON.stringify(tableInfo, null, 2));
    
    // Extract PDF links with metadata (pass formData for fallback values)
    const pdfLinks = await extractPdfLinks(page, formData.date, formData.listType);
    
    // Extract cookies from the browser session before closing
    const cookies = await page.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log(`[info] [fetchPHHCCauseList] Extracted ${cookies.length} cookie(s) from session`);
    
    // Only extract table data if we found PDF links (to avoid extracting wrong table)
    let tableData = [];
    if (pdfLinks.length > 0) {
      tableData = await extractTableData(page);
    } else {
      console.log('[debug] [fetchPHHCCauseList] Skipping tableData extraction - no PDF links found');
    }

    console.log(`[info] [fetchPHHCCauseList] Scraped ${pdfLinks.length} PDF link(s)`);

    return {
      pdfLinks: pdfLinks,
      tableData: tableData,
      cookies: cookies,
      cookieHeader: cookieHeader
    };

  } catch (error) {
    console.error('[error] [fetchPHHCCauseList] Failed to get results:', error.message);
    console.log('[debug] [fetchPHHCCauseList] Error details:', error);
    throw error;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log("[end] [fetchPHHCCauseList] Punjab & Haryana High Court Cause List Scraping completed");
  }
};

module.exports = {
  fetchPHHCCauseList,
};

