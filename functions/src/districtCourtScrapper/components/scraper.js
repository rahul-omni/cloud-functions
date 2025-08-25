const { wait, filterValidRows, processCourtData, transformRowData, determineSearchType, transformToDatabaseSchema } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { bulkInsertOrders } = require('./database');


// Handle captcha solving with retries
async function handleCaptcha(page, captchaRetries = 10) {
    let success = false;
    
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);
        
        try {
            // Wait for captcha image to be present
            await page.waitForSelector('#siwp_captcha_image_0', { timeout: 10000 });
            await wait(1000);

            // Get captcha image
            const captchaElement = await page.$('#siwp_captcha_image_0');
            if (!captchaElement) {
                throw new Error('Captcha image element not found');
            }

            const captchaBuffer = await captchaElement.screenshot();
            console.log(`[captcha] Captured captcha image for attempt ${attempt}`);

            // Solve captcha
            const captchaAnswer = await solveCaptcha(captchaBuffer);
            console.log(`[captcha] Entering answer: ${captchaAnswer}`);

            // Clear previous input if retry
            if (attempt > 1) {
                await page.click('#siwp_captcha_value_0', { clickCount: 3 });
                await page.keyboard.press('Delete');
                await wait(500);
            }

            // Enter captcha answer
            await page.type('#siwp_captcha_value_0', captchaAnswer);
            await wait(1000);

            // Submit the form
            console.log('[form] Submitting search form...');
            await page.click('input[type="submit"][value="Search"]');
            
            // Wait for response - results take at least 20 seconds to load
            console.log('[wait] Waiting for search results (this takes 20+ seconds)...');
            await wait(5000); // Initial wait
            
            // Quick check for immediate errors only
            let hasError = await page.$('.error, .alert-danger, .notfound');
            if (hasError) {
                const errorText = await page.evaluate(() => {
                    const errorEl = document.querySelector('.error, .alert-danger, .notfound');
                    return errorEl ? errorEl.textContent.trim() : '';
                });
                console.log(`[captcha] Immediate error detected: ${errorText}`);
                
                if (errorText.toLowerCase().includes('captcha') || 
                    errorText.toLowerCase().includes('incorrect') || 
                    errorText.toLowerCase().includes('invalid') ||
                    errorText.includes('The captcha code entered was incorrect')) {
                    console.log('[captcha] Captcha was incorrect, retrying...');
                    continue;
                } else {
                    throw new Error(`Form error: ${errorText}`);
                }
            }
            
            // Wait for results to load (minimum 20 seconds total)
            console.log('[wait] No immediate errors, waiting for results to load...');
            await wait(15000); // Wait 15 more seconds (20 total so far)
            
            // Final check for errors after full wait
            hasError = await page.$('.error, .alert-danger, .notfound');
            if (hasError) {
                const errorText = await page.evaluate(() => {
                    const errorEl = document.querySelector('.error, .alert-danger, .notfound');
                    return errorEl ? errorEl.textContent.trim() : '';
                });
                console.log(`[captcha] Error after full wait: ${errorText}`);
                
                if (errorText.toLowerCase().includes('captcha') || 
                    errorText.toLowerCase().includes('incorrect') || 
                    errorText.toLowerCase().includes('invalid') ||
                    errorText.includes('The captcha code entered was incorrect')) {
                    console.log('[captcha] Captcha was incorrect, retrying...');
                    continue;
                } else {
                    throw new Error(`Form error: ${errorText}`);
                }
            }
            
            console.log('✅ Form submitted successfully - proceeding to scrape data!');
            success = true;
            break;
            
        } catch (error) {
            console.log(`[captcha] Attempt ${attempt} failed:`, error.message);
            if (attempt === captchaRetries) {
                throw error;
            }
        }
    }

    if (!success) {
        throw new Error('Failed to submit form after all captcha attempts');
    }
}

// Check for no records found
async function checkNoRecords(page) {
    try {
        const noRecordsElements = await page.$$('.error, .alert-danger, .notfound');
        for (const element of noRecordsElements) {
            const text = await page.evaluate(el => el.textContent, element);
            if (text && text.toLowerCase().includes('no records') || text.toLowerCase().includes('not found')) {
                console.log('[info] No records found for the given criteria');
                throw new Error('No records found for the given criteria');
            }
        }
        return false;
    } catch (error) {
        // If this is our "no records" error, re-throw it
        if (error.message === 'No records found for the given criteria') {
            throw error;
        }
        console.log('[check] Error checking for no records:', error.message);
        return false;
    }
}

// Extract data from search results
async function extractSearchResults(page, searchResults = null) {
    let allResults = [];
    
    if (searchResults) {
        try {
            console.log('[parse] Parsing HTML response into structured data...');
            
            // Check if we have complete page content (after Load More) or AJAX response
            let htmlContent = searchResults;
            let isCompletePage = false;
            
            if (searchResults.includes('<!DOCTYPE html') || searchResults.includes('<html')) {
                console.log('[parse] Processing complete page content with all loaded cases');
                isCompletePage = true;
            } else if (searchResults.trim().startsWith('{')) {
                // JSON wrapped HTML from AJAX
                try {
                    const jsonResponse = JSON.parse(searchResults);
                    if (jsonResponse.success && jsonResponse.data) {
                        htmlContent = jsonResponse.data;
                        console.log('[parse] Extracted HTML from JSON response');
                    }
                } catch (jsonError) {
                    console.log('[parse] Response is not valid JSON, treating as HTML');
                }
            }
            
            let structuredData;
            
            if (isCompletePage) {
                // Extract data directly from current page DOM (after Load More)
                structuredData = await page.evaluate(() => {
                    const courts = [];
                    const distTableContents = document.querySelectorAll('.distTableContent');
                    
                    distTableContents.forEach(distTable => {
                        const table = distTable.querySelector('table');
                        if (!table) return;
                        
                        const caption = table.querySelector('caption')?.textContent || 'Unknown Court';
                        const estCode = distTable.getAttribute('data-est-code') || '';
                        const totalCases = distTable.getAttribute('data-total-cases') || '0';
                        
                        const rows = table.querySelectorAll('tbody tr');
                        const cases = [];
                        
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 4) {
                                const serialNumber = cells[0].textContent;
                                const caseDetails = cells[1].textContent;
                                const orderDate = cells[2].textContent;
                                const orderDetailsCell = cells[3];
                                
                                // Extract PDF link if present
                                const pdfLink = orderDetailsCell.querySelector('a');
                                let pdfUrl = null;
                                let orderType = orderDetailsCell.textContent;
                                
                                if (pdfLink) {
                                    pdfUrl = pdfLink.href;
                                    orderType = pdfLink.textContent;
                                }
                                
                                cases.push({
                                    serial_number: serialNumber,
                                    case_type_number_year: caseDetails,
                                    order_date: orderDate,
                                    order_type: orderType,
                                    copy_of_order_url: pdfUrl
                                });
                            }
                        });
                        
                        courts.push({
                            court_name: caption,
                            establishment_code: estCode,
                            total_cases_available: parseInt(totalCases) || 0,
                            cases_in_current_page: cases.length,
                            cases: cases
                        });
                    });
                    
                    return courts;
                });
                
                console.log(`✅ Extracted data directly from page DOM with all loaded cases`);
            } else {
                // Fallback: Extract from current page directly
                structuredData = await page.evaluate(() => {
                    const courts = [];
                    const tables = document.querySelectorAll('table');
                    
                    tables.forEach(table => {
                        const caption = table.querySelector('caption')?.textContent;
                        if (!caption) return;
                        
                        const rows = table.querySelectorAll('tbody tr, tr');
                        const cases = [];
                        let headerProcessed = false;
                        
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td, th');
                            
                            // Skip header rows
                            if (!headerProcessed && cells.length > 0) {
                                const firstCellText = cells[0].textContent.trim().toLowerCase();
                                if (firstCellText.includes('serial') || firstCellText.includes('s.no') || firstCellText.includes('sr')) {
                                    headerProcessed = true;
                                    return;
                                }
                            }
                            
                            if (cells.length >= 4 && headerProcessed) {
                                const serialNumber = cells[0].textContent;
                                const caseDetails = cells[1].textContent;
                                const orderDate = cells[2].textContent;
                                const orderDetailsCell = cells[3];
                                
                                // Extract PDF link if present
                                const pdfLink = orderDetailsCell.querySelector('a');
                                let pdfUrl = null;
                                let orderType = orderDetailsCell.textContent;
                                
                                if (pdfLink) {
                                    pdfUrl = pdfLink.href;
                                    orderType = pdfLink.textContent;
                                }
                                
                                cases.push({
                                    serial_number: serialNumber,
                                    case_type_number_year: caseDetails,
                                    order_date: orderDate,
                                    order_type: orderType,
                                    copy_of_order_url: pdfUrl
                                });
                            }
                        });
                        
                        if (cases.length > 0) {
                            courts.push({
                                court_name: caption,
                                establishment_code: '',
                                total_cases_available: cases.length,
                                cases_in_current_page: cases.length,
                                cases: cases
                            });
                        }
                    });
                    
                    return courts;
                });
                
                console.log(`✅ Fallback extraction found ${structuredData.length} court divisions`);
            }
            
            // Clean and process the extracted data
            allResults = processCourtData(structuredData);
            
            console.log(`✅ Parsed ${allResults.length} court divisions with structured data`);
            
        } catch (parseError) {
            console.log('[parse] Error parsing HTML response:', parseError.message);
            
            // Final fallback: Try to parse from current page
            try {
                console.log('[parse] Final fallback: Extracting data from current page...');
                const pageData = await page.evaluate(() => {
                    const courts = [];
                    const tables = document.querySelectorAll('table');
                    
                    tables.forEach(table => {
                        const caption = table.querySelector('caption')?.textContent;
                        if (!caption) return;
                        
                        const rows = table.querySelectorAll('tbody tr, tr');
                        const cases = [];
                        let headerProcessed = false;
                        
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td, th');
                            
                            // Skip header rows
                            if (!headerProcessed && cells.length > 0) {
                                const firstCellText = cells[0].textContent.trim().toLowerCase();
                                if (firstCellText.includes('serial') || firstCellText.includes('s.no') || firstCellText.includes('sr')) {
                                    headerProcessed = true;
                                    return;
                                }
                            }
                            
                            if (cells.length >= 4 && headerProcessed) {
                                const serialNumber = cells[0].textContent;
                                const caseDetails = cells[1].textContent;
                                const orderDate = cells[2].textContent;
                                const orderDetailsCell = cells[3];
                                
                                // Extract PDF link if present
                                const pdfLink = orderDetailsCell.querySelector('a');
                                let pdfUrl = null;
                                let orderType = orderDetailsCell.textContent;
                                
                                if (pdfLink) {
                                    pdfUrl = pdfLink.href;
                                    orderType = pdfLink.textContent;
                                }
                                
                                cases.push({
                                    serial_number: serialNumber,
                                    case_type_number_year: caseDetails,
                                    order_date: orderDate,
                                    order_type: orderType,
                                    copy_of_order_url: pdfUrl
                                });
                            }
                        });
                        
                        if (cases.length > 0) {
                            courts.push({
                                court_name: caption,
                                establishment_code: '',
                                total_cases_available: cases.length,
                                cases_in_current_page: cases.length,
                                cases: cases
                            });
                        }
                    });
                    
                    return courts;
                });
                
                // Clean the extracted fallback data
                allResults = processCourtData(pageData);
                console.log(`✅ Final fallback extraction found ${allResults.length} court divisions`);
                
            } catch (fallbackError) {
                console.log('[parse] Final fallback extraction also failed:', fallbackError.message);
                throw new Error(`Failed to parse HTML response: ${fallbackError.message}`);
            }
        }
    } else {
        console.log('[parse] No search results to parse');
        allResults = [];
    }

    return allResults;
}

// Main scraping function - now supports both date and case number searches
async function scrapeData(page, date, diaryNumber, caseTypeValue, courtComplex, responseInterceptor, dbClient = null) {
    console.log(`[start] [scrapeData] Starting data scraping`);
    // console.log(`[scrapeData] Parameters - Date: ${date}, DiaryNumber: ${diaryNumber}, CaseType: ${caseTypeValue}`);

    try {
        // Determine search type and prepare search data
        const searchInfo = determineSearchType(date, diaryNumber, caseTypeValue, courtComplex);
        console.log(`[info] [scrapeData] Search type determined: ${searchInfo.searchType}`);
        console.log(`[info] [scrapeData] Search data:`, searchInfo.searchData);

        // Import browser functions here to avoid circular dependency
        const { 
            navigateToOrderDatePage, 
            navigateToCaseNumberPage, 
            selectCourtComplex, 
            setDateFields, 
            setCaseNumberFields,
            loadAllCases 
        } = require('./browser');

        // Navigate to appropriate page based on search type
        if (searchInfo.searchType === 'case_number') {
            await navigateToCaseNumberPage(page);
            
            // Select court complex
            await selectCourtComplex(page, searchInfo.searchData.courtComplex);
            
            // Set case number fields
            await setCaseNumberFields(
                page, 
                searchInfo.searchData.caseNumber, 
                searchInfo.searchData.caseYear, 
                searchInfo.searchData.caseType
            );
        } else {
            await navigateToOrderDatePage(page);
                        
            // Set date fields (for single date, use same date for from and to)
            await setDateFields(page, searchInfo.searchData.date, searchInfo.searchData.date);
        }

        // Handle captcha and form submission
        await handleCaptcha(page);

        // Get search results from interceptor
        let searchResults = responseInterceptor.getSearchResults();
        
        // Check for no records - this will now throw an error if no records found
        await checkNoRecords(page);

        // Load all cases if we have results
        if (searchResults) {
            await loadAllCases(page);
            
            // After loading all cases, extract the complete data from page DOM
            console.log('[loadmore] Extracting complete data from page after Load More...');
            const completePageData = await page.content();
            searchResults = completePageData; // Use the complete page content
        }

        // Extract and process the results
        const allResults = await extractSearchResults(page, searchResults);

        // If database client is available, store results
        if (dbClient && allResults.length > 0 && !allResults[0].error) {
            try {
                console.log('[database] Storing results in database...');
                // Transform data for database storage using new schema
                const dbRecords = [];
                allResults.forEach(court => {
                    const validCases = filterValidRows(court.cases);
                    validCases.forEach(caseItem => {
                        dbRecords.push(transformToDatabaseSchema(caseItem, court, searchInfo.searchData));
                    });
                });
                
                if (dbRecords.length > 0) {
                    // Actually perform bulk insert
                    const insertResult = await bulkInsertOrders(dbClient, dbRecords);
                    console.log(`[database] Successfully inserted ${insertResult.inserted} records, ${insertResult.errors} errors`);
                }
            } catch (dbError) {
                console.error('[database] Error storing results:', dbError.message);
                // Continue without database storage
            }
        }

        return {
            success: true,
            search_parameters: {
                search_type: searchInfo.searchType,
                search_data: searchInfo.searchData,
                search_timestamp: new Date().toISOString(),
                court_name: 'Gurugram District Court'
            },
            courts: allResults,
            total_courts_found: allResults.length,
            total_cases_found: allResults.reduce((sum, court) => sum + (court.cases_in_current_page || 0), 0)
        };

    } catch (error) {
        console.error('❌ Error during data scraping:', error.message);
        throw error; // Re-throw the error instead of returning error object
    }
}

module.exports = {
    handleCaptcha,
    checkNoRecords,
    extractSearchResults,
    scrapeData
}; 