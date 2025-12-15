const { wait, filterValidRows, processCourtData, transformToDatabaseSchema, validateSearchParameters } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { bulkInsertCauseList } = require('./database');

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
            console.log('[form] Submitting cause list search form...');
            await page.click('input[type="submit"][value="Search"]');
            
            // Wait for response - results take at least 20 seconds to load
            console.log('[wait] Waiting for cause list results (this takes 20+ seconds)...');
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
            
            console.log('✅ Cause list form submitted successfully - proceeding to scrape data!');
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
            if (text && (text.toLowerCase().includes('no records') || text.toLowerCase().includes('not found'))) {
                console.log('[info] No cause list records found for the given criteria');
                throw new Error('No cause list records found for the given criteria');
            }
        }
        return false;
    } catch (error) {
        // If this is our "no records" error, re-throw it
        if (error.message === 'No cause list records found for the given criteria') {
            throw error;
        }
        console.log('[check] Error checking for no records:', error.message);
        return false;
    }
}

// Extract cause list data from search results
async function extractCauseListResults(page, searchResults = null) {
    let allResults = [];
    
    if (searchResults) {
        try {
            console.log('[parse] Parsing cause list HTML response into structured data...');
            
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
                    
                    // Debug: Log all tables found
                    const allTables = document.querySelectorAll('table');
                    console.log(`[debug] Found ${allTables.length} tables on page`);
                    
                    // Look specifically for .distTableContent elements (cause list tables)
                    const distTableContents = document.querySelectorAll('.distTableContent');
                    
                    console.log(`[debug] Found ${distTableContents.length} .distTableContent elements`);
                    
                    distTableContents.forEach((distTable, index) => {
                        // Debug: Log the HTML content of this distTable
                        console.log(`[debug] distTable ${index + 1} HTML:`, distTable.innerHTML.substring(0, 200) + '...');
                        
                        // Debug: Check what tables are inside this distTable
                        const allTablesInDistTable = distTable.querySelectorAll('table');
                        console.log(`[debug] distTable ${index + 1} contains ${allTablesInDistTable.length} tables`);
                        
                        allTablesInDistTable.forEach((t, tIndex) => {
                            console.log(`[debug] Table ${tIndex + 1} classes: "${t.className}"`);
                        });
                        
                        // Try different table selectors
                        let table = distTable.querySelector('table.data-table-1.bt');
                        if (!table) {
                            table = distTable.querySelector('table[class*="data-table"]');
                        }
                        if (!table) {
                            table = distTable.querySelector('table');
                        }
                        
                        if (!table) {
                            console.log(`[debug] Skipping distTable ${index + 1} - no table found`);
                            return;
                        }
                        
                        console.log(`[debug] Found table in distTable ${index + 1} with classes: ${table.className}`);
                        
                        const caption = table.querySelector('caption')?.textContent || `Table ${index + 1}`;
                        const rows = table.querySelectorAll('tbody tr');
                        const cases = [];
                        
                        console.log(`[debug] Processing distTable ${index + 1}: ${caption}, ${rows.length} rows`);
                        
                        rows.forEach((row, rowIndex) => {
                            const cells = row.querySelectorAll('td');
                            console.log(`[debug] Row ${rowIndex + 1} has ${cells.length} cells`);
                            
                            if (cells.length >= 4) {
                                const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                                console.log(`[debug] Row ${rowIndex + 1} cell texts:`, cellTexts);
                                
                                const serialNumber = cells[0].textContent.trim();
                                const caseDetailsCell = cells[1];
                                const partyNameCell = cells[2];
                                const advocateCell = cells[3];
                                
                                // Extract case details (might be in a link)
                                let caseDetails = caseDetailsCell.textContent.trim();
                                let caseNumber = '';
                                
                                // Check if case details is in a link
                                const caseLink = caseDetailsCell.querySelector('a');
                                if (caseLink) {
                                    caseDetails = caseLink.textContent.trim();
                                    caseNumber = caseLink.getAttribute('data-cno') || '';
                                }
                                
                                // Parse party names (format: "PETITIONER Vs RESPONDENT")
                                const partyName = partyNameCell.textContent.trim();
                                let petitioner = '';
                                let respondent = '';
                                
                                if (partyName.includes(' Vs ')) {
                                    const parties = partyName.split(' Vs ');
                                    petitioner = parties[0].trim();
                                    respondent = parties[1].trim();
                                } else {
                                    petitioner = partyName;
                                }
                                
                                const advocate = advocateCell.textContent.trim();
                                
                                // Only add if we have valid case details (not just numbers)
                                if (caseDetails && caseDetails.match(/[A-Z]+\/\d+\/\d{4}/)) {
                                    cases.push({
                                        serial_number: serialNumber,
                                        case_details: caseDetails,
                                        case_number: caseNumber,
                                        petitioner: petitioner,
                                        respondent: respondent,
                                        advocate_petitioner: advocate,
                                        advocate_respondent: '', // Not available in this format
                                        case_status: '', // Not available in this format
                                        next_hearing_date: '' // Not available in this format
                                    });
                                } else {
                                    console.log(`[debug] Skipping row ${rowIndex + 1} - invalid case details: ${caseDetails}`);
                                }
                            }
                        });
                        
                        console.log(`[debug] Extracted ${cases.length} valid cases from distTable ${index + 1}`);
                        
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
                    
                    console.log(`[debug] Total courts processed: ${courts.length}`);
                    return courts;
                });
                
                console.log(`✅ Extracted cause list data directly from page DOM with all loaded cases`);
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
                            
                            if (cells.length >= 6 && headerProcessed) {
                                const serialNumber = cells[0].textContent.trim();
                                const caseDetails = cells[1].textContent.trim();
                                const petitioner = cells[2].textContent.trim();
                                const respondent = cells[3].textContent.trim();
                                const advocatePetitioner = cells[4].textContent.trim();
                                const advocateRespondent = cells[5].textContent.trim();
                                const caseStatus = cells[6] ? cells[6].textContent.trim() : '';
                                const nextHearingDate = cells[7] ? cells[7].textContent.trim() : '';
                                
                                cases.push({
                                    serial_number: serialNumber,
                                    case_details: caseDetails,
                                    petitioner: petitioner,
                                    respondent: respondent,
                                    advocate_petitioner: advocatePetitioner,
                                    advocate_respondent: advocateRespondent,
                                    case_status: caseStatus,
                                    next_hearing_date: nextHearingDate
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
            
            console.log(`✅ Parsed ${allResults.length} court divisions with structured cause list data`);
            
        } catch (parseError) {
            console.log('[parse] Error parsing cause list HTML response:', parseError.message);
            
            // Final fallback: Try to parse from current page
            try {
                console.log('[parse] Final fallback: Extracting cause list data from current page...');
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
                            
                            if (cells.length >= 6 && headerProcessed) {
                                const serialNumber = cells[0].textContent.trim();
                                const caseDetails = cells[1].textContent.trim();
                                const petitioner = cells[2].textContent.trim();
                                const respondent = cells[3].textContent.trim();
                                const advocatePetitioner = cells[4].textContent.trim();
                                const advocateRespondent = cells[5].textContent.trim();
                                const caseStatus = cells[6] ? cells[6].textContent.trim() : '';
                                const nextHearingDate = cells[7] ? cells[7].textContent.trim() : '';
                                
                                cases.push({
                                    serial_number: serialNumber,
                                    case_details: caseDetails,
                                    petitioner: petitioner,
                                    respondent: respondent,
                                    advocate_petitioner: advocatePetitioner,
                                    advocate_respondent: advocateRespondent,
                                    case_status: caseStatus,
                                    next_hearing_date: nextHearingDate
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
                throw new Error(`Failed to parse cause list HTML response: ${fallbackError.message}`);
            }
        }
    } else {
        console.log('[parse] No search results to parse');
        allResults = [];
    }

    return allResults;
}

// Main cause list scraping function
async function scrapeCauseListData(page, causeListDate, courtComplex, courtEstablishment, courtNumber, causeType, responseInterceptor, dbClient = null) {
    console.log(`[start] [scrapeCauseListData] Starting cause list data scraping`);
    console.log(`[scrapeCauseListData] Parameters - Date: ${causeListDate}, Court: ${courtComplex || courtEstablishment}, Court Number: ${courtNumber}, Cause Type: ${causeType}`);

    try {
        // Validate search parameters
        const searchData = {
            causeListDate: causeListDate,
            courtComplex: courtComplex,
            courtEstablishment: courtEstablishment,
            courtNumber: courtNumber,
            causeType: causeType,
            searchTimestamp: new Date().toISOString()
        };

        validateSearchParameters(searchData);

        // Import browser functions here to avoid circular dependency
        const { 
            navigateToCauseListPage, 
            selectCourtComplex, 
            selectCourtEstablishment,
            selectCourtNumber,
            setCauseListDate,
            selectCauseType,
            loadAllCases 
        } = require('./browser');

        // Navigate to cause list page
        await navigateToCauseListPage(page);
        
        // Select court complex or establishment
        if (courtComplex) {
            await selectCourtComplex(page, courtComplex);
        } else if (courtEstablishment) {
            await selectCourtEstablishment(page, courtEstablishment);
        }
        
        // Select court number
        await selectCourtNumber(page, courtNumber);
        
        // Set cause list date
        await setCauseListDate(page, causeListDate);
        
        // Select cause type
        await selectCauseType(page, causeType);

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
            console.log('[loadmore] Extracting complete cause list data from page after Load More...');
            const completePageData = await page.content();
            searchResults = completePageData; // Use the complete page content
        }

        // Extract and process the results
        const allResults = await extractCauseListResults(page, searchResults);

        // Skip database insertion for now - just return scraped data
        console.log('[info] Skipping database insertion - returning scraped data only');

        return {
            success: true,
            search_parameters: {
                search_type: 'cause_list',
                search_data: searchData,
                search_timestamp: new Date().toISOString(),
                court_name: 'Gurugram District Court'
            },
            courts: allResults,
            total_courts_found: allResults.length,
            total_cases_found: allResults.reduce((sum, court) => sum + (court.cases_in_current_page || 0), 0)
        };

    } catch (error) {
        console.error('❌ Error during cause list data scraping:', error.message);
        throw error; // Re-throw the error instead of returning error object
    }
}

module.exports = {
    handleCaptcha,
    checkNoRecords,
    extractCauseListResults,
    scrapeCauseListData
};
