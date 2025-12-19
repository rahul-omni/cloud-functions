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
const delhiCauseListScrapper = async (formData, page) => {
  console.log(`[start] [delhiCauseListScrapper] Scraping cause list with parameters:`, formData);
  try {

    const cases = []
    // Fill and validate form with the new form data structure
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt == 1){
        await fillForm(page, formData);
      }else{
        const value = "3"; // "3" for criminal
        await page.evaluate((val) => {
          const radio = document.querySelector(`input.causeType[value="${val}"]`);
          if (radio) radio.click(); // <-- important for triggering UI events
        }, value);
      }
      await handleCaptcha(page, solveCaptcha);
      await submitForm(page);
      const rows = await extractTableData(page);
      cases.push(...rows);
    }

    return cases

    } catch (error) {
      console.error('[error] [fetchSupremeCourtCauseList] Failed to get results:', error.message);
      console.log('[debug] [fetchSupremeCourtCauseList] Error details:', error);
      throw error;
  } finally {
    console.log("[end] [fetchSupremeCourtCauseList] Supreme Court Cause List Scraping completed successfully");
  }
};


module.exports = {
  delhiCauseListScrapper,
}; 