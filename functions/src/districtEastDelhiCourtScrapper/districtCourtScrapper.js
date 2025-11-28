const { connectToDatabase,upsertCaseDetails, closeDatabase } = require('./components/database');
const { initializeBrowser, setupResponseInterceptor } = require('./components/browser');
const { scrapeData } = require('./components/scraper');
const { transformToDatabaseSchema } = require('./components/utils');

// Database connection handler
const handleDatabaseConnection = async () => {
  try {
    const dbClient = await connectToDatabase();
    console.log('✅  Connected to database');
    return dbClient;
  } catch (dbError) {
    console.error('❌  Database setup failed:', dbError.message);
    console.log('⚠️   Continuing without database...');
    return null;
  }
};

// Helper function to safely extract case data
const extractCaseData = (caseItem, courtInfo) => {
  return {
    serial_number: caseItem.serial_number || '',
    case_number: caseItem.case_type_number_year || '',
    parties: caseItem.parties || '',
    case_stage: caseItem.stage || '',
    next_hearing: caseItem.next_hearing || '',
    order_date: caseItem.order_date || '',
    order_type: caseItem.order_type || '',
    judgment_url: caseItem.copy_of_order_url || null,
    court_name: courtInfo.court_name || '',
    establishment_code: courtInfo.establishment_code || '',
    details_url: caseItem.details_url || ''
  };
};

// Main district court scraper function
const EastDelhiDistrictCourtScrapper = async (date, diaryNumber, courtName, caseTypeValue, courtComplex , caseId) => {
  console.log(`[start] [EastDelhiDistrictCourtScrapper] Scraping district court judgments`);
  console.log(`[info] [EastDelhiDistrictCourtScrapper] Parameters:`, {
   
    date,
    diaryNumber,
    courtName,
    caseTypeValue,
    courtComplex,
    caseId
  });

  let dbClient = null;
  let browser = null;

  try {
    // Connect to database
    dbClient = await handleDatabaseConnection();

    // Validate court name is provided
    if (!courtName) {
      throw new Error(`Court name is required. Please provide a valid Delhi District Court name.`);
    }

    console.log(`[info] [EastDelhiDistrictCourtScrapper] Using ${courtName} District Court scraper`);
    
    // Initialize browser
    const browserInstance = await initializeBrowser();
    browser = browserInstance.browser;
    const { page } = browserInstance;
    
    // Setup response interceptor for AJAX requests
    const responseInterceptor = setupResponseInterceptor(page);

    // Scrape data using the flexible scrapeData function
    // ⭐ Pass null for dbClient to prevent scraper from inserting - we'll handle it here
        const results = await scrapeData(
          page, 
          date, 
          diaryNumber, 
          caseTypeValue, 
          courtComplex,
          courtName, 
          responseInterceptor, 
          null  // ⭐ Pass null instead of dbClient to prevent duplicate inserts
        );

        // Transform raw data into final format using the same function as scraper
        console.log(`[transform] Transforming scraped data...`);
        console.log(`[transform] results structure:`, {
            success: results.success,
            casesLength: results.cases?.length,
            firstCourtCases: results.cases?.[0]?.cases?.length,
            casesKeys: results.cases?.[0] ? Object.keys(results.cases[0]) : []
        });
        
        // Get the first case from results
        // The structure is: results.cases[courtIndex].cases[caseIndex]
        let firstCase = results.cases?.[0]?.cases?.[0];
        
        // If not found, try the flat structure: results.cases[0]
        if (!firstCase && results.cases?.[0]) {
            console.log(`[transform] Trying flat structure...`);
            firstCase = results.cases[0];
        }
        
        if (!firstCase) {
            console.error('[transform] Available data structure:', JSON.stringify(results, null, 2).substring(0, 500));
            throw new Error('No case data found in scraping results');
        }
        
        console.log(`[transform] Found case data with keys:`, Object.keys(firstCase));
        
        // Build searchData object to pass courtName and other parameters
        const searchData = {
            court: 'District Court',
            courtName: courtName,  // This will be used as district
            courtComplex: courtComplex,
            diaryNumberFormatted: diaryNumber,
            caseType: caseTypeValue
        };
        
        console.log(`[transform] searchData:`, searchData);
        
        // Use the same transformation function as the scraper
        const scrapedCaseData = transformToDatabaseSchema(
            firstCase,
            {
                court_name: courtName,
                establishment_code: 'DLET01'
            },
            searchData
        );
        
        // Override date field with the input date parameter
        scrapedCaseData.date = date;
        scrapedCaseData.updated_at = new Date();

console.log(`[transform] scrapedCaseData created with:`, {
    case_number: scrapedCaseData.case_number,
    diary_number: scrapedCaseData.diary_number,
    district: scrapedCaseData.district,
    court: scrapedCaseData.court,
    case_type: scrapedCaseData.case_type,
    parties: scrapedCaseData.parties ? scrapedCaseData.parties.substring(0, 50) + '...' : null
});

// ⭐ If caseId exists, UPDATE the case; otherwise INSERT new case
if (caseId && dbClient) {
    console.log(`[database] Updating existing case with ID: ${caseId}`);
    await upsertCaseDetails(dbClient, caseId, scrapedCaseData);
    console.log(`✅  Case ${caseId} updated successfully with scraped data`);
    
    return {
        success: true,
        message: 'Case updated successfully',
        caseId: caseId,
        updated: true
    };
} else if (dbClient) {
    console.log(`[database] No caseId provided, inserting new case`);
    const { bulkInsertOrders } = require('./components/database');
    await bulkInsertOrders(dbClient, [scrapedCaseData]);
    console.log(`✅  New case inserted successfully`);
    
    return {
        success: true,
        message: 'New case created successfully',
        inserted: true
    };
} else {
    console.log(`⚠️  No database connection, returning scraped data only`);
    return {
        success: true,
        court_name: courtName,
        search_parameters: {
            search_type: 'case_number',
            search_data: {
                caseNumber: diaryNumber?.split('/')[0],
                caseYear: diaryNumber?.split('/')[1],
                caseType: caseTypeValue,
                courtComplex: courtComplex
            },
            search_timestamp: new Date().toISOString(),
            court_name: courtName
        },
        total_courts: results.cases?.length || 0,
        total_cases: results.cases?.reduce((acc, court) => acc + (court.cases?.length || 0), 0) || 0,
        judgments: results.cases?.flatMap(court => 
            (court.cases || []).map(caseItem => ({
                serial_number: caseItem.serial_number || '',
                case_number: caseItem.case_type_number_year || '',
                parties: caseItem.parties || '',
                case_stage: caseItem.stage || '',
                next_hearing: caseItem.next_hearing || '',
                order_date: caseItem.order_date || '',
                order_type: caseItem.order_type || '',
                judgment_url: caseItem.copy_of_order_url || null,
                court_name: court.court_name || '',
                establishment_code: court.establishment_code || '',
                details_url: caseItem.details_url || ''
            }))
        ) || []
    };
}
    
  } catch (error) {
    console.error('[error] [EastDelhiDistrictCourtScrapper] Error:', error.message);
    throw error;
  } finally {
    // Cleanup resources
    if (browser) {
      await browser.close();
      console.log("[cleanup] Browser closed");
    }
    
    await closeDatabase(dbClient);
    console.log("[end] [EastDelhiDistrictCourtScrapper] District Court Scraping completed");
  }
};

module.exports = {
  EastDelhiDistrictCourtScrapper
};