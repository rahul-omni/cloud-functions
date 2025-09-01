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

// Flatten courts structure to single judgments array
const flattenCourtsToJudgments = (courts) => {
  const allJudgments = [];
  
  courts.forEach(court => {
    court.cases.forEach(caseItem => {
      allJudgments.push({
        serial_number: caseItem.serial_number,
        case_details: caseItem.case_type_number_year,
        order_date: caseItem.order_date,
        order_type: caseItem.order_type,
        pdf_url: caseItem.copy_of_order_url,
        has_pdf: !!caseItem.copy_of_order_url,
        court_name: court.court_name,
        establishment_code: court.establishment_code
      });
    });
  });
  
  return allJudgments;
};

// Data transformation function
const transformResults = (results) => {
  if (!results.success) {
    throw new Error(results.error || 'Scraping failed');
  }

  console.log(`[success] Found ${results.total_cases_found} cases across ${results.total_courts_found} court divisions`);
  
  // Flatten the courts structure to a single judgments array
  const allJudgments = flattenCourtsToJudgments(results.courts);
  
  return {
    success: true,
    court_name: 'Gurugram District Court',
    search_parameters: results.search_parameters,
    total_courts: results.total_courts_found,
    total_cases: results.total_cases_found,
    search_timestamp: results.search_parameters.search_timestamp,
    judgments: allJudgments // Flat array instead of nested courts
  };
};

// Main district court scraper function
const DistrictCourtJudgmentsScrapper = async (date, diaryNumber, courtName, caseTypeValue, courtComplex) => {
  console.log(`[start] [DistrictCourtJudgmentsScrapper] Scraping district court judgments`);
  console.log(`[info] [DistrictCourtJudgmentsScrapper] Parameters:`, {
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
    if (!courtName || !courtName.toLowerCase().includes('gurugram')) {
      throw new Error(`District court not yet supported. Currently only Gurugram District Court is supported. Requested: ${courtName}`);
    }

    console.log(`[info] [DistrictCourtJudgmentsScrapper] Using ${courtName} District Court scraper`);
    
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

    // Transform the data to match expected format
    return transformResults(results);
    
  } catch (error) {
    console.error('[error] [DistrictCourtJudgmentsScrapper] Error:', error.message);
    throw error;
  } finally {
    // Cleanup resources
    if (browser) {
      await browser.close();
      console.log("[cleanup] Browser closed");
    }
    
    await closeDatabase(dbClient);
    console.log("[end] [DistrictCourtJudgmentsScrapper] District Court Scraping completed");
  }
};

module.exports = {
  DistrictCourtJudgmentsScrapper
};