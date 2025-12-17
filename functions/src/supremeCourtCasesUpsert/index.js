const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtOTF } = require('./addCases');
const { connectToDatabase, insertOrder, updateOrder, markSyncError, findCase, findCaseByDiary } = require('./components/db');
const { transformResults } = require('./components/utils');
const { fetchSupremeCourtJudgments } = require("./scCasesUpsert");

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.supremeCourtCasesUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  console.log("[start] [supremeCourtCasesUpsert] scraper service started at:", new Date().toISOString());

  let dbClient = await connectToDatabase();

  try {
    // Now extract from parsed body

    let body = req.body;

    let date = body?.date || null;

    if (!date) {
      const today = new Date();
      date = [
        String(today.getDate()).padStart(2, "0"),
        String(today.getMonth() + 1).padStart(2, "0"),
        today.getFullYear()
      ].join("-");
    }

    console.log("[info] [supremeCourtCasesUpsert] payload body at: date", date);
 
    let results = [];

    // Scrape the cases for supreme court and high court
    results = await fetchSupremeCourtJudgments(date);

    console.log(`[info] [supremeCourtCasesUpsert] Scraped ${results}`);
    
    // Transform results to create separate rows for each judgment
    for (const result of results) {
      const {diary, caseNo, petitioner, respondent, ropDate, ropURL} = result;
      const diaryNumber = diary.replace('-', '/').trim();
      const checkIfExists = (caseNo == null || caseNo.length == 0)
        ? await findCaseByDiary(dbClient, diaryNumber)
        : await findCase(dbClient, caseNo);
      const order = {
        judgmentDate: ropDate,
        gcsPath: ropURL,
        fileName: ropURL,
      }
      if (!checkIfExists) {
        await insertOrder(dbClient, {
          diary_number: diaryNumber, 
          case_number: caseNo, 
          parties: `${petitioner} vs ${respondent}`, 
          judgment_date: ropDate, 
          judgment_url: {orders : [order]}
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: "Cron job completed successfully",
      data: results
    });

  } catch (error) {
    console.error('[error] [scrapeCases] Error during scraping service: ', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    console.log("[end] [scrapeCases] scraper service ended at:", new Date().toISOString());
    if (dbClient) {
      try {
        await dbClient.end();
        console.log("Database connection closed successfully");
      } catch (dbError) {
        console.error("Error closing database connection:", dbError);
      }
    }
  }
});

