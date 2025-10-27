const functions = require('firebase-functions');

// Import all components from index
const {
  solveCaptcha,
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  handleCaptcha,
  submitForm,
  wait
} = require('./components');

/* ─── main routine ─── */
const tentativeDateScrapper = async (formData) => {
  console.log(`[start] [tentativeDateScrapper] Scraping cause list with parameters:`, formData);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);

    // Navigate to the page
    await navigateToPage(page);

    // Fill and validate form with the new form data structure
    await fillForm(page, formData);
    // await validateFormFields(page, formData);

    // // Handle captcha and submit
    await handleCaptcha(page, solveCaptcha);
    await submitForm(page);

    const viewLinkSelector = 'a.viewCnrDetails';
    await page.waitForSelector(viewLinkSelector, { visible: true });

    // Get all pages before clicking
    const pagesBefore = await browser.pages();

    // Click the link
    await page.click(viewLinkSelector);

    // Wait a bit for new page/tab or table to render
    await wait(1000); // small delay

    // Get all pages after click
    const pagesAfter = await browser.pages();

    // Determine if a new page/tab opened
    let newPage;
    if (pagesAfter.length > pagesBefore.length) {
      // A new tab opened
      newPage = pagesAfter.find(p => !pagesBefore.includes(p));
      await newPage.bringToFront();
    } else {
      // Content updated in the same page
      newPage = page;
    }

    // Wait for the table to appear
    await newPage.waitForSelector('table.caseDetailsTable', { visible: true });

    // Get HTML content
    await newPage.content();

    // Extract tentative date
    const tentativeDate = await newPage.$eval(
      'table.caseDetailsTable',
      table => {
        const tbody = table.querySelector('tbody');
        if (!tbody) return null;
        const rows = tbody.querySelectorAll('tr');
        if (rows.length >= 6) {
          const targetTd = rows[5].querySelectorAll('td')[1];
          if (targetTd) {
            const font = targetTd.querySelector('font');
            return font ? font.textContent.trim() : targetTd.textContent.trim();
          }
        }
        return null;
      }
    );
    console.log(`[info] [tentativeDateScrapper] Extracted tentative date:`, tentativeDate);

    return tentativeDate;

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
  tentativeDateScrapper,
}; 