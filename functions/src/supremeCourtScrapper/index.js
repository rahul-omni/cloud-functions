const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtOTF } = require('../supremeCourtScrapper/supremeCourtOTF');
const { connectToDatabase, insertOrder, updateOrder, markSyncError } = require('./components/db');
const { transformResults } = require('./components/utils');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.supremeCourtOTF = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  console.log("[start] [supremeCourtOTF] scraper service started at:", new Date().toISOString());

  let dbClient = null;

  try {
    
    let body = req.body;
    if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
    }

    // Now extract from parsed body
    const caseType = body?.caseType || "";
    const caseNumber = body?.caseNumber || "";
    const caseYear = body?.caseYear || "";
    const diaryNumber = body?.diaryNumber || "";

    const id = body?.id || "";

    console.log("[info] [supremeCourtOTF] payload body at: diary_number", diaryNumber);
    console.log("[info] [supremeCourtOTF] payload body at: caseType", caseType);
    console.log("[info] [supremeCourtOTF] payload body at: caseNumber", caseNumber);
    console.log("[info] [supremeCourtOTF] payload body at: caseYear", caseYear);

    if(!diaryNumber && !(caseType && caseNumber && caseYear)) {
         throw new Error("Case type, case number and case year are required");
    }
 

    let results = [];

    // Scrape the cases for supreme court and high court
    results = await fetchSupremeCourtOTF(caseType, caseNumber, caseYear, diaryNumber);

    console.log(`[info] [supremeCourtOTF] Scraped ${results}`);
    
    // Transform results to create separate rows for each judgment
    let transformedResults = [];
    try {
        transformedResults = await transformResults(results);
        console.log(`[info] [supremeCourtOTF] Successfully transformed ${results.length} results into ${transformedResults.length} rows`);
    } catch (transformError) {
        console.error('[error] [supremeCourtOTF] Error transforming results:', transformError);
        // Continue with original results if transformation fails
        transformedResults = results;
    }

    // Connect to database
    dbClient = await connectToDatabase();

    if (id) {
      await updateOrder(dbClient, transformedResults, id);
      return res.status(200).json({
        success: true,
        message: "Cron job completed successfully",
        data: transformedResults
      });
    }
    if (transformedResults.length === 0) {
      await markSyncError(dbClient, id);
      return res.status(200).json({
        success: true,
        message: "No new cases to insert",
        data: transformedResults
      });
    }

    //Insert orders into database
    await insertOrder(dbClient, transformedResults);
    
    res.status(200).json({
      success: true,
      message: "Cron job completed successfully",
      data: transformedResults
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

