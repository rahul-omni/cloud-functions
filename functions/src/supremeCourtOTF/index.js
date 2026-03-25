const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { getOpenAiKeyFromSecretManager } = require('../config/getOpenAiKeyFromSecretManager');
const { getRequiredDatabaseUrl } = require('../util/requireParam');
const { fetchSupremeCourtOTF } = require('./supremeCourtOTF');
const { connectToDatabase, updateOrder, markSyncError } = require('./components/db');
const { transformResults } = require('./components/utils');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

const LOG_PREFIX = 'supremeCourtOTF';

/**
 * HTTP Cloud Function for scraping Supreme Court cases.
 * - OpenAI API key: from Secret Manager (reusable getOpenAiKeyFromSecretManager).
 * - Database URL: from param DATABASE_URL (reusable requireParam).
 */
exports.supremeCourtOTF = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  console.log("[start] [supremeCourtOTF] scraper service started at:", new Date().toISOString());

  let dbClient = null;
  let id = "";

  let databaseUrl;
  try {
    databaseUrl = getRequiredDatabaseUrl();
  } catch (e) {
    console.error('[error] [supremeCourtOTF] Failed to get database URL:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }

  let openAiKey;
  try {
    openAiKey = await getOpenAiKeyFromSecretManager(undefined, undefined, LOG_PREFIX);
  } catch (err) {
    console.error('[error] [supremeCourtOTF] Failed to read OpenAI key from Secret Manager (V2):', err.message, 'code:', err.code, 'details:', err.details || err.response);
    if (err.stack) console.error('[error] [supremeCourtOTF] stack:', err.stack);
    return res.status(500).json({
      success: false,
      error: 'Failed to read OpenAI key from Secret Manager.'
    });
  }

  try {
    let body = req.body;
    if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
    }

    // Now extract from parsed body (support both diaryNumber and diary_number for app/website compatibility)
    const caseType = body?.caseType || "";
    const caseNumber = body?.caseNumber || "";
    const caseYear = body?.caseYear || "";
    const diaryNumber = body?.diaryNumber || body?.diary_number || "";

    id = body?.id || "";

    console.log("[info] [supremeCourtOTF] payload body at: diary_number", diaryNumber);
    console.log("[info] [supremeCourtOTF] payload body at: caseType", caseType);
    console.log("[info] [supremeCourtOTF] payload body at: caseNumber", caseNumber);
    console.log("[info] [supremeCourtOTF] payload body at: caseYear", caseYear);

    if(!diaryNumber && !(caseType && caseNumber && caseYear)) {
         throw new Error("Case type, case number and case year are required");
    }
 

    let results = [];

    // Scrape the cases for supreme court and high court (params passed in)
    results = await fetchSupremeCourtOTF(caseType, caseNumber, caseYear, diaryNumber, openAiKey);

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

    // Connect to database using param (not functions.config())
    dbClient = await connectToDatabase({ connectionString: databaseUrl });

    if (id) {

      console.log("[info] [supremeCourtOTF] id found, updating order", id);
      
      // When no results found, mark case as sync error (same as highCourtCasesUpsert)
      if (!transformedResults || transformedResults.length === 0) {
        await markSyncError(dbClient, id);
        return res.status(200).json({
          success: true,
          message: "No results found; case marked as sync error (site_sync = 2)",
          data: []
        });
      }
      await updateOrder(dbClient, transformedResults, id);
      return res.status(200).json({
        success: true,
        message: "Cron job completed successfully",
        data: transformedResults
      });
    }

    if (transformedResults.length === 0) {
      return res.status(200).json({ 
        success: true,
        message: "No new cases to insert",
        data: transformedResults
      });
    }


    res.status(200).json({
      success: true,
      message: "Cron job completed successfully",
      data: transformedResults
    });

  } catch (error) {
    console.error('[error] [scrapeCases] Error during scraping service: ', error);
    // When id is provided, mark case as sync error (same as highCourtCasesUpsert)
    if (id) {
      try {
        const errDbClient = dbClient || await connectToDatabase({ connectionString: databaseUrl });
        await markSyncError(errDbClient, id);
        if (!dbClient && errDbClient) {
          await errDbClient.end();
        }
      } catch (markError) {
        console.error('[error] [supremeCourtOTF] Failed to mark sync error:', markError);
      }
    }
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

