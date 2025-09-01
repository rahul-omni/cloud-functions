const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.scCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  console.log("[start] [scCauseListScrapper] scraper service started at:", new Date().toISOString());

  let dbClient = null;

  try {
    // Get date from request or use current date
    const listType = req?.body?.listType || "";
    const searchBy = req?.body?.searchBy || "all_courts";
    const causelistType = req?.body?.causelistType || "";
    const listingDate = req?.body?.listingDate || "";
    const mainAndSupplementry = req?.body?.mainAndSupplementry || "";


      
    
    let results = [];

    // Scrape the cases for supreme court and high court

    results = await fetchSupremeCourtCauseList(listType, searchBy, causelistType, listingDate, mainAndSupplementry);


    
    res.status(200).json({
      success: true,
      message: "Cron job completed successfully",
      data: results
    });

  } catch (error) {
    console.error('[error] [scCauseListScrapper] Error during scraping service: ', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    console.log("[end] [scCauseListScrapper] scraper service ended at:", new Date().toISOString());
    
  }
  
});

