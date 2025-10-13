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
        } else if (pdfLink.href && !seenUrls.has(pdfLink.href)) {
          seenUrls.add(pdfLink.href);
          pdfUrls.push(pdfLink.href);
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

 

// Main NCLT court scraper function - UPDATED WITH TESTFORM.JS LOGIC
const NCLTCourtJudgmentsScrapper = async (searchParams) => {
  const requestId = Math.random().toString(36).substring(2, 15);
  console.log(`[${requestId}] [start] [NCLTCourtJudgmentsScrapper] Starting NCLT scraping...`);
  
  // LAZY LOAD ALL DEPENDENCIES INSIDE THE FUNCTION
  console.log(`[${requestId}] [info] Loading NCLT dependencies...`);
  const databaseModule = require('./components/database');
  const browserModule = require('./components/browser');
  console.log(`[${requestId}] [info] All NCLT dependencies loaded successfully`);
  
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
    convertPayloadTextToValues,
    // NEW: Enhanced functions from testform.js logic
    extractCompleteNCLTData
  } = browserModule;
   
  // Extract parameters from payload object with enhanced handling
  const {
    bench,
    caseType,
    case_type,
    diaryNumber,
    cp_no,
    year,
    court,
    captchaText = null
  } = searchParams;
  
  // Handle different parameter formats (like your testform.js)
  const finalCaseType = caseType || case_type;
  const finalDiaryNumber = diaryNumber || cp_no;
  
  console.log(`[${requestId}] [info] Original parameters:`, searchParams);
  console.log(`[${requestId}] [info] Processed parameters:`, {
    bench, 
    caseType: finalCaseType, 
    diaryNumber: finalDiaryNumber, 
    year, 
    court,
    captcha: captchaText ? '***provided***' : 'will auto-solve'
  });

  let dbClient = null;
  let browser = null;
  let page = null;

  try {
    // Convert text-based payload to value-based payload (from testform.js)
    let convertedParams;
    try {
      convertedParams = convertPayloadTextToValues({
        bench: bench,
        case_type: finalCaseType,
        cp_no: finalDiaryNumber,
        year: year
      });
      console.log(`[${requestId}] 🔄 Converted search parameters:`, convertedParams);
    } catch (conversionError) {
      console.error(`[${requestId}] ❌ Payload conversion failed:`, conversionError.message);
      throw conversionError;
    }

    // Connect to database
    console.log(`[${requestId}] [database] 🔗 About to call handleDatabaseConnection...`);
    dbClient = await handleDatabaseConnection(databaseModule);
    
    if (dbClient) {
      console.log(`[${requestId}] [database] ✅ Database connection established successfully`);
    } else {
      console.log(`[${requestId}] [database] ❌ Database connection failed - proceeding without database`);
    }

    // Validate required parameters
    if (!bench) {
      throw new Error('NCLT Bench is required');
    }

    if (!finalDiaryNumber && !finalCaseType && !year) {
      throw new Error('At least one search parameter (diaryNumber, caseType, or year) is required');
    }

    console.log(`[${requestId}] [info] Using NCLT bench: ${bench}`);
    
    // Create browser instance with enhanced settings (from testform.js)
    console.log(`[${requestId}] [step 1] Creating browser instance...`);
    browser = await createBrowser();
    page = await browser.newPage();
    
    // Enhanced page setup (from testform.js)
    await page.setViewport({ width: 1366, height: 768 });
    await page.setDefaultNavigationTimeout(300000); // 5 minutes
    await page.setDefaultTimeout(300000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block unnecessary resources for faster loading (from testform.js)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Step 1: Navigate to NCLT website
    console.log(`[${requestId}] [step 2] Navigating to NCLT website...`);
    await navigateToNCLTPage(page);
    await getPageInfo(page);

    // Step 2: Fill the search form
    console.log(`[${requestId}] [step 3] Filling search form...`);
    await fillNCLTForm(page, convertedParams.bench, convertedParams.case_type, convertedParams.cp_no, convertedParams.year);

    // Step 3: Handle captcha with enhanced logic
    console.log(`[${requestId}] [step 4] Handling captcha...`);
    const captchaSuccess = await handleNCLTCaptcha(page, captchaText);
    if (captchaSuccess) {
      console.log(`[${requestId}] [step 4] ✅ Captcha solved successfully`);
    } else {
      console.log(`[${requestId}] [step 4] ⚠️ Captcha solving failed, continuing anyway`);
    }

    // Step 4: Submit the form with enhanced logic
    console.log(`[${requestId}] [step 5] Submitting search form...`);
    const submitResult = await submitNCLTForm(page, convertedParams);
    
    if (!submitResult.success) {
      throw new Error(`Form submission failed: ${submitResult.error}`);
    }

    // Step 5: Check for results with enhanced logic
    console.log(`[${requestId}] [step 6] Checking for search results...`);
    const resultsCheck = await checkForResults(page);
    
    if (!resultsCheck.hasResults) {
      console.log(`[${requestId}] [result] No NCLT records found - case does not exist`);
      return {
        success: true,
        total_records: 0,
        data: [],
        message: 'No records found for the provided search criteria',
        search_parameters: {
          original: searchParams,
          converted: convertedParams
        },
        error_type: resultsCheck.errorType || 'NO_CASE_FOUND'
      };
    }

    // Step 6: Extract comprehensive case data using testform.js logic
    console.log(`[${requestId}] [step 7] Extracting comprehensive case data...`);
    const extractedData = await extractCompleteNCLTData(page);
     console.log(`[${requestId}] [step 8] Processing extracted data...`);
    
    if (!extractedData || extractedData.length === 0) {
      console.log(`[${requestId}] [result] No data extracted from results page`);
      return {
        success: true,
        total_records: 0,
        data: [],
        message: 'Results page found but no data could be extracted',
        search_parameters: {
          original: searchParams,
          converted: convertedParams
        }
      };
    }
 
    // DEBUG: Analyze extracted data structure
    // Replace the debugExtractedData call section (around line 175) with this:

    // DEBUG: Analyze extracted data structure - FIXED
    console.log(`[${requestId}] 🔍 DEBUG: About to analyze extracted data...`);
    console.log(`[${requestId}] 📊 DEBUG: extractedData type:`, typeof extractedData);
    console.log(`[${requestId}] 📊 DEBUG: extractedData length:`, Array.isArray(extractedData) ? extractedData.length : 'Not an array');
    
    if (extractedData && Array.isArray(extractedData) && extractedData.length > 0) {
        console.log(`[${requestId}] 📊 DEBUG: First case structure:`, JSON.stringify(extractedData[0], null, 2));
        
        // Call the debug function
        await debugExtractedData(extractedData, requestId);
    } else {
        console.log(`[${requestId}] ❌ DEBUG: No extracted data to analyze`);
    }
   console.log(`[${requestId}] 💾 Starting data processing and database insertion...`);

// CREATE ORIGINAL PAYLOAD OBJECT with the original values (not converted)
const originalPayload = {
    bench: bench, // "Mumbai" (original from payload)
    case_type: finalCaseType, // "CP(AA) Merger and Amalgamation(Companies Act)" (original from payload)
    caseType: finalCaseType, // Same as above
    cp_no: finalDiaryNumber, // "146" (original from payload)
    year: year, // "2022" (original from payload)
    court: court, // "Nclt Court" (original from payload)
    diaryNumber: finalDiaryNumber // "146" (original from payload)
};

console.log(`[${requestId}] 💾 ABOUT TO CALL processExtractedData...`);
console.log(`[${requestId}] 🔍 Parameters being passed:`, {
    extractedDataLength: extractedData ? extractedData.length : 0,
    originalPayloadKeys: Object.keys(originalPayload),
    hasDbClient: !!dbClient,
    requestId: requestId
});

     const processedData = await processExtractedData(extractedData, originalPayload, dbClient, requestId);

console.log(`[${requestId}] ✅ processExtractedData COMPLETED`);
console.log(`[${requestId}] 📊 Processed data length:`, processedData ? processedData.length : 0);
    const totalRecords = processedData.length;
    const totalPDFs = processedData.reduce((sum, record) => sum + (record.detailedCaseInfo?.pdfLinks?.length || 0), 0);

    console.log(`[${requestId}] ✅ NCLT scraping completed successfully`);
    console.log(`[${requestId}] 📊 Total cases: ${totalRecords}, Total PDFs: ${totalPDFs}`);

    return {
      success: true,
      total_records: totalRecords,
      data: processedData,
      message: 'NCLT scraping completed successfully',
      search_parameters: {
        original: searchParams,
        converted: convertedParams
      },
      extraction_metadata: {
        total_cases: totalRecords,
        total_pdf_links: totalPDFs,
        extraction_timestamp: new Date().toISOString()
      },
      pdf_count: totalPDFs
    };
    
  } catch (error) {
    console.error(`[${requestId}] ❌ NCLT scraping failed:`, error.message);
    throw error;
  } finally {
    // Cleanup resources
    try {
      if (page) {
        await page.close();
        console.log(`[${requestId}] [cleanup] Page closed`);
      }
      
      if (browser) {
        await closeBrowser(browser);
        console.log(`[${requestId}] [cleanup] Browser closed`);
      }
      
      if (dbClient) {
        await closeDatabase(dbClient);
        console.log(`[${requestId}] [cleanup] Database connection closed`);
      }
    } catch (cleanupError) {
      console.error(`[${requestId}] [cleanup] Error during cleanup:`, cleanupError.message);
    }
    
    console.log(`[${requestId}] [end] [NCLTCourtJudgmentsScrapper] NCLT Court Scraping completed`);
  }
};

  // Replace the processExtractedData function with this FIXED version that uses original payload values:

 async function processExtractedData1(extractedData, searchParams, dbClient, requestId) {
    console.log(`[${requestId}] 📊 Processing extracted data for database insertion...`);
    console.log(`[${requestId}] 🔍 Extracted data structure:`, {
        totalCases: extractedData.length,
        sampleKeys: extractedData[0] ? Object.keys(extractedData[0]) : [],
        hasSearchResult: extractedData[0] ? !!extractedData[0].searchResult : false,
        hasDetailedInfo: extractedData[0] ? !!extractedData[0].detailedCaseInfo : false
    });
    
    const processedData = [];
    
    // ENHANCED: Process each case for database insertion
    for (let i = 0; i < extractedData.length; i++) {
        const caseData = extractedData[i];
        
        console.log(`[${requestId}] 💾 Processing case ${i + 1}/${extractedData.length} for database...`);
        
        // Extract data from both searchResult and detailedCaseInfo
        const searchResult = caseData.searchResult || {};
        const detailedInfo = caseData.detailedCaseInfo || {};
        const basicInfo = detailedInfo.basicCaseInfo || {};
        
        // ENHANCED PDF URL EXTRACTION - Extract all PDF URLs properly
        console.log(`[${requestId}] 🔍 DEBUG: Extracting PDF URLs...`);
        let allPdfUrls = [];
        
        // Method 1: Extract from pdfLinks array
        if (detailedInfo.pdfLinks && Array.isArray(detailedInfo.pdfLinks)) {
            console.log(`[${requestId}] 📎 Found ${detailedInfo.pdfLinks.length} PDF links in detailedInfo.pdfLinks`);
            detailedInfo.pdfLinks.forEach((pdfLink, index) => {
                const url = pdfLink.href || pdfLink.url || pdfLink.link;
                if (url) {
                    allPdfUrls.push(url);
                    console.log(`[${requestId}] 📄 PDF ${index + 1}: ${url.substring(0, 80)}...`);
                }
            });
        }
        
        // Method 2: Extract from listing history
        if (detailedInfo.listingHistory && Array.isArray(detailedInfo.listingHistory)) {
            console.log(`[${requestId}] 📋 Checking ${detailedInfo.listingHistory.length} listing history entries for PDF URLs...`);
            detailedInfo.listingHistory.forEach((entry, entryIndex) => {
                if (entry.pdfLinks && Array.isArray(entry.pdfLinks)) {
                    entry.pdfLinks.forEach((pdfLink, linkIndex) => {
                        const url = pdfLink.href || pdfLink.url || pdfLink.link;
                        if (url && !allPdfUrls.includes(url)) {
                            allPdfUrls.push(url);
                            console.log(`[${requestId}] 📄 PDF from listing ${entryIndex + 1}.${linkIndex + 1}: ${url.substring(0, 80)}...`);
                        }
                    });
                } else if (entry.pdfUrl && !allPdfUrls.includes(entry.pdfUrl)) {
                    allPdfUrls.push(entry.pdfUrl);
                    console.log(`[${requestId}] 📄 PDF from listing ${entryIndex + 1}: ${entry.pdfUrl.substring(0, 80)}...`);
                }
            });
        }
        
        // Method 3: Check for any other PDF URL fields
        if (caseData.pdfUrls && Array.isArray(caseData.pdfUrls)) {
            caseData.pdfUrls.forEach(url => {
                if (url && !allPdfUrls.includes(url)) {
                    allPdfUrls.push(url);
                }
            });
        }
        
        // Remove duplicates and filter valid URLs
        const uniquePdfUrls = [...new Set(allPdfUrls)].filter(url => 
            url && typeof url === 'string' && url.trim() !== '' && url.startsWith('http')
        );
        
        console.log(`[${requestId}] 📊 PDF URL extraction summary:`, {
            totalFound: allPdfUrls.length,
            uniqueUrls: uniquePdfUrls.length,
            sampleUrls: uniquePdfUrls.slice(0, 3).map(url => url.substring(0, 80) + '...')
        });
        
        // ENHANCED: Extract data from the actual scraped content with better validation
        const extractedParties = basicInfo['Party Name'] || searchResult.partyName || '';
        const extractedFilingNumber = basicInfo['Filing Number'] || basicInfo['Filing No'] || searchResult.filingNumber || '';
        const extractedCaseNumber = basicInfo['Case Number'] || basicInfo['Case No'] || searchResult.caseNumber || '';
        const extractedFilingDate = basicInfo['Filing Date'] || searchResult.filingDate || '';
        const extractedRegisteredOn = basicInfo['Registered On'] || searchResult.registeredOn || '';
        const extractedLastListed = basicInfo['Last Listed'] || searchResult.lastListed || '';
        const extractedNextListingDate = basicInfo['Next Listing Date'] || searchResult.nextListingDate || '';
        const extractedCaseStatus = basicInfo['Case Status'] || searchResult.caseStatus || 'Pending';
        const extractedPetitionerAdvocate = basicInfo['Petitioner Advocate(s)'] || searchResult.petitionerAdvocate || '';
        const extractedRespondentAdvocate = basicInfo['Respondent Advocate(s)'] || searchResult.respondentAdvocate || '';

        console.log(`[${requestId}] 🔍 ENHANCED Field extraction with validation:`, {
            'Available basicInfo keys': Object.keys(basicInfo),
            'Available searchResult keys': Object.keys(searchResult),
            'Extracted values from NCLT website': {
                'Filing Number': extractedFilingNumber,
                'Case Number': extractedCaseNumber,
                'Party Name': extractedParties,
                'Filing Date': extractedFilingDate,
                'Registered On': extractedRegisteredOn,
                'Last Listed': extractedLastListed,
                'Next Listing Date': extractedNextListingDate,
                'Case Status': extractedCaseStatus,
                'Petitioner Advocate(s)': extractedPetitionerAdvocate
            }
        });

        // Validate that we have actual extracted data
        const hasExtractedData = extractedFilingNumber || extractedCaseNumber || extractedParties;
        console.log(`[${requestId}] ✅ Has extracted data: ${hasExtractedData}`);

        if (!hasExtractedData) {
            console.log(`[${requestId}] ⚠️ No data extracted from NCLT website, using fallback values`);
            console.log(`[${requestId}] 📋 Full basicInfo for debugging:`, JSON.stringify(basicInfo, null, 2));
            console.log(`[${requestId}] 📋 Full searchResult for debugging:`, JSON.stringify(searchResult, null, 2));
            console.log(`[${requestId}] 📋 Full detailedInfo for debugging:`, JSON.stringify(detailedInfo, null, 2));
        }
        
        // Log the full basicInfo to see what fields are actually available
        console.log(`[${requestId}] 📋 Full basicInfo content:`, basicInfo);
        
        // CORRECTED: Transform data for database with ORIGINAL PAYLOAD VALUES
       // Replace the database record mapping section with this CORRECTED version:

        // CORRECTED: Transform data for database - Use ONLY extracted values, no hardcoded fallbacks
        const dbRecord = {
            // Basic identifiers - Use search params as fallback
            serialNumber: i + 1,
            diaryNumber: `${searchParams.cp_no}/${searchParams.year}`, // Will be "146/2022"
            
            // FIXED: Use ONLY extracted filing number from NCLT website, no hardcoded fallback
            filingNumber: extractedFilingNumber || '', // Use "2709137035552022" from NCLT or empty string
            
            // FIXED: Use ONLY extracted case number from NCLT website, no hardcoded fallback
            caseNumber: extractedCaseNumber || '', // Use "CP(CAA) - 146/2022" from NCLT or empty string
            
            // Party information - Map from extracted data only
            parties: extractedParties || '',
            partyName: extractedParties || '',
            advocates: extractedPetitionerAdvocate || '',
            petitionerAdvocate: extractedPetitionerAdvocate || '',
            respondentAdvocate: extractedRespondentAdvocate || '',
            
            // FIXED: Use ORIGINAL payload values for bench and case_type
            bench: searchParams.bench || '', // This should be "Mumbai" (original payload)
            benchName: searchParams.bench || '',
            court: searchParams.court || 'NCLT Court', // Use original court from payload
            courtType: 'NCLT',
            city: searchParams.bench || '', // This should be "Mumbai" (original)
            district: '',
            
            // Dates - Use ONLY extracted dates from NCLT website
            judgmentDate: extractedFilingDate || extractedRegisteredOn || null,
            filingDate: extractedFilingDate || '', // Use "25-06-2022" from NCLT or empty string
            registeredOn: extractedRegisteredOn || '', // Use "20-07-2022" from NCLT or empty string
            lastListed: extractedLastListed || '', // Use "13-08-2025" from NCLT or empty string
            nextListingDate: extractedNextListingDate || '', // Use "15-10-2025" from NCLT or empty string
            
            // FIXED: Use ORIGINAL case_type from payload
            caseType: searchParams.case_type || searchParams.caseType || '', // Original payload value
            case_type: searchParams.case_type || searchParams.caseType || '', // Original payload value
            caseStatus: extractedCaseStatus || 'Pending',
            
            // PDF and document links - Use extracted PDF URLs
            judgmentUrl: uniquePdfUrls, // All extracted PDF URLs from NCLT website
            pdfLinks: detailedInfo.pdfLinks || [],
            
            // Additional data
            judgmentText: [],
            judgmentType: extractedCaseStatus || 'Pending',
            judgment_type: extractedCaseStatus || 'Pending',
            filePath: '',
            file_path: '',
            
            // JSON fields - Use extracted listing history
            orderDetails: detailedInfo.listingHistory || [],
            allParties: extractedParties ? [extractedParties] : [],
            listingHistory: detailedInfo.listingHistory || [],
            listingEntries: detailedInfo.listingHistory || [],
            
            // Additional fields
            courtComplex: null
        };
        
        // ENHANCED LOGGING to show what values are actually being used
        console.log(`[${requestId}] 🔍 DETAILED field mapping debug:`, {
            'Original searchParams passed': {
                bench: searchParams.bench,
                case_type: searchParams.case_type,
                caseType: searchParams.caseType,
                cp_no: searchParams.cp_no,
                year: searchParams.year,
                court: searchParams.court
            },
            'Extracted from NCLT website': {
                extractedFilingNumber,
                extractedCaseNumber,
                extractedParties: extractedParties?.substring(0, 30) + '...',
                extractedFilingDate,
                extractedPetitionerAdvocate
            },
            'Final database values': {
                diaryNumber: dbRecord.diaryNumber,
                filingNumber: dbRecord.filingNumber,
                caseNumber: dbRecord.caseNumber,
                bench: dbRecord.bench,
                court: dbRecord.court,
                caseType: dbRecord.caseType?.substring(0, 50) + '...',
                parties: dbRecord.parties?.substring(0, 30) + '...'
            }
        });
        
        console.log(`[${requestId}] 📋 FIXED Mapped database record using ORIGINAL payload values:`, {
            diaryNumber: dbRecord.diaryNumber,
            caseNumber: dbRecord.caseNumber,
            filingNumber: dbRecord.filingNumber, // Should show "2709137035552022" if extracted
            parties: dbRecord.parties?.substring(0, 50) + '...',
            bench: dbRecord.bench, // Should show "Mumbai" (original payload)
            court: dbRecord.court,
            city: dbRecord.city, // Should show "Mumbai" (original payload)
            caseType: dbRecord.caseType?.substring(0, 50) + '...', // Should show "CP(AA) Merger and Amalgamation..." (original payload)
            filingDate: dbRecord.filingDate, // Should show extracted date from NCLT
            registeredOn: dbRecord.registeredOn, // Should show extracted date from NCLT
            lastListed: dbRecord.lastListed, // Should show extracted date from NCLT
            nextListingDate: dbRecord.nextListingDate, // Should show extracted date from NCLT
            caseStatus: dbRecord.caseStatus,
            petitionerAdvocate: dbRecord.petitionerAdvocate, // Should show "MADHURI PANDEY" if extracted
            pdfUrlCount: dbRecord.judgmentUrl.length,
            listingCount: dbRecord.listingHistory.length
        });
        
        // Log the first few PDF URLs for verification
        if (dbRecord.judgmentUrl.length > 0) {
            console.log(`[${requestId}] 📄 Sample PDF URLs being saved:`);
            dbRecord.judgmentUrl.slice(0, 5).forEach((url, index) => {
                console.log(`[${requestId}]   ${index + 1}. ${url}`);
            });
        } else {
            console.log(`[${requestId}] ⚠️ No PDF URLs found for this case`);
        }
        
        // ENHANCED: Store in database - Always attempt insertion if we have basic data
        const hasValidData = dbRecord.diaryNumber && dbRecord.bench && dbClient;
        
        console.log(`[${requestId}] 🔍 Database insertion validation:`, {
            hasDbClient: !!dbClient,
            diaryNumber: dbRecord.diaryNumber,
            bench: dbRecord.bench,
            court: dbRecord.court,
            hasValidData,
            willInsert: hasValidData
        });
        
        if (hasValidData) {
            try {
                console.log(`[${requestId}] 💾 Inserting case ${i + 1} into database with ORIGINAL payload values...`);
                console.log(`[${requestId}] 📊 Final record to insert with CORRECT values:`, {
                    diaryNumber: dbRecord.diaryNumber,
                    filingNumber: dbRecord.filingNumber, // Should be "2709137035552022" from NCLT extraction
                    caseNumber: dbRecord.caseNumber, // Should be "CP(CAA) - 146/2022" from NCLT extraction
                    parties: dbRecord.parties?.substring(0, 50) + '...', // Should be extracted party name
                    bench: dbRecord.bench, // Should be "Mumbai" from original payload
                    court: dbRecord.court,
                    caseType: dbRecord.caseType?.substring(0, 50) + '...', // Should be "CP(AA) Merger and Amalgamation..." from original payload
                    filingDate: dbRecord.filingDate, // Should be "25-06-2022" from NCLT
                    caseStatus: dbRecord.caseStatus,
                    pdfCount: dbRecord.judgmentUrl.length
                });
                
                // Import the database module INSIDE the function
                const { insertOrder } = require('./components/database');
                
                const insertResult = await insertOrder(dbClient, dbRecord);
                
                if (insertResult) {
                    console.log(`[${requestId}] ✅ Case ${i + 1} successfully inserted with ID: ${insertResult}`);
                    console.log(`[${requestId}] 📊 Successfully saved complete case data with ORIGINAL payload values`);
                } else {
                    console.log(`[${requestId}] ⚠️ Case ${i + 1} insertion returned null`);
                }
                
            } catch (dbError) {
                console.error(`[${requestId}] ❌ Database insertion failed for case ${i + 1}:`, dbError.message);
                console.error(`[${requestId}] 📊 Error details:`, dbError);
            }
        } else {
            console.log(`[${requestId}] ⚠️ Skipping database insertion - missing required data:`, {
                hasDbClient: !!dbClient,
                diaryNumber: dbRecord.diaryNumber,
                bench: dbRecord.bench
            });
        }
        
        // Create the processed case for return - ENHANCED
        const transformedCase = {
            searchResult: caseData.searchResult,
            detailedCaseInfo: caseData.detailedCaseInfo,
            extractedAt: caseData.extractedAt || new Date().toISOString(),
            
            // Add standardized fields for response using EXTRACTED and ORIGINAL values
            filing_number: dbRecord.filingNumber, // Should be "2709137035552022"
            case_number: dbRecord.caseNumber, // Should be "CP(CAA) - 146/2022"
            filing_date: dbRecord.filingDate, // Should be "25-06-2022"
            case_status: dbRecord.caseStatus,
            party_name: dbRecord.partyName, // Should be extracted party name
            petitioner_advocate: dbRecord.petitionerAdvocate, // Should be "MADHURI PANDEY"
            respondent_advocate: dbRecord.respondentAdvocate,
            registered_on: dbRecord.registeredOn, // Should be "20-07-2022"
            last_listed: dbRecord.lastListed, // Should be "13-08-2025"
            next_listing_date: dbRecord.nextListingDate, // Should be "15-10-2025"
            
            // Search parameters - USE ORIGINAL PAYLOAD VALUES
            bench: dbRecord.bench, // Should be "Mumbai"
            case_type: dbRecord.case_type, // Should be "CP(AA) Merger and Amalgamation(Companies Act)"
            
            // PDF links and listing history - ENHANCED
            pdf_links: dbRecord.pdfLinks,
            pdf_urls: dbRecord.judgmentUrl, // All 39 PDF URLs
            total_pdf_count: dbRecord.judgmentUrl.length,
            listing_history: dbRecord.listingHistory,
            
            note: caseData.note || null
        };
        
        processedData.push(transformedCase);
    }
    
    console.log(`[${requestId}] ✅ Data processing completed: ${processedData.length} cases processed`);
    
    // Log final PDF summary
    const totalPDFs = processedData.reduce((sum, record) => sum + (record.total_pdf_count || 0), 0);
    console.log(`[${requestId}] 📊 Final PDF summary: ${totalPDFs} total PDF URLs extracted and saved`);
    
    return processedData;
}
async function processExtractedData(extractedData, searchParams, dbClient, requestId) {
    console.log(`[${requestId}] 📊 Processing extracted data for database insertion...`);
    console.log(`[${requestId}] 🔍 Extracted data structure:`, {
        totalCases: extractedData.length,
        sampleKeys: extractedData[0] ? Object.keys(extractedData[0]) : [],
        hasSearchResult: extractedData[0] ? !!extractedData[0].searchResult : false,
        hasDetailedInfo: extractedData[0] ? !!extractedData[0].detailedCaseInfo : false
    });
    
    const processedData = [];
    
    // ENHANCED: Process each case for database insertion
    for (let i = 0; i < extractedData.length; i++) {
        const caseData = extractedData[i];
        
        console.log(`[${requestId}] 💾 Processing case ${i + 1}/${extractedData.length} for database...`);
        
        // Extract data from both searchResult and detailedCaseInfo
        const searchResult = caseData.searchResult || {};
        const detailedInfo = caseData.detailedCaseInfo || {};
        const basicInfo = detailedInfo.basicCaseInfo || {};
        
        // COMPREHENSIVE DEBUGGING: Let's see exactly what we're extracting
        console.log(`[${requestId}] 🔍 COMPREHENSIVE DATA EXTRACTION DEBUG:`);
        console.log(`[${requestId}] 📋 Case Data Structure Analysis:`, {
            'caseData exists': !!caseData,
            'caseData keys': Object.keys(caseData || {}),
            'searchResult exists': !!searchResult,
            'searchResult keys': Object.keys(searchResult || {}),
            'detailedInfo exists': !!detailedInfo,
            'detailedInfo keys': Object.keys(detailedInfo || {}),
            'basicInfo exists': !!basicInfo,
            'basicInfo keys': Object.keys(basicInfo || {}),
            'basicInfo type': typeof basicInfo
        });

        // FULL DATA DUMP for debugging
        console.log(`[${requestId}] 📋 FULL CASE DATA DUMP:`);
        console.log(`[${requestId}] 📋 Full caseData:`, JSON.stringify(caseData, null, 2));
        console.log(`[${requestId}] 📋 Full searchResult:`, JSON.stringify(searchResult, null, 2));
        console.log(`[${requestId}] 📋 Full detailedInfo:`, JSON.stringify(detailedInfo, null, 2));
        console.log(`[${requestId}] 📋 Full basicInfo:`, JSON.stringify(basicInfo, null, 2));

        // Check if basicInfo has the expected field structure based on your HTML
        console.log(`[${requestId}] 🔍 Expected Fields Check:`, {
            'Filing Number': basicInfo['Filing Number'],
            'Filing Date': basicInfo['Filing Date'],
            'Party Name': basicInfo['Party Name'],
            'Petitioner Advocate(s)': basicInfo['Petitioner Advocate(s)'],
            'Respondent Advocate(s)': basicInfo['Respondent Advocate(s)'],
            'Case Number': basicInfo['Case Number'],
            'Registered On': basicInfo['Registered On'],
            'Last Listed': basicInfo['Last Listed'],
            'Next Listing Date': basicInfo['Next Listing Date'],
            'Case Status': basicInfo['Case Status']
        });
        
        // ENHANCED PDF URL EXTRACTION - Extract all PDF URLs properly
        console.log(`[${requestId}] 🔍 DEBUG: Extracting PDF URLs...`);
        let allPdfUrls = [];
        
        // Method 1: Extract from pdfLinks array
        if (detailedInfo.pdfLinks && Array.isArray(detailedInfo.pdfLinks)) {
            console.log(`[${requestId}] 📎 Found ${detailedInfo.pdfLinks.length} PDF links in detailedInfo.pdfLinks`);
            detailedInfo.pdfLinks.forEach((pdfLink, index) => {
                const url = pdfLink.href || pdfLink.url || pdfLink.link;
                if (url) {
                    allPdfUrls.push(url);
                    console.log(`[${requestId}] 📄 PDF ${index + 1}: ${url.substring(0, 80)}...`);
                }
            });
        }
        
        // Method 2: Extract from listing history
        if (detailedInfo.listingHistory && Array.isArray(detailedInfo.listingHistory)) {
            console.log(`[${requestId}] 📋 Checking ${detailedInfo.listingHistory.length} listing history entries for PDF URLs...`);
            detailedInfo.listingHistory.forEach((entry, entryIndex) => {
                if (entry.pdfLinks && Array.isArray(entry.pdfLinks)) {
                    entry.pdfLinks.forEach((pdfLink, linkIndex) => {
                        const url = pdfLink.href || pdfLink.url || pdfLink.link;
                        if (url && !allPdfUrls.includes(url)) {
                            allPdfUrls.push(url);
                            console.log(`[${requestId}] 📄 PDF from listing ${entryIndex + 1}.${linkIndex + 1}: ${url.substring(0, 80)}...`);
                        }
                    });
                } else if (entry.pdfUrl && !allPdfUrls.includes(entry.pdfUrl)) {
                    allPdfUrls.push(entry.pdfUrl);
                    console.log(`[${requestId}] 📄 PDF from listing ${entryIndex + 1}: ${entry.pdfUrl.substring(0, 80)}...`);
                }
            });
        }
        
        // Method 3: Check for any other PDF URL fields
        if (caseData.pdfUrls && Array.isArray(caseData.pdfUrls)) {
            caseData.pdfUrls.forEach(url => {
                if (url && !allPdfUrls.includes(url)) {
                    allPdfUrls.push(url);
                }
            });
        }
        
        // Remove duplicates and filter valid URLs
        const uniquePdfUrls = [...new Set(allPdfUrls)].filter(url => 
            url && typeof url === 'string' && url.trim() !== '' && url.startsWith('http')
        );
        
        console.log(`[${requestId}] 📊 PDF URL extraction summary:`, {
            totalFound: allPdfUrls.length,
            uniqueUrls: uniquePdfUrls.length,
            sampleUrls: uniquePdfUrls.slice(0, 3).map(url => url.substring(0, 80) + '...')
        });

        // ENHANCED extraction with multiple field name variations and comprehensive logging
        console.log(`[${requestId}] 🔍 Starting field extraction with comprehensive fallbacks...`);

        // Extract Filing Number with detailed logging
        const extractedFilingNumber = 
            basicInfo['Filing Number'] || 
            basicInfo['Filing No'] || 
            basicInfo['filing_number'] || 
            basicInfo['filingNumber'] ||
            basicInfo['Filing No.'] ||
            searchResult['Filing Number'] || 
            searchResult['Filing No'] || 
            searchResult['filing_number'] || 
            searchResult.filingNumber || '';
        
        console.log(`[${requestId}] 📄 Filing Number extraction DETAILED:`, {
            'basicInfo[Filing Number]': basicInfo['Filing Number'],
            'basicInfo[Filing No]': basicInfo['Filing No'],
            'basicInfo[filing_number]': basicInfo['filing_number'],
            'basicInfo[filingNumber]': basicInfo['filingNumber'],
            'searchResult[Filing Number]': searchResult['Filing Number'],
            'searchResult[filing_number]': searchResult['filing_number'],
            'Final extracted value': extractedFilingNumber,
            'Expected value': '2709137035552022',
            'Matches expected': extractedFilingNumber === '2709137035552022'
        });

        // Extract Case Number with detailed logging
        const extractedCaseNumber = 
            basicInfo['Case Number'] || 
            basicInfo['Case No'] || 
            basicInfo['case_number'] || 
            basicInfo['caseNumber'] ||
            basicInfo['Case No.'] ||
            searchResult['Case Number'] || 
            searchResult['Case No'] || 
            searchResult['case_number'] || 
            searchResult.caseNumber || '';
            
        console.log(`[${requestId}] 📄 Case Number extraction DETAILED:`, {
            'basicInfo[Case Number]': basicInfo['Case Number'],
            'basicInfo[Case No]': basicInfo['Case No'],
            'basicInfo[case_number]': basicInfo['case_number'],
            'basicInfo[caseNumber]': basicInfo['caseNumber'],
            'searchResult[Case Number]': searchResult['Case Number'],
            'searchResult[case_number]': searchResult['case_number'],
            'Final extracted value': extractedCaseNumber,
            'Expected value': 'C.P.(CAA) - 146/2022',
            'Contains expected': extractedCaseNumber.includes('146/2022')
        });

        // Extract Party Name with detailed logging
        const extractedParties = 
            basicInfo['Party Name'] || 
            basicInfo['party_name'] || 
            basicInfo['partyName'] || 
            basicInfo['Party'] ||
            searchResult['Party Name'] || 
            searchResult['party_name'] || 
            searchResult['partyName'] || 
            searchResult.partyName || '';
            
        console.log(`[${requestId}] 📄 Party Name extraction DETAILED:`, {
            'basicInfo[Party Name]': basicInfo['Party Name'],
            'basicInfo[party_name]': basicInfo['party_name'],
            'basicInfo[partyName]': basicInfo['partyName'],
            'searchResult[Party Name]': searchResult['Party Name'],
            'searchResult[party_name]': searchResult['party_name'],
            'Final extracted value': extractedParties,
            'Expected value': 'Ashtek Consultancy Private Limited  VS',
            'Contains expected': extractedParties.includes('Ashtek Consultancy')
        });

        // Extract Filing Date with detailed logging
        const extractedFilingDate = 
            basicInfo['Filing Date'] || 
            basicInfo['filing_date'] || 
            basicInfo['filingDate'] ||
            searchResult['Filing Date'] || 
            searchResult['filing_date'] || 
            searchResult.filingDate || '';
            
        console.log(`[${requestId}] 📄 Filing Date extraction DETAILED:`, {
            'basicInfo[Filing Date]': basicInfo['Filing Date'],
            'basicInfo[filing_date]': basicInfo['filing_date'],
            'basicInfo[filingDate]': basicInfo['filingDate'],
            'searchResult[Filing Date]': searchResult['Filing Date'],
            'searchResult[filing_date]': searchResult['filing_date'],
            'Final extracted value': extractedFilingDate,
            'Expected value': '25-06-2022',
            'Matches expected': extractedFilingDate === '25-06-2022'
        });

        // Extract all other fields with logging
        const extractedRegisteredOn = 
            basicInfo['Registered On'] || 
            basicInfo['registered_on'] || 
            basicInfo['registeredOn'] ||
            searchResult['Registered On'] || 
            searchResult['registered_on'] || 
            searchResult.registeredOn || '';

        const extractedLastListed = 
            basicInfo['Last Listed'] || 
            basicInfo['last_listed'] || 
            basicInfo['lastListed'] ||
            searchResult['Last Listed'] || 
            searchResult['last_listed'] || 
            searchResult.lastListed || '';

        const extractedNextListingDate = 
            basicInfo['Next Listing Date'] || 
            basicInfo['next_listing_date'] || 
            basicInfo['nextListingDate'] ||
            searchResult['Next Listing Date'] || 
            searchResult['next_listing_date'] || 
            searchResult.nextListingDate || '';

        const extractedCaseStatus = 
            basicInfo['Case Status'] || 
            basicInfo['case_status'] || 
            basicInfo['caseStatus'] ||
            basicInfo['Status'] ||
            searchResult['Case Status'] || 
            searchResult['case_status'] || 
            searchResult.caseStatus || 
            searchResult.status || 'Pending';

        const extractedPetitionerAdvocate = 
            basicInfo['Petitioner Advocate(s)'] || 
            basicInfo['Petitioner Advocate'] || 
            basicInfo['petitioner_advocate'] || 
            basicInfo['petitionerAdvocate'] ||
            searchResult['Petitioner Advocate(s)'] || 
            searchResult['Petitioner Advocate'] || 
            searchResult['petitioner_advocate'] || 
            searchResult.petitionerAdvocate || '';

        const extractedRespondentAdvocate = 
            basicInfo['Respondent Advocate(s)'] || 
            basicInfo['Respondent Advocate'] || 
            basicInfo['respondent_advocate'] || 
            basicInfo['respondentAdvocate'] ||
            searchResult['Respondent Advocate(s)'] || 
            searchResult['Respondent Advocate'] || 
            searchResult['respondent_advocate'] || 
            searchResult.respondentAdvocate || '';

        // COMPREHENSIVE LOGGING of all extraction results
        console.log(`[${requestId}] 📊 COMPREHENSIVE EXTRACTION SUMMARY:`, {
            'Filing Number': {
                'Expected from HTML': '2709137035552022',
                'Actual extracted': extractedFilingNumber,
                'Is empty': extractedFilingNumber === '',
                'Length': extractedFilingNumber.length,
                'Type': typeof extractedFilingNumber
            },
            'Case Number': {
                'Expected from HTML': 'C.P.(CAA) - 146/2022',
                'Actual extracted': extractedCaseNumber,
                'Is empty': extractedCaseNumber === '',
                'Length': extractedCaseNumber.length,
                'Type': typeof extractedCaseNumber
            },
            'Party Name': {
                'Expected from HTML': 'Ashtek Consultancy Private Limited  VS',
                'Actual extracted': extractedParties,
                'Is empty': extractedParties === '',
                'Length': extractedParties.length,
                'Type': typeof extractedParties
            },
            'Filing Date': {
                'Expected from HTML': '25-06-2022',
                'Actual extracted': extractedFilingDate,
                'Is empty': extractedFilingDate === '',
                'Length': extractedFilingDate.length,
                'Type': typeof extractedFilingDate
            },
            'Petitioner Advocate': {
                'Expected from HTML': 'MADHURI PANDEY',
                'Actual extracted': extractedPetitionerAdvocate,
                'Is empty': extractedPetitionerAdvocate === '',
                'Length': extractedPetitionerAdvocate.length,
                'Type': typeof extractedPetitionerAdvocate
            }
        });

        // Validate that we have actual extracted data
        const hasExtractedData = extractedFilingNumber || extractedCaseNumber || extractedParties;
        console.log(`[${requestId}] ✅ Has extracted data: ${hasExtractedData}`);
        console.log(`[${requestId}] 📊 Extraction success rate:`, {
            'Filing Number': !!extractedFilingNumber,
            'Case Number': !!extractedCaseNumber,
            'Party Name': !!extractedParties,
            'Filing Date': !!extractedFilingDate,
            'Petitioner Advocate': !!extractedPetitionerAdvocate,
            'Overall success': hasExtractedData
        });

        if (!hasExtractedData) {
            console.log(`[${requestId}] ❌ CRITICAL: NO DATA EXTRACTED - This indicates a problem with the scraping logic`);
            
            // ENHANCED DEBUGGING - Check if the data structure is different than expected
            console.log(`[${requestId}] 🔍 ENHANCED Data structure investigation:`);
            
            // Check if basicInfo is actually an array or has different structure
            if (Array.isArray(basicInfo)) {
                console.log(`[${requestId}] 📋 basicInfo is an ARRAY with ${basicInfo.length} items`);
                basicInfo.forEach((item, index) => {
                    console.log(`[${requestId}] 📋 basicInfo[${index}]:`, JSON.stringify(item, null, 2));
                });
            } else if (typeof basicInfo === 'object' && basicInfo !== null) {
                console.log(`[${requestId}] 📋 basicInfo is an OBJECT with keys:`, Object.keys(basicInfo));
                
                // Check if it has nested structures
                Object.keys(basicInfo).forEach(key => {
                    const value = basicInfo[key];
                    console.log(`[${requestId}] 📋 basicInfo.${key}:`, {
                        type: typeof value,
                        value: typeof value === 'object' ? JSON.stringify(value) : value
                    });
                });
            } else {
                console.log(`[${requestId}] 📋 basicInfo is NOT an object:`, {
                    type: typeof basicInfo,
                    value: basicInfo
                });
            }
            
            // Check if data is nested differently in detailedInfo
            if (detailedInfo && typeof detailedInfo === 'object') {
                console.log(`[${requestId}] 🔍 Checking detailedInfo structure:`, {
                    keys: Object.keys(detailedInfo),
                    hasCaseInfo: !!detailedInfo.caseInfo,
                    hasCaseDetails: !!detailedInfo.caseDetails,
                    hasBasicCaseInfo: !!detailedInfo.basicCaseInfo,
                    hasListingHistory: !!detailedInfo.listingHistory
                });
                
                if (detailedInfo.caseInfo) {
                    console.log(`[${requestId}] 📋 detailedInfo.caseInfo:`, JSON.stringify(detailedInfo.caseInfo, null, 2));
                }
                
                if (detailedInfo.caseDetails) {
                    console.log(`[${requestId}] 📋 detailedInfo.caseDetails:`, JSON.stringify(detailedInfo.caseDetails, null, 2));
                }
            }
            
            // Check searchResult structure as well
            if (searchResult && typeof searchResult === 'object') {
                console.log(`[${requestId}] 🔍 Checking searchResult structure:`, {
                    keys: Object.keys(searchResult),
                    hasRows: !!searchResult.rows,
                    hasHeaders: !!searchResult.headers,
                    hasData: !!searchResult.data
                });
                
                if (searchResult.rows && Array.isArray(searchResult.rows)) {
                    console.log(`[${requestId}] 📋 searchResult.rows (${searchResult.rows.length} items):`);
                    searchResult.rows.forEach((row, index) => {
                        console.log(`[${requestId}] 📋 Row ${index}:`, JSON.stringify(row, null, 2));
                    });
                }
            }
            
        } else {
            console.log(`[${requestId}] ✅ SUCCESS: Data extracted successfully from NCLT website`);
        }
        
        // CORRECTED: Transform data for database - Use ONLY extracted values, no hardcoded fallbacks
        const dbRecord = {
            // Basic identifiers - Use search params as fallback
            serialNumber: i + 1,
            diaryNumber: `${searchParams.cp_no}/${searchParams.year}`, // Will be "146/2022"
            
            // FIXED: Use ONLY extracted filing number from NCLT website, no hardcoded fallback
            filingNumber: extractedFilingNumber || '', // Use "2709137035552022" from NCLT or empty string
            
            // FIXED: Use ONLY extracted case number from NCLT website, no hardcoded fallback
            caseNumber: extractedCaseNumber || '', // Use "CP(CAA) - 146/2022" from NCLT or empty string
            
            // Party information - Map from extracted data only
            parties: extractedParties || '',
            partyName: extractedParties || '',
            advocates: extractedPetitionerAdvocate || '',
            petitionerAdvocate: extractedPetitionerAdvocate || '',
            respondentAdvocate: extractedRespondentAdvocate || '',
            
            // FIXED: Use ORIGINAL payload values for bench and case_type
            bench: searchParams.bench || '', // This should be "Mumbai" (original payload)
            benchName: searchParams.bench || '',
            court: searchParams.court || 'NCLT Court', // Use original court from payload
            courtType: 'NCLT',
            city: searchParams.bench || '', // This should be "Mumbai" (original)
            district: '',
            
            // Dates - Use ONLY extracted dates from NCLT website
            judgmentDate: extractedFilingDate || extractedRegisteredOn || null,
            filingDate: extractedFilingDate || '', // Use "25-06-2022" from NCLT or empty string
            registeredOn: extractedRegisteredOn || '', // Use "20-07-2022" from NCLT or empty string
            lastListed: extractedLastListed || '', // Use "13-08-2025" from NCLT or empty string
            nextListingDate: extractedNextListingDate || '', // Use "15-10-2025" from NCLT or empty string
            
            // FIXED: Use ORIGINAL case_type from payload
            caseType: searchParams.case_type || searchParams.caseType || '', // Original payload value
            case_type: searchParams.case_type || searchParams.caseType || '', // Original payload value
            caseStatus: extractedCaseStatus || 'Pending',
            
            // PDF and document links - Use extracted PDF URLs
            judgmentUrl: uniquePdfUrls, // All extracted PDF URLs from NCLT website
            pdfLinks: detailedInfo.pdfLinks || [],
            
            // Additional data
            judgmentText: [],
            judgmentType: extractedCaseStatus || 'Pending',
            judgment_type: extractedCaseStatus || 'Pending',
            filePath: '',
            file_path: '',
            
            // JSON fields - Use extracted listing history
            orderDetails: detailedInfo.listingHistory || [],
            allParties: extractedParties ? [extractedParties] : [],
            listingHistory: detailedInfo.listingHistory || [],
            listingEntries: detailedInfo.listingHistory || [],
            
            // Additional fields
            courtComplex: null
        };
        
        // FINAL VALIDATION - Log what we're actually saving
        console.log(`[${requestId}] 💾 FINAL DATABASE RECORD DEBUG:`, {
            'Will save filing_number': dbRecord.filingNumber,
            'Will save case_number': dbRecord.caseNumber,
            'Will save parties': dbRecord.parties?.substring(0, 50) + '...',
            'Will save filing_date': dbRecord.filingDate,
            'Will save petitioner_advocate': dbRecord.petitionerAdvocate,
            'Will save bench': dbRecord.bench,
            'Will save case_type': dbRecord.caseType?.substring(0, 50) + '...',
            'PDF count': dbRecord.judgmentUrl.length,
            'Has extracted data': hasExtractedData
        });
        
        // Log the first few PDF URLs for verification
        if (dbRecord.judgmentUrl.length > 0) {
            console.log(`[${requestId}] 📄 Sample PDF URLs being saved:`);
            dbRecord.judgmentUrl.slice(0, 5).forEach((url, index) => {
                console.log(`[${requestId}]   ${index + 1}. ${url}`);
            });
        } else {
            console.log(`[${requestId}] ⚠️ No PDF URLs found for this case`);
        }
        
        // ENHANCED: Store in database - Always attempt insertion if we have basic data
        const hasValidData = dbRecord.diaryNumber && dbRecord.bench && dbClient;
        
        console.log(`[${requestId}] 🔍 Database insertion validation:`, {
            hasDbClient: !!dbClient,
            diaryNumber: dbRecord.diaryNumber,
            bench: dbRecord.bench,
            court: dbRecord.court,
            hasValidData,
            willInsert: hasValidData
        });
        
        // Replace the database insertion section in processExtractedData with this ENHANCED version:

        if (hasValidData) {
            try {
                console.log(`[${requestId}] 💾 Inserting case ${i + 1} into database...`);
                console.log(`[${requestId}] 📊 Database insertion details:`, {
                    diaryNumber: dbRecord.diaryNumber,
                    filingNumber: dbRecord.filingNumber,
                    caseNumber: dbRecord.caseNumber,
                    parties: dbRecord.parties?.substring(0, 50) + '...',
                    bench: dbRecord.bench,
                    court: dbRecord.court,
                    caseType: dbRecord.caseType?.substring(0, 50) + '...',
                    filingDate: dbRecord.filingDate,
                    caseStatus: dbRecord.caseStatus,
                    pdfCount: dbRecord.judgmentUrl.length,
                    listingCount: dbRecord.listingHistory.length
                });
                
                // ENHANCED: Log the complete record being inserted
                console.log(`[${requestId}] 📋 Complete database record:`, {
                    recordKeys: Object.keys(dbRecord),
                    recordSize: JSON.stringify(dbRecord).length,
                    hasRequiredFields: {
                        diaryNumber: !!dbRecord.diaryNumber,
                        bench: !!dbRecord.bench,
                        court: !!dbRecord.court,
                        filingNumber: !!dbRecord.filingNumber,
                        caseNumber: !!dbRecord.caseNumber
                    }
                });
                
                // Import the database module INSIDE the function
                const { insertOrder } = require('./components/database');
                
                console.log(`[${requestId}] 🔄 About to call insertOrder with dbClient...`);
                console.log(`[${requestId}] 🔍 DbClient status:`, {
                    exists: !!dbClient,
                    type: typeof dbClient,
                    hasQuery: dbClient && typeof dbClient.query === 'function'
                });
                
                const insertResult = await insertOrder(dbClient, dbRecord);
                
                console.log(`[${requestId}] 📊 insertOrder result:`, {
                    result: insertResult,
                    type: typeof insertResult,
                    isNull: insertResult === null,
                    isUndefined: insertResult === undefined
                });
                
                if (insertResult) {
                    console.log(`[${requestId}] ✅ Case ${i + 1} successfully inserted with ID: ${insertResult}`);
                    
                    // Log successful insertion summary
                    console.log(`[${requestId}] 📊 Successful insertion summary:`, {
                        id: insertResult,
                        diaryNumber: dbRecord.diaryNumber,
                        filingNumber: dbRecord.filingNumber,
                        caseNumber: dbRecord.caseNumber,
                        parties: dbRecord.parties?.substring(0, 30) + '...',
                        bench: dbRecord.bench,
                        pdfCount: dbRecord.judgmentUrl.length,
                        listingCount: dbRecord.listingHistory.length
                    });
                    
                } else {
                    console.error(`[${requestId}] ❌ CRITICAL: insertOrder returned null`);
                    console.log(`[${requestId}] 🔍 Debugging null insertion:`, {
                        dbClientExists: !!dbClient,
                        dbRecordExists: !!dbRecord,
                        dbRecordKeys: Object.keys(dbRecord),
                        requiredFieldsCheck: {
                            diaryNumber: dbRecord.diaryNumber,
                            bench: dbRecord.bench,
                            court: dbRecord.court
                        }
                    });
                    
                    // Try a simple database test
                    if (dbClient) {
                        try {
                            const testResult = await dbClient.query('SELECT NOW() as current_time');
                            console.log(`[${requestId}] 🔍 Database connection test:`, testResult.rows[0]);
                        } catch (testError) {
                            console.error(`[${requestId}] ❌ Database connection test failed:`, testError.message);
                        }
                    }
                }
                
            } catch (dbError) {
                console.error(`[${requestId}] ❌ Database insertion failed for case ${i + 1}:`, dbError.message);
                console.error(`[${requestId}] 📊 Full database error:`, {
                    message: dbError.message,
                    code: dbError.code,
                    detail: dbError.detail,
                    hint: dbError.hint,
                    stack: dbError.stack?.substring(0, 500) + '...'
                });
                
                // Log the record that failed to insert
                console.log(`[${requestId}] 📋 Failed record summary:`, {
                    diaryNumber: dbRecord.diaryNumber,
                    filingNumber: dbRecord.filingNumber,
                    caseNumber: dbRecord.caseNumber,
                    bench: dbRecord.bench,
                    recordKeysCount: Object.keys(dbRecord).length
                });
                
                console.log(`[${requestId}] ⚠️ Continuing despite insert error...`);
            }
        } else {
            console.log(`[${requestId}] ⚠️ Skipping database insertion - validation failed:`, {
                hasDbClient: !!dbClient,
                diaryNumber: dbRecord.diaryNumber,
                bench: dbRecord.bench,
                hasValidData: hasValidData
            });
        }
        // Create the processed case for return - ENHANCED
        const transformedCase = {
            searchResult: caseData.searchResult,
            detailedCaseInfo: caseData.detailedCaseInfo,
            extractedAt: caseData.extractedAt || new Date().toISOString(),
            
            // Add standardized fields for response using EXTRACTED and ORIGINAL values
            filing_number: dbRecord.filingNumber, // Should be "2709137035552022"
            case_number: dbRecord.caseNumber, // Should be "CP(CAA) - 146/2022"
            filing_date: dbRecord.filingDate, // Should be "25-06-2022"
            case_status: dbRecord.caseStatus,
            party_name: dbRecord.partyName, // Should be extracted party name
            petitioner_advocate: dbRecord.petitionerAdvocate, // Should be "MADHURI PANDEY"
            respondent_advocate: dbRecord.respondentAdvocate,
            registered_on: dbRecord.registeredOn, // Should be "20-07-2022"
            last_listed: dbRecord.lastListed, // Should be "13-08-2025"
            next_listing_date: dbRecord.nextListingDate, // Should be "15-10-2025"
            
            // Search parameters - USE ORIGINAL PAYLOAD VALUES
            bench: dbRecord.bench, // Should be "Mumbai"
            case_type: dbRecord.case_type, // Should be "CP(AA) Merger and Amalgamation(Companies Act)"
            
            // PDF links and listing history - ENHANCED
            pdf_links: dbRecord.pdfLinks,
            pdf_urls: dbRecord.judgmentUrl, // All 39 PDF URLs
            total_pdf_count: dbRecord.judgmentUrl.length,
            listing_history: dbRecord.listingHistory,
            
            note: caseData.note || null
        };
        
        processedData.push(transformedCase);
    }
    
    console.log(`[${requestId}] ✅ Data processing completed: ${processedData.length} cases processed`);
    
    // Log final PDF summary
    const totalPDFs = processedData.reduce((sum, record) => sum + (record.total_pdf_count || 0), 0);
    console.log(`[${requestId}] 📊 Final PDF summary: ${totalPDFs} total PDF URLs extracted and saved`);
    
    return processedData;
}
// Add this debugging function right after the processExtractedData function:

async function debugExtractedData(extractedData, requestId) {
    console.log(`[${requestId}] 🔍 DEBUG: Analyzing extracted data structure...`);
    
    if (!extractedData || !Array.isArray(extractedData)) {
        console.log(`[${requestId}] ❌ DEBUG: extractedData is not an array:`, typeof extractedData);
        return;
    }
    
    console.log(`[${requestId}] 📊 DEBUG: Total extracted cases: ${extractedData.length}`);
    
    if (extractedData.length > 0) {
        const sample = extractedData[0];
        console.log(`[${requestId}] 🔍 DEBUG: Sample case structure:`, {
            topLevelKeys: Object.keys(sample),
            hasSearchResult: !!sample.searchResult,
            searchResultKeys: sample.searchResult ? Object.keys(sample.searchResult) : [],
            hasDetailedInfo: !!sample.detailedCaseInfo,
            detailedInfoKeys: sample.detailedCaseInfo ? Object.keys(sample.detailedCaseInfo) : [],
            basicInfoKeys: sample.detailedCaseInfo?.basicCaseInfo ? Object.keys(sample.detailedCaseInfo.basicCaseInfo) : []
        });
        
        // Log actual values for debugging
        if (sample.detailedCaseInfo?.basicCaseInfo) {
            console.log(`[${requestId}] 📋 DEBUG: Basic case info sample:`, sample.detailedCaseInfo.basicCaseInfo);
        }
    }
}

module.exports = {
  NCLTCourtJudgmentsScrapper,
  debugExtractedData
};