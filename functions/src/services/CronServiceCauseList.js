const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const axios = require('axios');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

const courtsNoList = [
    "1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","21"
];

const causelistTypeList = [
    "Misc. Court",
    "Regular Court",
    "Single Judge List",
    "Chamber Court",
    "Review",
    "Registrar Court"
]

// const courtsNoList = [
//     "3"
// ]

// const causelistTypeList = [
//     "Misc. Court",
//     "Regular Court",
//     "Single Judge List",
// ]


/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.cronForSCCauseList = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  const now = new Date();
  console.log("[start] [cronForSCCauseList] scraper service started at:", now.toISOString());

  try {
    // Get date from request or use tomorrow's date
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = req?.query?.date || formatDate(tomorrow);
    const court = req?.query?.court || "supremeCourt";

    const formData = {
        "listType": "daily",
        "searchBy": "court",
        "listingDate": date,
        "mainAndSupplementry": "both"
    }
    



    // Scrape the cases for supreme court and high court

    if(court === "supremeCourt"){
        const results = [];
        const errors = [];
        const totalCombinations = courtsNoList.length * causelistTypeList.length;
        let completedCombinations = 0;
        
        console.log(`[info] [cronForSCCauseList] Starting processing of ${totalCombinations} combinations`);
        
        for(let i = 0; i < courtsNoList.length; i++){
            for(let j = 0; j < causelistTypeList.length; j++){
                completedCombinations++;
                console.log(`[progress] [cronForSCCauseList] Processing ${completedCombinations}/${totalCombinations}: Court ${courtsNoList[i]}, Type ${causelistTypeList[j]}`);
                const currentFormData = {
                    ...formData,
                    court: courtsNoList[i],
                    causelistType: causelistTypeList[j]
                };
                
                try {
                    console.log(`[debug] [cronForSCCauseList] Calling API for payload`, currentFormData);
                    
                    // Call the scCauseListScrapper API
                    const response = await axios.post(
                        'https://asia-south1-booming-order-465208-t8.cloudfunctions.net/scCauseListScrapper',
                        currentFormData,
                        {
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            timeout: 180000 // 3 minutes timeout per request
                        }
                    );
                    
                    if (response.data.success) {
                        results.push({
                            court: courtsNoList[i],
                            causelistType: causelistTypeList[j],
                            inserted: response.data.inserted,
                            skipped: response.data.skipped,
                            errors: response.data.errors,
                            data: response.data.data
                        });
                        console.log(`[success] [cronForSCCauseList] Court ${courtsNoList[i]}, Type ${causelistTypeList[j]}: Inserted ${response.data.inserted}, Skipped ${response.data.skipped}`);
                    } else {
                        errors.push({
                            court: courtsNoList[i],
                            causelistType: causelistTypeList[j],
                            error: response.data.error || 'Unknown error'
                        });
                        console.log(`[error] [cronForSCCauseList] Court ${courtsNoList[i]}, Type ${causelistTypeList[j]}: ${response.data.error}`);
                    }
                } catch (apiError) {
                    errors.push({
                        court: courtsNoList[i],
                        causelistType: causelistTypeList[j],
                        error: apiError.message
                    });
                    console.error(`[error] [cronForSCCauseList] API call failed for court ${courtsNoList[i]}, type ${causelistTypeList[j]}:`, apiError.message);
                }
                
                // Add a delay between API calls to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`[info] [cronForSCCauseList] Completed processing. Total results: ${results.length}, Total errors: ${errors.length}`);
        
        res.status(200).json({
            success: true,
            message: "Cron job completed successfully",
            date: date,
            results: results,
            errors: errors,
            summary: {
                totalCombinations: courtsNoList.length * causelistTypeList.length,
                successful: results.length,
                failed: errors.length
            }
        });
        
    }else if(court === "highCourt"){
      //   const results = await fetchHighCourtJudgments(date);
      console.log("[info] [scrapeCases] High Court Scraping completed successfully");
      res.status(200).json({
        success: true,
        message: "High Court Scraping completed successfully",
        date: date
      });
    }else{
      throw new Error("[error] [scrapeCases] Invalid court");
    }

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