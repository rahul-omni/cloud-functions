const { connectToDatabase, closeDatabase, bulkInsertOrders } = require('./components/database');
const { 
  createBrowser, 
  closeBrowser, 
  navigateToNCLTPage, 
  fillNCLTForm, 
  submitNCLTForm, 
  checkForResults,
  getPageInfo,
  extractNCLTCaseData,
  extractSearchResults,
  extractSingleCaseDetails,
  // New simplified functions
  extractTableData,
  processDetailLinks,
  extractCaseDetails
} = require('./components/browser');
const { handleNCLTCaptcha, scrapeNCLTCourt, extractDetailedCaseData } = require('./components/scraper');
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
  
  // Enhanced logging: Show first few PDF URLs for verification
  if (pdfUrls.length > 0) {
    console.log(`[database] 🔗 First 3 PDF URLs extracted:`);
    pdfUrls.slice(0, 3).forEach((url, index) => {
      console.log(`[database]   ${index + 1}. ${url}`);
    });
    if (pdfUrls.length > 3) {
      console.log(`[database]   ... and ${pdfUrls.length - 3} more PDF URLs`);
    }
  } else {
    console.log(`[database] ⚠️ No PDF URLs found in listing history`);
  }
  
  return pdfUrls;
}

// Database connection handler with enhanced error handling
const handleDatabaseConnection = async () => {
  console.log('[database] 🔗 handleDatabaseConnection called');
  try {
    console.log('[database] 🔄 Attempting primary database connection...');
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
    console.error('[database] 🔍 Error details:', {
      name: dbError.name,
      message: dbError.message,
      code: dbError.code,
      errno: dbError.errno
    });
    console.log('[database] ⚠️ Continuing without database...');
    return null;
  }
};

// Transform NCLT results to standard format - FIXED
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
      diary_number: results.diaryNumber,  // Changed from cp_no to diary_number
      year: results.year,
      search_timestamp: new Date().toISOString()
    },
    total_records: results.totalRecords,
    data: results.data || [],  // Return data in 'data' field for consistency
    message: results.message || `NCLT scraping completed successfully`,
    search_timestamp: new Date().toISOString(),
    judgments: results.data || []
  };
};

// Main NCLT court scraper function
// Replace the main function (around line 150):
// Add this function before the main scraper function:

// Auto-extract captcha from image (for simple text-based captchas)
const autoExtractCaptcha = async (page) => {
  try {
    // Get captcha image and try to extract text
    const captchaData = await page.evaluate(() => {
      const captchaImg = document.querySelector('img[src*="captcha"], img[alt*="captcha"]') || 
                        document.querySelector('img');
      
      if (!captchaImg) return null;
      
      // For NCLT, the captcha is usually simple text
      // Try to get the image dimensions and source
      return {
        src: captchaImg.src,
        width: captchaImg.naturalWidth,
        height: captchaImg.naturalHeight,
        alt: captchaImg.alt || '',
        title: captchaImg.title || ''
      };
    });
    
    if (!captchaData) return null;
    
    // For NCLT captcha, if it's a simple math problem or text, 
    // we can sometimes extract it from the URL or alt text
    console.log('[debug] Captcha data:', captchaData);
    
    // Method 1: Check if captcha value is in the URL (some sites do this)
    if (captchaData.src && captchaData.src.includes('text=')) {
      const urlParams = new URL(captchaData.src);
      const captchaValue = urlParams.searchParams.get('text');
      if (captchaValue) {
        console.log('[auto-captcha] Found captcha in URL:', captchaValue);
        return captchaValue;
      }
    }
    
    // Method 2: Take screenshot and try OCR (simplified approach)
    try {
      const captchaElement = await page.$('img[src*="captcha"], img[alt*="captcha"], img');
      if (captchaElement) {
        const boundingBox = await captchaElement.boundingBox();
        
        // Take screenshot of captcha area
        const captchaScreenshot = await page.screenshot({
          clip: {
            x: boundingBox.x,
            y: boundingBox.y,
            width: boundingBox.width,
            height: boundingBox.height
          }
        });
        
        // For now, we'll use a simple pattern matching approach
        // In production, you could integrate with OCR services like Tesseract
        console.log('[auto-captcha] Captcha screenshot taken, size:', captchaScreenshot.length);
        
        // Try simple pattern matching for common NCLT captcha patterns
        // This is a placeholder - you'd need actual OCR integration
        const possibleValues = await trySimpleCaptchaPatterns(page);
        if (possibleValues) {
          return possibleValues;
        }
      }
    } catch (ocrError) {
      console.log('[auto-captcha] OCR attempt failed:', ocrError.message);
    }
    
    return null;
    
  } catch (error) {
    console.log('[auto-captcha] Auto-extraction failed:', error.message);
    return null;
  }
};

// Simple captcha pattern matching (for common NCLT patterns)
const trySimpleCaptchaPatterns = async (page) => {
  try {
    // Look for mathematical expressions in the page
    const mathPattern = await page.evaluate(() => {
      const textContent = document.body.textContent;
      
      // Look for simple math patterns like "2+3=?" or "5-1=?"
      const mathMatch = textContent.match(/(\d+)\s*([+\-*\/])\s*(\d+)\s*=\s*\?/);
      if (mathMatch) {
        const num1 = parseInt(mathMatch[1]);
        const operator = mathMatch[2];
        const num2 = parseInt(mathMatch[3]);
        
        let result;
        switch (operator) {
          case '+': result = num1 + num2; break;
          case '-': result = num1 - num2; break;
          case '*': result = num1 * num2; break;
          case '/': result = Math.floor(num1 / num2); break;
          default: return null;
        }
        
        return result.toString();
      }
      
      return null;
    });
    
    if (mathPattern) {
      console.log('[auto-captcha] Solved math captcha:', mathPattern);
      return mathPattern;
    }
    
    return null;
    
  } catch (error) {
    console.log('[auto-captcha] Pattern matching failed:', error.message);
    return null;
  }
};
// Main NCLT court scraper function - Updated to handle object payload
 // Replace the main function parameters extraction (around line 100):

// Main NCLT court scraper function - FIXED PAYLOAD HANDLING
const NCLTCourtJudgmentsScrapper = async (searchParams) => {
  console.log(`[start] [NCLTCourtJudgmentsScrapper] Scraping NCLT court judgments`);
  
  // Extract parameters from payload object - FIXED
  const {
    bench,
    caseType,
    diaryNumber,  // Keep as diaryNumber
    year,         // Keep as separate year
    court,
    captchaText = null  // Optional captcha
  } = searchParams;
  
  // DON'T combine them - use them separately
  const cpNo = diaryNumber;  // Just use diaryNumber as cpNo
  
  console.log(`[info] [NCLTCourtJudgmentsScrapper] Parameters:`, {
    bench,
    caseType,
    cpNo: diaryNumber,     // Show the actual cpNo value
    year,                  // Show the actual year value
    court,
    captcha: captchaText ? '***provided***' : 'will auto-solve'
  });

  let dbClient = null;
  let browser = null;
  let page = null;

  try {
    // Connect to database with enhanced retry logic
    console.log('[database] 🔗 About to call handleDatabaseConnection...');
    dbClient = await handleDatabaseConnection();
    console.log('[database] 🔗 handleDatabaseConnection returned:', !!dbClient);
    
    if (dbClient) {
      console.log('[database] ✅ Database connection established successfully');
    } else {
      console.log('[database] ❌ Database connection failed - dbClient is null');
      console.log('[database] 🔄 Attempting direct database connection as fallback...');
      
      // Try direct connection as fallback
      try {
        dbClient = await connectToDatabase();
        if (dbClient) {
          console.log('[database] ✅ Direct database connection succeeded');
        }
      } catch (directError) {
        console.error('[database] ❌ Direct connection also failed:', directError.message);
        console.log('[database] ⚠️ Proceeding without database - data will be returned but not saved');
      }
    }

    // Validate required parameters
    if (!bench) {
      throw new Error('NCLT Bench is required');
    }

    if (!diaryNumber && !caseType && !year) {
      throw new Error('At least one search parameter (diaryNumber, caseType, or year) is required');
    }

    console.log(`[info] [NCLTCourtJudgmentsScrapper] Using NCLT bench: ${bench}`);
    
    // Create browser instance
    browser = await createBrowser();
    page = await browser.newPage();
    
    // Set page configurations
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Get initial page info for debugging
    console.log('[debug] Starting NCLT scraping process...');

    // Step 1: Navigate to NCLT website
    await navigateToNCLTPage(page);
    await getPageInfo(page);

    // Step 2: Fill the search form - PASS SEPARATE VALUES
    console.log('[step 2] Filling NCLT search form...');
    await fillNCLTForm(page, bench, caseType, diaryNumber, year); // Pass diaryNumber and year separately

    // Step 3: Auto-handle captcha (NEW AUTO-SOLVE LOGIC)
    console.log('[step 3] Auto-handling captcha...');
    let captchaSolved = false;
    let captchaAttempts = 0;
    const maxCaptchaAttempts = 3;
    
    while (!captchaSolved && captchaAttempts < maxCaptchaAttempts) {
      captchaAttempts++;
      console.log(`[step 3] Captcha attempt ${captchaAttempts}/${maxCaptchaAttempts}`);
      
      try {
        // Check if captcha is present
        const captchaPresent = await page.evaluate(() => {
          const captchaInput = document.querySelector('input[name*="captcha"], input[placeholder*="captcha"], input[placeholder*="Captcha"]');
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
          
          // Use the new handleNCLTCaptcha function which uses OpenAI Vision API
          const captchaResult = await handleNCLTCaptcha(page, captchaText);
          
          if (captchaResult) {
            console.log('[step 3] ✅ Captcha solved successfully');
            captchaSolved = true;
          } else {
            console.log('[step 3] ❌ Captcha solving failed, refreshing page...');
            
            // Refresh the page to get a new captcha
            await page.reload({ waitUntil: 'networkidle2' });
            await page.waitForTimeout(2000);
            
            // Re-fill the form with separate values
            await fillNCLTForm(page, bench, caseType, diaryNumber, year);
            
            // Continue to next attempt
            continue;
          }
        } else {
          console.log('[step 3] No captcha detected - proceeding without captcha');
          captchaSolved = true;
        }
        
      } catch (captchaError) {
        console.log(`[step 3] Captcha attempt ${captchaAttempts} failed:`, captchaError.message);
        
        if (captchaAttempts < maxCaptchaAttempts) {
          console.log('[step 3] Retrying with page refresh...');
          await page.reload({ waitUntil: 'networkidle2' });
          await page.waitForTimeout(2000);
          await fillNCLTForm(page, bench, caseType, diaryNumber, year);
        }
      }
    }
    
    if (!captchaSolved) {
      console.log('[step 3] ⚠️ Could not solve captcha after all attempts - proceeding anyway');
    }

    // Step 4: Submit the form (simplified approach)
    console.log('[step 4] Submitting NCLT search form...');
    const formSubmitted = await submitNCLTForm(page, {
        bench: bench,
        caseType: caseType,
        cpNo: diaryNumber,  // Use diaryNumber for CP number
        year: year
    });
    
    if (!formSubmitted) {
        // Form submission failed or redirected to wrong page
        console.log('⚠️ Form submission failed, trying to continue with legacy extraction...');
    }

    // Step 5: Check for results
    console.log('[step 5] Checking for search results...');
    const resultCheck = await checkForResults(page);
    
    // Handle NO_CASE_FOUND error type first
    if (resultCheck.errorType === 'NO_CASE_FOUND') {
        console.log('[result] No NCLT records found - case does not exist');
        return {
            success: false,
            message: resultCheck.message || 'This case number or diary number does not exist. Please check and try again.',
            errorType: 'NO_CASE_FOUND',
            court_name: 'Nclt Court',
            search_parameters: {
                bench: bench,
                case_type: caseType,
                diary_number: `${diaryNumber}/${year}`,
                year: year,
                search_timestamp: new Date().toISOString()
            },
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
            search_parameters: {
                bench: bench,
                case_type: caseType,
                diary_number: `${diaryNumber}/${year}`,
                year: year,
                search_timestamp: new Date().toISOString()
            },
            judgments: []
        };
    }

    // Step 6: Extract table data and process detail links
    console.log('[step 6] Extracting NCLT case data from table...');
    
    // First extract basic table data
    const tableData = await extractTableData(page);
    
    if (!tableData || tableData.length === 0) {
        console.log('⚠️ No table data found, trying legacy extraction...');
        
        // Fallback to legacy extraction
        const extractionResults = await extractSearchResults(page);
        
        if (!extractionResults.success) {
            throw new Error(`Failed to extract NCLT data: ${extractionResults.error}`);
        }

        console.log(`✅ Successfully extracted ${extractionResults.totalRecords} NCLT cases (legacy method)`);

        // Save to database if connection available
        let savedRecords = [];
        if (dbClient && extractionResults.data && extractionResults.data.length > 0) {
            console.log(`[database] Saving ${extractionResults.data.length} records to database...`);
            
            const dbSearchParams = { bench, caseType, cpNo: diaryNumber, year };
            
            for (const caseData of extractionResults.data) {
                try {
                    const savedRecord = await saveNCLTCaseToDatabase(dbClient, caseData, dbSearchParams);
                    if (savedRecord) {
                        savedRecords.push(savedRecord);
                        console.log(`✅ Saved case: ${savedRecord.caseNumber || savedRecord.filingNumber}`);
                    }
                } catch (dbError) {
                    console.error(`❌ Failed to save case to database:`, dbError.message);
                }
            }
        }
        
        // Prepare final results
        const finalResults = {
            success: true,
            message: `Successfully extracted ${extractionResults.totalRecords} NCLT cases`,
            totalRecords: extractionResults.totalRecords,
            data: extractionResults.data,
            savedToDatabase: savedRecords.length,
            bench,
            caseType,
            diaryNumber: diaryNumber,
            year
        };

        // Transform results to standard format
        const transformedResults = transformNCLTResults(finalResults);
        
        console.log(`[success] NCLT scraping completed successfully - ${transformedResults.total_records} records found`);
        return transformedResults;
    }

    console.log(`✅ Found ${tableData.length} cases in results table`);

    // Process detail links for comprehensive case information
    console.log('[step 7] Processing status links for detailed case information...');
    const detailedCases = await processDetailLinks(page, tableData);

    console.log(`✅ Extracted detailed info for ${detailedCases.length} cases`);

    // Combine table data with detailed cases
    const allCases = [...tableData];
    
    // Enhance basic cases with detailed information where available
    detailedCases.forEach(detailedCase => {
        const basicIndex = allCases.findIndex(basic => 
            basic.filingNumber === detailedCase.filingNumber ||
            basic.caseNumber === detailedCase.caseNumber ||
            basic.rowIndex === detailedCase.rowIndex
        );
        
        if (basicIndex >= 0) {
            // Replace basic case with detailed version
            allCases[basicIndex] = detailedCase;
        } else {
            // Add detailed case if not found in basic data
            allCases.push(detailedCase);
        }
    });

    console.log(`✅ Total cases processed: ${allCases.length} (${detailedCases.length} with detailed info)`);

    // Save to database if connection available
    let savedRecords = [];
    
    // Enhanced database saving logging
    console.log(`[database] Database saving check:`, {
        hasDbClient: !!dbClient,
        dbClientType: typeof dbClient,
        allCasesLength: allCases.length,
        willAttemptSave: !!(dbClient && allCases.length > 0)
    });
    
    if (!dbClient) {
        console.log(`[database] ❌ No database client available - skipping database save`);
    } else if (allCases.length === 0) {
        console.log(`[database] ❌ No cases to save - allCases array is empty`);
    } else {
        console.log(`[database] ✅ Starting database save process for ${allCases.length} records...`);
        
        try {
            // Transform cases to match database format
            const dbFormattedCases = allCases.map(caseData => {
                // Extract PDF URLs from listing history
                const extractedPdfUrls = extractPdfUrlsFromListingHistory(caseData.listingHistory || []);
                
                console.log(`[database] 📄 Case ${caseData.filingNumber}: extracted ${extractedPdfUrls.length} PDF URLs from ${caseData.listingHistory?.length || 0} listing entries`);
                
                // Create combined diary number as "cpNo/year" (e.g., "36/2022")
                const combinedDiaryNumber = diaryNumber && year ? `${diaryNumber}/${year}` : '';
                console.log(`[database] 📝 Combined diary number: ${combinedDiaryNumber}`);
                
                return {
                    // Basic identification
                    serialNumber: caseData.serialNumber || '1',
                    diaryNumber: combinedDiaryNumber,              // Combined format: "36/2022"
                    caseNumber: caseData.caseNumber || '',
                    
                    // Party and legal info  
                    parties: caseData.partyName || caseData.petitionerVsRespondent || '',
                    advocates: caseData.petitionerAdvocate || '',
                    
                    // Court info
                    bench: bench || '',
                    court: 'NCLT',
                    case_type: caseType || '',
                    city: '',
                    district: '',
                    
                    // Dates
                    judgmentDate: caseData.filingDate || caseData.listingDate || null,
                    
                    // PDF URLs and documents - Use extracted URLs from listingHistory
                    judgmentUrl: extractedPdfUrls,
                    judgmentText: [],
                    judgment_type: caseData.status || 'Pending',
                    
                    // NCLT-specific fields matching your schema
                    filingNumber: caseData.filingNumber || '',
                    filingDate: caseData.filingDate || '',
                    partyName: caseData.partyName || caseData.petitionerVsRespondent || '',
                    petitionerAdvocate: caseData.petitionerAdvocate || '',
                    respondentAdvocate: caseData.respondentAdvocate || '',
                    registeredOn: caseData.registeredOn || '',
                    lastListed: caseData.lastListed || caseData.listingDate || '',
                    nextListingDate: caseData.nextListingDate || '',
                    caseStatus: caseData.status || caseData.caseStatus || '',
                    
                    // JSON fields for structured data
                    orderDetails: caseData.orderDetails || [],
                    allParties: caseData.allParties || [],
                    listingHistory: caseData.listingHistory || [],
                    
                    // File path
                    file_path: ''
                };
            });
            
            console.log(`[database] 🔄 Calling bulkInsertOrders for ${dbFormattedCases.length} formatted cases...`);
            
            // Use bulk insert like High Court scraper
            const insertResult = await bulkInsertOrders(dbClient, dbFormattedCases);
            
            console.log(`[database] ✅ Bulk insert completed:`, {
                totalInserted: insertResult.totalInserted,
                totalBatches: insertResult.totalBatches,
                errors: insertResult.errors?.length || 0
            });
            
            savedRecords = Array(insertResult.totalInserted).fill().map((_, i) => ({
                id: `bulk-${i + 1}`,
                caseNumber: dbFormattedCases[i]?.caseNumber || 'Unknown'
            }));
            
        } catch (dbError) {
            console.error(`[database] ❌ Bulk insert failed:`, dbError.message);
            console.error(`[database] 🔍 Error details:`, dbError.stack);
            console.log(`[database] 📦 Database save failed, but returning extracted data directly`);
        }
    }

    // If database saving failed, log the extracted data for debugging
    if (savedRecords.length === 0 && allCases.length > 0) {
        console.log(`[debug] ⚠️ Database save failed, but ${allCases.length} cases were successfully extracted:`);
        allCases.forEach((caseData, index) => {
            console.log(`[debug] Case ${index + 1}:`, {
                filingNumber: caseData.filingNumber,
                caseNumber: caseData.caseNumber,
                partyName: caseData.partyName || caseData.petitionerVsRespondent,
                caseStatus: caseData.status || caseData.caseStatus,
                listingHistoryCount: caseData.listingHistory?.length || 0,
                pdfLinksCount: caseData.listingHistory?.reduce((total, entry) => total + (entry.pdfLinks?.length || 0), 0) || 0
            });
        });
    }

    // Prepare final results
    const finalResults = {
        success: true,
        message: `Successfully extracted ${allCases.length} NCLT cases (${detailedCases.length} with detailed info)`,
        totalRecords: allCases.length,
        data: allCases,
        savedToDatabase: savedRecords.length,
        bench,
        caseType,
        diaryNumber: diaryNumber && year ? `${diaryNumber}/${year}` : diaryNumber, // Combined format
        cpNo: diaryNumber,     // Keep original cpNo separate
        year,
        extractionSummary: {
            tableDataExtracted: tableData.length,
            detailedCasesExtracted: detailedCases.length,
            totalProcessed: allCases.length,
            savedToDatabase: savedRecords.length
        }
    };

    // Transform results to standard format
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

// Helper function to validate NCLT parameters
const validateNCLTParameters = (bench, caseType, cpNo, year) => {
  const errors = [];

  if (!bench || typeof bench !== 'string') {
    errors.push('Bench is required and must be a string');
  }

  if (caseType && typeof caseType !== 'string') {
    errors.push('Case type must be a string if provided');
  }

  if (cpNo && (typeof cpNo !== 'string' && typeof cpNo !== 'number')) {
    errors.push('CP Number must be a string or number if provided');
  }

  if (year && (typeof year !== 'string' && typeof year !== 'number')) {
    errors.push('Year must be a string or number if provided');
  }

  if (year && (parseInt(year) < 2000 || parseInt(year) > new Date().getFullYear())) {
    errors.push('Year must be between 2000 and current year');
  }

  return errors;
};

// Enhanced NCLT scraper with validation
const NCLTCourtJudgmentsScrapperWithValidation = async (bench, caseType, cpNo, year, captcha) => {
  // Validate parameters
  const validationErrors = validateNCLTParameters(bench, caseType, cpNo, year);
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }

  // Call main scraper
  return await NCLTCourtJudgmentsScrapper(bench, caseType, cpNo, year, captcha);
};

module.exports = {
  NCLTCourtJudgmentsScrapper,
  NCLTCourtJudgmentsScrapperWithValidation
};