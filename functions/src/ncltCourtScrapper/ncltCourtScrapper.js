// MINIMAL IMPORTS AT MODULE LEVEL TO AVOID INITIALIZATION TIMEOUT
const functions = require('firebase-functions');

// Extract all PDF URLs from listing history for database storage
function extractPdfUrlsFromListingHistory(listingHistory) {
  const pdfUrls = [];
  const seenUrls = new Set();
  
  if (!Array.isArray(listingHistory)) {
    return [];
  }
  
  listingHistory.forEach(entry => {
    // Check pdfLinks array first (preferred)
    if (entry.pdfLinks && Array.isArray(entry.pdfLinks)) {
      entry.pdfLinks.forEach(pdfLink => {
        if (pdfLink.url && !seenUrls.has(pdfLink.url)) {
          seenUrls.add(pdfLink.url);
          pdfUrls.push(pdfLink.url);
        }
      });
    } 
    // Fallback to pdfUrl if no pdfLinks
    else if (entry.pdfUrl && !seenUrls.has(entry.pdfUrl)) {
      seenUrls.add(entry.pdfUrl);
      pdfUrls.push(entry.pdfUrl);
    }
  });
  
  console.log(`[database] Extracted ${pdfUrls.length} unique PDF URLs from ${listingHistory.length} listing history entries`);
  
  if (pdfUrls.length > 0) {
    console.log(`[database] First PDF URL: ${pdfUrls[0]}`);
  } else {
    console.log(`[database] ⚠️ No PDF URLs found in listing history`);
  }
  
  return pdfUrls;
}

// Database connection handler with enhanced error handling
const handleDatabaseConnection = async (databaseModule) => {
  console.log('[database] 🔗 handleDatabaseConnection called');
  
  try {
    const { connectToDatabase } = databaseModule;
    
    console.log('[database] 🔄 Attempting database connection...');
    const dbClient = await connectToDatabase();
    
    if (dbClient) {
      console.log('[database] ✅ Connected to NCLT database successfully');
      // Test the connection with a simple query
      try {
        await dbClient.query('SELECT 1');
        console.log('[database] ✅ Database connection test successful');
        return dbClient;
      } catch (testError) {
        console.error('[database] ❌ Database connection test failed:', testError.message);
        await dbClient.end();
        return null;
      }
    } else {
      console.log('[database] ❌ Database client is null');
      return null;
    }
  } catch (dbError) {
    console.error('[database] ❌ Database setup failed:', dbError.message);
    console.log('[database] ⚠️ Continuing without database...');
    return null;
  }
};

// Transform NCLT results to standard format
const transformNCLTResults = (results) => {
  if (!results.success) {
    throw new Error(results.error || 'NCLT scraping failed');
  }

  console.log(`[success] Found ${results.totalRecords} NCLT records`);
  
  return {
    success: true,
    court_name: 'Nclt Court',
    search_parameters: {
      bench: results.bench,
      case_type: results.caseType,
      diary_number: results.diaryNumber,
      year: results.year,
      search_timestamp: new Date().toISOString()
    },
    total_records: results.totalRecords,
    data: results.data || [],
    message: results.message || `NCLT scraping completed successfully`,
    search_timestamp: new Date().toISOString(),
    judgments: results.data || []
  };
};

// Main NCLT court scraper function - OPTIMIZED FOR DEPLOYMENT
const NCLTCourtJudgmentsScrapper = async (searchParams) => {
  console.log(`[start] [NCLTCourtJudgmentsScrapper] Scraping NCLT court judgments`);
  
  // LAZY LOAD ALL DEPENDENCIES INSIDE THE FUNCTION
  console.log('[info] Loading NCLT dependencies...');
  const databaseModule = require('./components/database');
  const browserModule = require('./components/browser');
  // const scraperModule = require('./components/scraper');
  console.log('[info] All NCLT dependencies loaded successfully');
  
  const { connectToDatabase, closeDatabase, bulkInsertOrders } = databaseModule;
  const { 
    createBrowser, 
    closeBrowser, 
    navigateToNCLTPage, 
    fillNCLTForm, 
    submitNCLTForm, 
    checkForResults,
    getPageInfo,
    extractTableData,
    handleNCLTCaptcha,
    processDetailLinks,
    extractCaseDetails,
    extractSearchResults,
    convertPayloadTextToValues
  } = browserModule;
   
  // Extract parameters from payload object
  const {
    bench,
    caseType,
    diaryNumber,
    year,
    court,
    captchaText = null
  } = searchParams;
  
  const cpNo = diaryNumber;
  
  console.log(`[info] [NCLTCourtJudgmentsScrapper] Parameters:`, {
    bench, caseType, cpNo: diaryNumber, year, court,
    captcha: captchaText ? '***provided***' : 'will auto-solve'
  });

  let dbClient = null;
  let browser = null;
  let page = null;

  try {
    // Connect to database
    console.log('[database] 🔗 About to call handleDatabaseConnection...');
    dbClient = await handleDatabaseConnection(databaseModule);
    
    if (dbClient) {
      console.log('[database] ✅ Database connection established successfully');
    } else {
      console.log('[database] ❌ Database connection failed - proceeding without database');
    }

    // Validate required parameters
    if (!bench) {
      throw new Error('NCLT Bench is required');
    }

    if (!diaryNumber && !caseType && !year) {
      throw new Error('At least one search parameter (diaryNumber, caseType, or year) is required');
    }

    console.log(`[info] [NCLTCourtJudgmentsScrapper] Using NCLT bench: ${bench}`);
    
    // Convert text-based parameters to values if needed
    console.log('[info] Converting payload text to values...');
    const convertedParams = convertPayloadTextToValues({
        bench: bench,
        case_type: caseType,
        cp_no: diaryNumber,
        year: year
    });
    console.log('[info] Payload conversion completed:', convertedParams);
    
    // Create browser instance
    browser = await createBrowser();
    page = await browser.newPage();
    
    // Set page configurations
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Step 1: Navigate to NCLT website
    console.log('[step 1] Navigating to NCLT website...');
    await navigateToNCLTPage(page);
    await getPageInfo(page);

    // Step 2: Fill the search form
    console.log('[step 2] Filling NCLT search form...');
    await fillNCLTForm(page, convertedParams.bench, convertedParams.case_type, convertedParams.cp_no, convertedParams.year);

    // Step 3: Handle captcha
    console.log('[step 3] Auto-handling captcha...');
     
         
    // Step 3: Handle captcha with improved timeout handling
    console.log('[step 3] Auto-handling captcha...');
    let captchaSolved = false;
    let captchaAttempts = 0;
    const maxCaptchaAttempts = 2; // Reduced attempts to avoid timeouts

    while (!captchaSolved && captchaAttempts < maxCaptchaAttempts) {
      captchaAttempts++;
      console.log(`[step 3] Captcha attempt ${captchaAttempts}/${maxCaptchaAttempts}`);
      
      try {
        // Check if captcha is present
        const captchaPresent = await page.evaluate(() => {
          const captchaInput = document.querySelector('input[name*="captcha"], input[placeholder*="captcha"], input[placeholder*="Captcha"], input[name="txtInput"]');
          const captchaImage = document.querySelector('img[src*="captcha"], img[alt*="captcha"]') || 
                              document.querySelector('img');
          return {
            hasInput: !!captchaInput,
            hasImage: !!captchaImage,
            imageSrc: captchaImage ? captchaImage.src : null
          };
        });
        
        if (captchaPresent.hasInput && captchaPresent.hasImage) {
          console.log('[step 3] Captcha detected, attempting to solve...');
          
          const captchaResult = await handleNCLTCaptcha(page, captchaText);
          
          if (captchaResult) {
            console.log('[step 3] ✅ Captcha solved successfully');
            captchaSolved = true;
          } else {
            console.log('[step 3] ❌ Captcha solving failed');
            
            if (captchaAttempts < maxCaptchaAttempts) {
              console.log('[step 3] Refreshing page for retry...');
              
              try {
                // FIXED: Use goto instead of reload with better timeout handling
                await page.goto(page.url(), { 
                  waitUntil: 'networkidle2', 
                  timeout: 60000 // 60 second timeout
                });
                
                console.log('[step 3] ✅ Page refreshed successfully');
                await page.waitForTimeout(3000); // Wait for page to settle
                
                // Re-fill the form after refresh
                await fillNCLTForm(page, convertedParams.bench, convertedParams.case_type, convertedParams.cp_no, convertedParams.year);
                console.log('[step 3] ✅ Form re-filled after refresh');
                
              } catch (refreshError) {
                console.log('[step 3] ❌ Page refresh failed:', refreshError.message);
                // Don't break the loop, try to continue
              }
            }
          }
        } else {
          console.log('[step 3] No captcha detected - proceeding without captcha');
          captchaSolved = true;
        }
        
      } catch (captchaError) {
        console.log(`[step 3] Captcha attempt ${captchaAttempts} failed:`, captchaError.message);
        
        if (captchaAttempts >= maxCaptchaAttempts) {
          console.log('[step 3] ⚠️ Max captcha attempts reached - proceeding anyway');
          captchaSolved = true; // Force proceed to avoid infinite loop
        }
      }
    }

    if (!captchaSolved) {
      console.log('[step 3] ⚠️ Could not solve captcha - proceeding with form submission anyway');
    }
    // Step 4: Submit the form
    console.log('[step 4] Submitting NCLT search form...');
    const formSubmitted = await submitNCLTForm(page, convertedParams);
    
    if (!formSubmitted.success) {
        console.log('⚠️ Form submission failed, trying to continue with legacy extraction...');
    }

    // Step 5: Check for results
    console.log('[step 5] Checking for search results...');
    const resultCheck = await checkForResults(page);
    
    if (resultCheck.errorType === 'NO_CASE_FOUND') {
        console.log('[result] No NCLT records found - case does not exist');
        return {
            success: false,
            message: resultCheck.message || 'This case number or diary number does not exist. Please check and try again.',
            errorType: 'NO_CASE_FOUND',
            court_name: 'Nclt Court',
            total_records: 0,
            data: [],
            judgments: []
        };
    }
    
    if (!resultCheck.success) {
        throw new Error(`Failed to check results: ${resultCheck.error || 'Unknown error'}`);
    }

    if (!resultCheck.hasResults) {
        console.log('[result] No NCLT records found for search criteria');
        
        return {
            success: false,
            message: 'No NCLT records found for the given search criteria',
            totalRecords: 0,
            data: [],
            errorType: 'NO_CASE_FOUND',
            court_name: 'Nclt Court',
            judgments: []
        };
    }

    // Step 6: Extract table data and process detail links
    console.log('[step 6] Extracting NCLT case data from table...');
    
    const tableData = await extractTableData(page);
    
    if (!tableData || tableData.length === 0) {
        console.log('⚠️ No table data found, trying legacy extraction...');
        
        const extractionResults = await extractSearchResults(page);
        
        if (!extractionResults.success) {
            throw new Error(`Failed to extract NCLT data: ${extractionResults.error}`);
        }

        console.log(`✅ Successfully extracted ${extractionResults.totalRecords} NCLT cases (legacy method)`);

        const finalResults = {
            success: true,
            message: `Successfully extracted ${extractionResults.totalRecords} NCLT cases`,
            totalRecords: extractionResults.totalRecords,
            data: extractionResults.data,
            bench,
            caseType,
            diaryNumber: diaryNumber,
            year
        };

        const transformedResults = transformNCLTResults(finalResults);
        
        console.log(`[success] NCLT scraping completed successfully - ${transformedResults.total_records} records found`);
        return transformedResults;
    }

    console.log(`✅ Found ${tableData.length} cases in results table`);

    // Process detail links
    console.log('[step 7] Processing status links for detailed case information...');
    const detailedCases = await processDetailLinks(page, tableData);

    console.log(`✅ Extracted detailed info for ${detailedCases.length} cases`);

    // Combine table data with detailed cases
    const allCases = [...tableData];
    
    detailedCases.forEach(detailedCase => {
        const basicIndex = allCases.findIndex(basic => 
            basic.filingNumber === detailedCase.filingNumber ||
            basic.caseNumber === detailedCase.caseNumber ||
            basic.rowIndex === detailedCase.rowIndex
        );
        
        if (basicIndex >= 0) {
            allCases[basicIndex] = detailedCase;
        } else {
            allCases.push(detailedCase);
        }
    });

    console.log(`✅ Total cases processed: ${allCases.length} (${detailedCases.length} with detailed info)`);

    // Save to database if available
    console.log(`[database] Database saving check:`, {
        hasDbClient: !!dbClient,
        allCasesLength: allCases.length,
        willAttemptSave: !!(dbClient && allCases.length > 0)
    });
    
    if (dbClient && allCases.length > 0) {
        console.log(`[database] ✅ Starting database save process for ${allCases.length} records...`);
        
        try {
            const dbFormattedCases = allCases.map(caseData => {
                const extractedPdfUrls = extractPdfUrlsFromListingHistory(caseData.listingHistory || []);
                const combinedDiaryNumber = diaryNumber && year ? `${diaryNumber}/${year}` : '';
                
                console.log(`[database] 📄 Case ${caseData.filingNumber}: extracted ${extractedPdfUrls.length} PDF URLs from ${caseData.listingHistory?.length || 0} listing entries`);
                
                return {
                    serialNumber: caseData.serialNumber || '',
                    diaryNumber: combinedDiaryNumber,
                    caseNumber: caseData.caseNumber || '',
                    parties: caseData.partyName || caseData.petitionerVsRespondent || '',
                    advocates: caseData.petitionerAdvocate || '',
                    bench: bench || '',
                    court: 'NCLT',
                    case_type: caseType || '',
                    city: '',
                    district: '',
                    judgmentDate: caseData.filingDate || caseData.listingDate || null,
                    judgmentUrl: extractedPdfUrls,
                    judgmentText: [],
                    judgment_type: caseData.status || 'Pending',
                    filingNumber: caseData.filingNumber || '',
                    filingDate: caseData.filingDate || '',
                    partyName: caseData.partyName || caseData.petitionerVsRespondent || '',
                    petitionerAdvocate: caseData.petitionerAdvocate || '',
                    respondentAdvocate: caseData.respondentAdvocate || '',
                    registeredOn: caseData.registeredOn || '',
                    lastListed: caseData.lastListed || caseData.listingDate || '',
                    nextListingDate: caseData.nextListingDate || '',
                    caseStatus: caseData.status || caseData.caseStatus || '',
                    orderDetails: caseData.orderDetails || [],
                    allParties: caseData.allParties || [],
                    listingHistory: caseData.listingHistory || [],
                    file_path: ''
                };
            });
            
            console.log(`[database] 🔄 Calling bulkInsertOrders for ${dbFormattedCases.length} formatted cases...`);
            
            const insertResult = await bulkInsertOrders(dbClient, dbFormattedCases);
            
            console.log(`[database] ✅ Bulk insert completed:`, {
                totalInserted: insertResult.totalInserted,
                errors: insertResult.errors?.length || 0
            });
            
        } catch (dbError) {
            console.error(`[database] ❌ Bulk insert failed:`, dbError.message);
        }
    }

    // Prepare final results
    const finalResults = {
        success: true,
        message: `Successfully extracted ${allCases.length} NCLT cases (${detailedCases.length} with detailed info)`,
        totalRecords: allCases.length,
        data: allCases,
        bench,
        caseType,
        diaryNumber: diaryNumber && year ? `${diaryNumber}/${year}` : diaryNumber,
        cpNo: diaryNumber,
        year
    };

    const transformedResults = transformNCLTResults(finalResults);
    
    console.log(`[success] NCLT scraping completed successfully - ${transformedResults.total_records} records found`);
    return transformedResults;
    
  } catch (error) {
    console.error('[error] [NCLTCourtJudgmentsScrapper] Error:', error.message);
    throw error;
  } finally {
    // Cleanup resources
    try {
      if (page) {
        await page.close();
        console.log("[cleanup] Page closed");
      }
      
      if (browser) {
        await closeBrowser(browser);
        console.log("[cleanup] Browser closed");
      }
      
      if (dbClient) {
        await closeDatabase(dbClient);
        console.log("[cleanup] Database connection closed");
      }
    } catch (cleanupError) {
      console.error('[cleanup] Error during cleanup:', cleanupError.message);
    }
    
    console.log("[end] [NCLTCourtJudgmentsScrapper] NCLT Court Scraping completed");
  }
};

module.exports = {
  NCLTCourtJudgmentsScrapper
};