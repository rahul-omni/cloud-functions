const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { connectToDatabase, insertOrder, checkIfEntryExists, updateJudgmentUrl, findCase, findCaseByDiary } = require('./components/db');
const { fetchSupremeCourtJudgments, fetchSupremeCourtJudgmentsByDateRange } = require("./scCasesUpsert");
const { sendNotifications } = require('./components/notification');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.supremeCourtCasesUpsertNotify = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  console.log("[start] [supremeCourtCasesUpsert] scraper service started at:", new Date().toISOString());

  let dbClient = null;

  try {
    // Parse request body
    let body = req.body;
    if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
    }

    // Extract parameters - support both date range and single date
    const fromDate = body?.fromDate || body?.from_date || null;
    const toDate = body?.toDate || body?.to_date || null;
    const date = body?.date || null; // Legacy single date support

    console.log("[info] [supremeCourtCasesUpsert] payload body - fromDate:", fromDate);
    console.log("[info] [supremeCourtCasesUpsert] payload body - toDate:", toDate);
    console.log("[info] [supremeCourtCasesUpsert] payload body - date:", date);

    // Connect to database
    dbClient = await connectToDatabase();

    // Scrape by date and process all results
    let results = [];
    let scrapeDate = date;

    // Use date range if provided, otherwise fall back to single date or today
    if (fromDate && toDate) {
      // Validate date format (dd-mm-yyyy)
      const dateFormatRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!dateFormatRegex.test(fromDate) || !dateFormatRegex.test(toDate)) {
        throw new Error("Date format must be dd-mm-yyyy (e.g., 01-01-2025)");
      }
      
      console.log(`[info] [supremeCourtCasesUpsertNotify] Using date range: ${fromDate} to ${toDate}`);
      results = await fetchSupremeCourtJudgmentsByDateRange(fromDate, toDate);
      scrapeDate = fromDate; // Use fromDate for processing
    } else if (date) {
      // Legacy single date support
      console.log(`[info] [supremeCourtCasesUpsertNotify] Using single date: ${date}`);
      results = await fetchSupremeCourtJudgments(date);
      scrapeDate = date;
    } else {
      // Default to today if no date provided
      const today = new Date();
      scrapeDate = [
        String(today.getDate()).padStart(2, "0"),
        String(today.getMonth() + 1).padStart(2, "0"),
        today.getFullYear()
      ].join("-");
      console.log(`[info] [supremeCourtCasesUpsertNotify] No date provided, using today: ${scrapeDate}`);
      results = await fetchSupremeCourtJudgmentsByDateRange(scrapeDate, scrapeDate);
    }

    console.log(`[info] [supremeCourtCasesUpsertNotify] Scraped ${results.length} results`);

    if (results.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No new cases found",
        result: []
      });
    }

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
        // await insertOrder(dbClient, {
        //   diary_number: diaryNumber, 
        //   case_number: caseNo, 
        //   parties: `${petitioner} vs ${respondent}`, 
        //   judgment_date: ropDate, 
        //   judgment_url: {orders : [order]}
        // });
        console.log(`[info] [supremeCourtCasesUpsertNotify] New case found: ${diaryNumber} - ${caseNo}`);
      }
    }

    // Process all results (check if exists, insert new or update existing)
    // await processAndInsertResults(dbClient, results, scrapeDate);
    
    res.status(200).json({
      success: true,
      message: "Scraping completed successfully",
      result: results
    });

  } catch (error) {
    console.error('[error] [supremeCourtCasesUpsertNotify] Error during scraping service: ', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    console.log("[end] [supremeCourtCasesUpsertNotify] scraper service ended at:", new Date().toISOString());
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


// Process results and insert/update in database (when no id is provided)
async function processAndInsertResults(dbClient, results, date) {
  console.log(`[processAndInsertResults] Processing ${results.length} results for date ${date}`);
  
  let insertedCount = 0;
  let updatedCount = 0;

  for (const result of results) {
    try {
      const diaryNumber = result.diary_number || '';
      const caseNumber = result.case_number || '';
      const judgmentDate = result.judgment_date || '';
      const judgmentUrl = result.judgment_url && result.judgment_url.length > 0 ? result.judgment_url[0] : '';

      if (!diaryNumber) {
        console.log(`[processAndInsertResults] Skipping result - no diary number`);
        continue;
      }

      // Check if entry exists
      const existingEntry = await checkIfEntryExists(dbClient, diaryNumber, caseNumber);
      
      if (!existingEntry) {
        // New entry - insert
        console.log(`[processAndInsertResults] New entry - inserting: Diary ${diaryNumber}`);
        
        const order = {
          gcsPath: judgmentUrl,
          filename: '',
          judgmentDate: judgmentDate,
        };

        await insertOrder(dbClient, {
          diary_number: diaryNumber,
          case_number: caseNumber,
          parties: result.parties || '',
          advocates: result.advocates || '',
          judgment_date: judgmentDate,
          judgment_url: { orders: [order] },
          bench: result.bench || '',
          case_type: result.case_type || '',
        });

        insertedCount++;
        console.log(`[processAndInsertResults] ✅ Inserted new case: ${diaryNumber}`);
      } else {
        // Entry exists - check if judgment date needs to be added
        console.log(`[processAndInsertResults] Entry exists - checking judgment date: Diary ${diaryNumber}`);
        
        let updatedOrder = existingEntry.judgment_url || { orders: [] };
        let existsInOrders = false;

        // Check if judgment date already exists
        for (const order of updatedOrder.orders) {
          if (order.judgmentDate === judgmentDate) {
            console.log(`[processAndInsertResults] Judgment date ${judgmentDate} already exists. Skipping.`);
            existsInOrders = true;
            break;
          }
        }

        if (!existsInOrders && judgmentDate && judgmentUrl) {
          const order = {
            gcsPath: judgmentUrl,
            filename: '',
            judgmentDate: judgmentDate,
          };
          updatedOrder.orders.push(order);
          
          const sync_site = date ? 0 : 1; // 0 if date provided (manual), 1 if automatic
          await updateJudgmentUrl(dbClient, existingEntry.id, updatedOrder, sync_site);
          updatedCount++;
          console.log(`[processAndInsertResults] ✅ Updated existing case: ${diaryNumber} with new judgment ${judgmentDate}`);
          
          // Send notifications after judgment URL is updated (similar to highCourtCasesUpsert)
          if (date !== null) {
            try {
              // Get judgment URL - use the provided URL
              const notificationUrl = judgmentUrl || 'https://portal.vakeelassist.com/cases';
              
              await sendNotifications(
                dbClient,
                diaryNumber,
                result.case_type || null,
                "Supreme Court",          // court name (matches case_details.court value)
                result.city || null,      // city
                result.district || null,  // district
                judgmentDate,             // judgment date
                notificationUrl           // judgment URL
              );
              console.log(`✅ [processAndInsertResults] Notifications sent for diary ${diaryNumber}`);
            } catch (notificationError) {
              console.error(`❌ [processAndInsertResults] Failed to send notifications for ${diaryNumber}:`, notificationError.message);
              // Don't throw - continue processing other entries even if notification fails
            }
          }
        }
      }
    } catch (error) {
      console.error(`[processAndInsertResults] ❌ Error processing result:`, error.message);
      // Continue with next result
    }
  }

  console.log(`[processAndInsertResults] Summary: ${insertedCount} inserted, ${updatedCount} updated`);
}

