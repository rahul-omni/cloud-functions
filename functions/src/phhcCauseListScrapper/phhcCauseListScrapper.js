/**
 * Punjab & Haryana High Court — cause list browser scraper only.
 * Mirrors highCourtScrapper.js: launch browser, fill portal form, extract PDF links + session cookies, close browser.
 * PDF download, storage, DB matching, and WhatsApp are handled by the HTTP function (index.js) / db + notification helpers.
 */
const {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  waitForResults,
  extractPdfLinks,
  extractTableData,
  wait,
} = require("./components");

const PHHCCauseListScrapper = async (formData) => {
  console.log(
    `[start] [PHHCCauseListScrapper] Scraping PHHC cause list with parameters:`,
    formData
  );

  let browser;
  try {
    browser = await launchBrowser();
    const page = await createPage(browser);

    await navigateToPage(page);
    await wait(3000);
    console.log(
      "[debug] [PHHCCauseListScrapper] Page loaded, waiting additional 2 seconds..."
    );
    await wait(2000);

    await fillForm(page, formData);

    console.log(
      "[debug] [PHHCCauseListScrapper] Form submitted, waiting 5 seconds for AJAX..."
    );
    await wait(5000);

    const currentUrl = page.url();
    console.log(
      `[debug] [PHHCCauseListScrapper] Current URL after form submission: ${currentUrl}`
    );

    await waitForResults(page);

    console.log(
      "[debug] [PHHCCauseListScrapper] Table found, waiting 3 seconds for full render..."
    );
    await wait(3000);

    const tableInfo = await page.evaluate(() => {
      const showCauseListDiv = document.querySelector("#show_causeList");
      if (!showCauseListDiv) {
        return { divExists: false, tableExists: false };
      }
      const table = showCauseListDiv.querySelector("table#tables11");
      return {
        divExists: true,
        tableExists: table !== null,
        divVisible: showCauseListDiv.offsetParent !== null,
        divContentLength: showCauseListDiv.innerHTML.length,
      };
    });
    console.log(
      `[debug] [PHHCCauseListScrapper] #show_causeList info:`,
      JSON.stringify(tableInfo, null, 2)
    );

    const pdfLinks = await extractPdfLinks(page, formData.date, formData.listType);

    const refererUrl = page.url();

    const cookies = await page.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    console.log(
      `[info] [PHHCCauseListScrapper] Extracted ${cookies.length} cookie(s) from session`
    );

    let tableData = [];
    if (pdfLinks.length > 0) {
      tableData = await extractTableData(page);
    } else {
      console.log(
        "[debug] [PHHCCauseListScrapper] Skipping tableData extraction - no PDF links found"
      );
    }

    console.log(
      `[info] [PHHCCauseListScrapper] Scraped ${pdfLinks.length} PDF link(s)`
    );

    return {
      pdfLinks,
      tableData,
      cookies,
      cookieHeader,
      refererUrl,
    };
  } catch (error) {
    console.error(
      "[error] [PHHCCauseListScrapper] Failed to get results:",
      error.message
    );
    throw error;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log(
      "[end] [PHHCCauseListScrapper] Punjab & Haryana High Court cause list scraping completed"
    );
  }
};

/** @deprecated Use PHHCCauseListScrapper — alias kept for existing requires */
const fetchPHHCCauseList = PHHCCauseListScrapper;

module.exports = {
  PHHCCauseListScrapper,
  fetchPHHCCauseList,
};
