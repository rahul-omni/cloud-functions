const { connectToDatabase, closeDatabase } = require('./components/database');
const { initializeBrowser, setupResponseInterceptor } = require('./components/browser');
const { scrapeData } = require('./components/scraper');

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
const EastDelhiDistrictCourtScrapper = async (date, diaryNumber, courtName, caseTypeValue, courtComplex) => {
  console.log(`[start] [EastDelhiDistrictCourtScrapper] Scraping district court judgments`);
  console.log(`[info] [EastDelhiDistrictCourtScrapper] Parameters:`, {
    date,
    diaryNumber,
    courtName,
    caseTypeValue,
    courtComplex
  });

  let dbClient = null;
  let browser = null;

  try {
    // Connect to database
    dbClient = await handleDatabaseConnection();

    // Validate court support
    if (!courtName || !courtName.toLowerCase().includes('East District Court, Delhi'.toLowerCase())) {
      throw new Error(`District court not yet supported. Currently only'East District Court, Delhi'is supported. Requested: ${courtName}`);
    }

    console.log(`[info] [EastDelhiDistrictCourtScrapper] Using ${courtName} District Court scraper`);
    
    // Initialize browser
    const browserInstance = await initializeBrowser();
    browser = browserInstance.browser;
    const { page } = browserInstance;
    
    // Setup response interceptor for AJAX requests
    const responseInterceptor = setupResponseInterceptor(page);

    // Scrape data using the flexible scrapeData function
        const results = await scrapeData(
          page, 
          date, 
          diaryNumber, 
          caseTypeValue, 
          courtComplex, 
          responseInterceptor, 
          dbClient
        );

        // Transform raw data into final format
        const transformedData = {
            success: true,
            court_name: 'East District Court, Delhi',
            search_parameters: {
                search_type: results.search_parameters?.search_type || 'case_number',
                search_data: results.search_parameters?.search_data || {
                    caseNumber: diaryNumber?.split('/')[0],
                    caseYear: diaryNumber?.split('/')[1],
                    caseType: caseTypeValue,
                    courtComplex: courtComplex
                },
                search_timestamp: new Date().toISOString(),
                court_name: 'East District Court, Delhi'
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

        return transformedData;
    
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