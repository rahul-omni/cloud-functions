const functions = require('firebase-functions');

// Import all components from index
const {
  solveCaptcha,
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  validateFormFields,
  handleCaptcha,
  submitForm,
  waitForResults,
  extractTableData,
  transformData
} = require('./components');

/* ─── main routine ─── */
const fetchSupremeCourtCauseList = async (formData) => {
  console.log(`[start] [fetchSupremeCourtCauseList] Scraping cause list with parameters:`, formData);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);
    
    // Navigate to the page
    await navigateToPage(page);
    
    // Fill and validate form with the new form data structure
    await fillForm(page, formData);
    await validateFormFields(page, formData);
    
    // Handle captcha and submit
    await handleCaptcha(page, solveCaptcha);
    await submitForm(page);
    
    // Wait for results and extract data
    await waitForResults(page);
    const rows = await extractTableData(page);
    
<<<<<<< HEAD
    // Transform data for database
    const transformedRows = transformData(rows, formData);

    return transformedRows;

=======
    // // Transform data for database
    // const transformedRows = transformData(rows, formData);

    // return transformedRows;

    return rows;

>>>>>>> 556fe3d769de4993646ca29c4889636bbd1734c8

    } catch (error) {
      console.error('[error] [fetchSupremeCourtCauseList] Failed to get results:', error.message);
      console.log('[debug] [fetchSupremeCourtCauseList] Error details:', error);
      throw error;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log("[end] [fetchSupremeCourtCauseList] Supreme Court Cause List Scraping completed successfully");
  }
};


module.exports = {
  fetchSupremeCourtCauseList,
}; 