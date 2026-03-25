const { connectToDatabase, upsertCaseDetails, closeDatabase } = require('./components/database');
const { initializeBrowser, setupResponseInterceptor } = require('./components/browser');
const { scrapeData } = require('./components/scraper');
const { transformToDatabaseSchema, extractDiaryNumber } = require('./components/utils');

// Database connection handler
const handleDatabaseConnection = async (connectionString) => {
  if (!connectionString) return null;
  try {
    const dbClient = await connectToDatabase(connectionString);
    console.log('✅  Connected to database');
    return dbClient;
  } catch (dbError) {
    console.error('❌  Database setup failed:', dbError.message);
    console.log('⚠️   Continuing without database...');
    return null;
  }
};

// Main district court scraper function (upsert flow: update by caseId or insert new)
const DistrictCourtJudgmentsScrapper = async (date, diaryNumber, courtName, caseTypeValue, courtComplex, caseId, connectionString = null) => {
  console.log(`[start] [DistrictCourtJudgmentsScrapper] Scraping district court judgments`);
  console.log(`[info] [DistrictCourtJudgmentsScrapper] Parameters:`, {
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
    dbClient = await handleDatabaseConnection(connectionString);

    if (!courtName || !courtName.toLowerCase().includes('gurugram')) {
      throw new Error(`District court not yet supported. Currently only Gurugram District Court is supported. Requested: ${courtName}`);
    }

    console.log(`[info] [DistrictCourtJudgmentsScrapper] Using ${courtName} District Court scraper`);

    const browserInstance = await initializeBrowser();
    browser = browserInstance.browser;
    const { page } = browserInstance;
    const responseInterceptor = setupResponseInterceptor(page);

    // Pass null for dbClient so scraper does not insert; we handle upsert/insert here
    const results = await scrapeData(
      page,
      date,
      diaryNumber,
      caseTypeValue,
      courtComplex,
      responseInterceptor,
      null
    );

    if (!results.success || !results.courts || results.courts.length === 0) {
      throw new Error(results.error || 'No case data found in scraping results');
    }

    // Normalize searched diary number for matching (e.g. "123/2026" or "BA/123/2026" -> "123/2026")
    const normalizedSearchDiary = (diaryNumber || '').replace(/^[A-Z]+\//, '').trim();

    // Collect all order rows from all courts that match this case (same diary number)
    const allOrders = [];
    let firstCourt = null;
    let firstCaseTypeNumberYear = null;

    for (const court of results.courts) {
      const courtNameCaption = court.court_name || '';
      const courtCases = court.cases || [];
      for (const caseRow of courtCases) {
        const rowDiary = extractDiaryNumber(caseRow.case_type_number_year);
        const normalizedRowDiary = (rowDiary || '').trim();
        if (normalizedRowDiary && normalizedSearchDiary && normalizedRowDiary === normalizedSearchDiary) {
          if (!firstCourt) firstCourt = court;
          if (!firstCaseTypeNumberYear) firstCaseTypeNumberYear = caseRow.case_type_number_year;
          allOrders.push({
            serial_number: caseRow.serial_number,
            order_date: caseRow.order_date,
            order_type: (caseRow.order_type || '').trim(),
            copy_of_order_url: caseRow.copy_of_order_url || null,
            court_division: courtNameCaption
          });
        }
      }
    }

    if (allOrders.length === 0 || !firstCourt) {
      throw new Error('No case data found in scraping results for diary number: ' + (diaryNumber || ''));
    }

    const searchData = {
      court: 'District Court',
      courtName: courtName || 'Gurugram',
      courtComplex: courtComplex,
      diaryNumberFormatted: diaryNumber,
      caseType: caseTypeValue,
      city: 'Gurugram'
    };

    // Build judgment_url in Supreme Court format: one entry per case with { orders: [...] }
    const sortedDates = allOrders.map(o => o.order_date).filter(Boolean).sort();
    const latestOrderDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : allOrders[0].order_date;

    const ordersForJudgmentUrl = allOrders.map(o => ({
      gcsPath: o.copy_of_order_url || '',
      filename: (o.order_type || '').trim().toLowerCase() || 'copy of order',
      judgmentDate: o.order_date || '',
      courtType: o.court_division || ''
    }));

    const mergedCase = {
      serial_number: allOrders[0].serial_number,
      case_type_number_year: firstCaseTypeNumberYear,
      order_date: latestOrderDate,
      order_type: allOrders[0].order_type,
      copy_of_order_url: allOrders[0].copy_of_order_url,
      judgment_url: { orders: ordersForJudgmentUrl },
      judgment_date: latestOrderDate,
      courtType: results.courts.length > 1 ? 'Multiple' : (firstCourt.court_name || '')
    };

    const scrapedCaseData = transformToDatabaseSchema(mergedCase, firstCourt, searchData);
    scrapedCaseData.date = date;
    scrapedCaseData.updated_at = new Date();

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
        search_parameters: results.search_parameters,
        total_courts: results.courts.length,
        total_cases: cases.length,
        result: scrapedCaseData
      };
    }
  } catch (error) {
    console.error('[error] [DistrictCourtJudgmentsScrapper] Error:', error.message);
    throw error;
  } finally {
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