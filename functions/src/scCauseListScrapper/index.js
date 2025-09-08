const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');
const { insertCauselistFiles } = require('./components/db');
const { pdfScrapperCauseList } = require('./pdfScrapperCauseList');
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


  const date = new Date();
  const formattedDate = date.toISOString().split('T')[0];
  try {
    // Get date from request
    const listType = req?.body?.listType || "daily";
    const searchBy = req?.body?.searchBy || "court";
    const causelistType = req?.body?.causelistType || "Miscellaneous List";
    const listingDate = req?.body?.listingDate || formattedDate;
    const mainAndSupplementry = req?.body?.mainAndSupplementry || "Both";
    
    let results = [];

    // Create form data object for the new flexible structure
    const formData = {
      listType,
      searchBy,
      causelistType,
      listingDate,
      mainAndSupplementry,
      // Add conditional fields based on searchBy
      ...(searchBy === 'court' && { court: req?.body?.court }),
      ...(searchBy === 'judge' && { judge: req?.body?.judge }),
      ...(searchBy === 'aor_code' && { aorCode: req?.body?.aorCode }),
      ...(searchBy === 'party_name' && { partyName: req?.body?.partyName }),
      // Add date range fields if provided
      ...(req?.body?.listingDateFrom && { listingDateFrom: req?.body?.listingDateFrom }),
      ...(req?.body?.listingDateTo && { listingDateTo: req?.body?.listingDateTo })
    };

    console.log("[debug] [scCauseListScrapper] Form data:", formData);

    results = await fetchSupremeCourtCauseList(formData);

    if(results.length === 0) {
       return res.status(200).json({
        success: true,
        message: "No results found",
        data: []
       });
    } else {
      // Extract PDF content for each PDF link found
      const pdfExtractionResults = [];
    
      for (const row of results) {
        if (row.causeListLinks && row.causeListLinks.length > 0) {
          console.log(`[debug] [scCauseListScrapper] Processing PDF: ${row.causeListLinks[0].url}`);
          
          const pdfResult = await pdfScrapperCauseList(row.causeListLinks[0].url);
          pdfExtractionResults.push({
            serialNumber: row["Serial Number"],
            file: row["File"],
            pdfResult: pdfResult
          });
        }
      }
      // if (results[0].causeListLinks && results[0].causeListLinks.length > 0) {
      //       console.log(`[debug] [scCauseListScrapper] Processing PDF: ${results[0].causeListLinks[0].url}`);
            
      //       const pdfResult = await pdfScrapperCauseList(results[0].causeListLinks[0].url);
      //       pdfExtractionResults.push({
      //         serialNumber: results[0]["Serial Number"],
      //         file: results[0]["File"],
      //         pdfResult: pdfResult
      //       });
      //     }

      
      // const { inserted, skipped, errors } = await insertCauselistFiles(results, formData);
      // console.log("[debug] [scCauseListScrapper] Inserted:", inserted);
      // console.log("[debug] [scCauseListScrapper] Errors:", errors);
      // console.log("[debug] [scCauseListScrapper] Skipped:", skipped);
      
      return res.status(200).json({
        success: true,
        message: "Cron job completed successfully",
        pdfExtractionResults: pdfExtractionResults,
        // dbResult: { inserted, skipped, errors }
      });
    }

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

