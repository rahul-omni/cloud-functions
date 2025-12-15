const { connectToDatabase, closeDatabase } = require('./components/database');
const { initializeBrowser, setupResponseInterceptor } = require('./components/browser');
const { scrapeCauseListData } = require('./components/scraper');

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

// Flatten courts structure to single cause list array
const flattenCourtsToCauseList = (courts) => {
  const allCauseList = [];
  
  courts.forEach(court => {
    court.cases.forEach(caseItem => {
      allCauseList.push({
        serial_number: caseItem.serial_number,
        case_details: caseItem.case_details,
        case_type: caseItem.case_type,
        case_number: caseItem.case_number,
        case_year: caseItem.case_year,
        petitioner: caseItem.petitioner,
        respondent: caseItem.respondent,
        advocate_petitioner: caseItem.advocate_petitioner,
        advocate_respondent: caseItem.advocate_respondent,
        case_status: caseItem.case_status,
        next_hearing_date: caseItem.next_hearing_date,
        court_name: court.court_name,
        establishment_code: court.establishment_code
      });
    });
  });
  
  return allCauseList;
};

// Data transformation function
const transformResults = (results) => {
  if (!results.success) {
    throw new Error(results.error || 'Cause list scraping failed');
  }

  console.log(`[success] Found ${results.total_cases_found} cases across ${results.total_courts_found} court divisions`);
  
  // Flatten the courts structure to a single cause list array
  const allCauseList = flattenCourtsToCauseList(results.courts);
  
  return {
    success: true,
    court_name: 'Gurugram District Court',
    search_parameters: results.search_parameters,
    total_courts: results.total_courts_found,
    total_cases: results.total_cases_found,
    search_timestamp: results.search_parameters.search_timestamp,
    cause_list: allCauseList // Flat array instead of nested courts
  };
};

// Main district court cause list scraper function
const DistrictCourtCauseListScrapper = async (causeListDate, courtComplex, courtEstablishment, courtNumber, causeType) => {
  console.log(`[start] [DistrictCourtCauseListScrapper] Scraping district court cause list`);
  console.log(`[info] [DistrictCourtCauseListScrapper] Parameters:`, {
    causeListDate,
    courtComplex,
    courtEstablishment,
    courtNumber,
    causeType
  });

  let dbClient = null;
  let browser = null;

  try {
    // Skip database connection for now
    console.log('[info] Skipping database connection - returning scraped data only');
    dbClient = null;

    // Validate court support
    if (!courtComplex && !courtEstablishment) {
      throw new Error('Either court complex or court establishment must be specified');
    }

    console.log(`[info] [DistrictCourtCauseListScrapper] Using Gurugram District Court cause list scraper`);
    
    // Initialize browser
    const browserInstance = await initializeBrowser();
    browser = browserInstance.browser;
    const { page } = browserInstance;
    
    // Setup response interceptor for AJAX requests
    const responseInterceptor = setupResponseInterceptor(page);

    // Scrape cause list data using the flexible scrapeCauseListData function
    const results = await scrapeCauseListData(
      page, 
      causeListDate, 
      courtComplex, 
      courtEstablishment, 
      courtNumber, 
      causeType, 
      responseInterceptor, 
      dbClient
    );

    // Transform the data to match expected format
    return transformResults(results);
    
  } catch (error) {
    console.error('[error] [DistrictCourtCauseListScrapper] Error:', error.message);
    throw error;
  } finally {
    // Cleanup resources
    if (browser) {
      await browser.close();
      console.log("[cleanup] Browser closed");
    }
    
    // Skip database cleanup since we're not using database
    console.log("[end] [DistrictCourtCauseListScrapper] District Court Cause List Scraping completed");
  }
};

module.exports = {
  DistrictCourtCauseListScrapper
};
