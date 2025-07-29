const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { processJudgmentNotifications } = require('../services/notification.service');
const { fetchSupremeCourtJudgments } = require('../supremeCourtScrapper/supremeCourtScrapper');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.scrapeCases = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  const now = new Date();
  console.log("[start] [scrapeCases] scraper service started at:", now.toISOString());

  try {
    // Get date from request or use current date
    const date = req?.query?.date || formatDate(new Date());
    const court = req?.query?.court || "supremeCourt";


    let results = [];

    // Scrape the cases for supreme court and high court

    if(court === "supremeCourt"){
     results = await fetchSupremeCourtJudgments(date);
    }else if(court === "highCourt"){
      //   const results = await fetchHighCourtJudgments(date);
      console.log("[info] [scrapeCases] High Court Scraping completed successfully");
    }else{
      throw new Error("[error] [scrapeCases] Invalid court");
    }

    let notifications = [];
    // Process notifications for the scraped judgments
    try {
      notifications = await processJudgmentNotifications(results);
    } catch (error) {
      console.error('[error] [scrapeCases] Failed to process notifications:', error.message);
      throw error;
    }

    const data = {
      scrapeCases: results,
      notifications: notifications
    }
    
    res.status(200).json({
      success: true,
      message: "Cron job completed successfully",
      date: date,
      data: data
    });

  } catch (error) {
    console.error('[error] [scrapeCases] Error during scraping service: ', date, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    console.log("[end] [scrapeCases] scraper service ended at:", new Date().toISOString());
  }
});

// Helper function to format date as DD-MM-YYYY
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
} 