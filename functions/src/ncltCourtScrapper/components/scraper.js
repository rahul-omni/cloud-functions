

const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { extractNCLTCaseData } = require('./browser');
const { connectToDatabase, bulkInsertOrders, closeDatabase } = require('./database');
const {  solveCaptcha } = require('./captcha');
const { waitForSelector, delay } = require('./utils');

// NCLT-specific captcha handler using the same approach as other courts
async function handleNCLTCaptcha(page, captchaRetries = 3) {
    let success = false;
    
    // Ensure captchaRetries has a valid value
    if (!captchaRetries || captchaRetries < 1) {
        captchaRetries = 3;
    }
    
    console.log(`[step 3] Starting NCLT captcha solving with ${captchaRetries} attempts`);
    
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[step 3] Captcha attempt ${attempt}/${captchaRetries}`);
        
        try {
            // Wait for the captcha input to be visible
            await page.waitForSelector('#txtInput', { visible: true, timeout: 10000 });
            console.log('[step 3] Captcha input field found');

            // Clear the captcha field first (for retry attempts)
            if (attempt > 1) {
                await page.click('#txtInput', { clickCount: 3 });
                await page.keyboard.press('Delete');
                await page.waitForTimeout(500);
                console.log('[step 3] Cleared captcha field for retry');
            }

            // Find and capture the captcha display area
            console.log('[step 3] Looking for captcha display...');
            
            // Method 1: Look for text captcha displayed near the input
            const captchaText = await page.evaluate(() => {
                const captchaInput = document.querySelector('#txtInput');
                if (!captchaInput) return null;
                
                const inputRect = captchaInput.getBoundingClientRect();
                console.log('Captcha input position:', inputRect);
                
                // Look for text elements showing the captcha value
                const allElements = Array.from(document.querySelectorAll('*'));
                const candidates = [];
                
                for (const element of allElements) {
                    const text = element.textContent?.trim() || '';
                    const rect = element.getBoundingClientRect();
                    const distance = Math.abs(rect.top - inputRect.top) + Math.abs(rect.left - inputRect.left);
                    
                    // Check if it looks like a captcha (3-6 characters, alphanumeric)
                    if (/^[a-zA-Z0-9]{3,6}$/.test(text) && distance < 300 && rect.width > 10) {
                        candidates.push({
                            text: text,
                            element: element.tagName,
                            distance: distance,
                            position: { top: rect.top, left: rect.left }
                        });
                    }
                }
                
                console.log('Captcha candidates found:', candidates);
                
                // Return the closest candidate
                if (candidates.length > 0) {
                    candidates.sort((a, b) => a.distance - b.distance);
                    return candidates[0].text;
                }
                
                return null;
            });
            
            let captchaValue = null;
            
            if (captchaText) {
                // Direct text captcha found
                captchaValue = captchaText;
                console.log(`[step 3] Found text captcha: ${captchaValue}`);
            } else {
                // Method 2: Take screenshot of captcha area and solve with AI
                console.log('[step 3] No text captcha found, capturing image...');
                
                // Enhanced captcha area detection and screenshot
                const captchaAreaBounds = await page.evaluate(() => {
                    const input = document.querySelector('#txtInput');
                    if (input) {
                        const rect = input.getBoundingClientRect();
                        
                        // Look for elements that might contain the captcha near the input
                        const formRow = input.closest('tr') || input.closest('.form-row') || input.closest('div');
                        
                        let captchaArea = null;
                        
                        // Method 1: Look for text displays showing numbers
                        if (formRow) {
                            const textElements = formRow.querySelectorAll('span, div, td, label');
                            for (const el of textElements) {
                                const text = el.textContent?.trim();
                                if (text && /^\d{3,6}$/.test(text)) {
                                    const elRect = el.getBoundingClientRect();
                                    captchaArea = {
                                        x: Math.max(0, elRect.left - 50),
                                        y: Math.max(0, elRect.top - 20),
                                        width: elRect.width + 100,
                                        height: elRect.height + 40
                                    };
                                    console.log('Found text captcha:', text, 'at bounds:', captchaArea);
                                    break;
                                }
                            }
                        }
                        
                        // Method 2: Look for images or canvas near input
                        if (!captchaArea && formRow) {
                            const images = formRow.querySelectorAll('img, canvas');
                            for (const img of images) {
                                const imgRect = img.getBoundingClientRect();
                                if (imgRect.width > 30 && imgRect.height > 15 && !img.src?.includes('refresh')) {
                                    captchaArea = {
                                        x: Math.max(0, imgRect.left - 20),
                                        y: Math.max(0, imgRect.top - 10),
                                        width: imgRect.width + 40,
                                        height: imgRect.height + 20
                                    };
                                    console.log('Found image captcha at bounds:', captchaArea);
                                    break;
                                }
                            }
                        }
                        
                        // Method 3: Fallback - capture area around input
                        if (!captchaArea) {
                            captchaArea = {
                                x: Math.max(0, rect.left - 200),
                                y: Math.max(0, rect.top - 100),
                                width: Math.min(window.innerWidth, 500),
                                height: Math.min(window.innerHeight, 200)
                            };
                            console.log('Using fallback captcha area bounds:', captchaArea);
                        }
                        
                        return captchaArea;
                    }
                    return null;
                });
                
                if (captchaAreaBounds) {
                    console.log('[step 3] Taking screenshot with bounds:', captchaAreaBounds);
                    const captchaBuffer = await page.screenshot({
                        clip: captchaAreaBounds
                    });
                    
                    console.log('[step 3] Screenshot captured, size:', captchaBuffer.length, 'bytes');
                    console.log('[step 3] Sending captcha image to AI for solving...');
                    captchaValue = await solveCaptcha(captchaBuffer);
                    console.log(`[step 3] AI solved captcha: ${captchaValue}`);
                } else {
                    console.log('[step 3] Could not determine captcha area bounds');
                }
            }
            
            // Validate captcha value with detailed logging
            console.log(`[step 3] Raw captcha value: "${captchaValue}"`);
            console.log(`[step 3] Captcha type: ${typeof captchaValue}`);
            
            if (!captchaValue) {
                throw new Error('Captcha value is null or undefined');
            }
            
            if (!captchaValue.trim()) {
                throw new Error('Captcha value is empty after trimming');
            }
            
            const trimmedCaptcha = captchaValue.trim();
            console.log(`[step 3] Trimmed captcha: "${trimmedCaptcha}"`);
            
            if (!/^[a-zA-Z0-9]{3,6}$/.test(trimmedCaptcha)) {
                console.warn(`[step 3] Warning: Captcha "${trimmedCaptcha}" doesn't match expected pattern`);
                // Continue anyway - let the server validate
            }

            // Enter the captcha value
            console.log(`[step 3] Entering captcha: "${trimmedCaptcha}"`);
            await page.click('#txtInput');
            await page.waitForTimeout(500);
            
            // Clear any existing value first
            await page.evaluate(() => document.querySelector('#txtInput').value = '');
            await page.type('#txtInput', trimmedCaptcha);
            console.log('[step 3] Captcha entered successfully');
            await page.waitForTimeout(1000);

            // Submit the form by clicking Search button
            console.log('[step 3] Clicking Search button...');
            const searchButton = await page.$('input[type="submit"], button[type="submit"], input[value*="Search"]');
            if (searchButton) {
                await searchButton.click();
                console.log('[step 3] Search button clicked');
            } else {
                console.log('[step 3] Search button not found, trying form submission');
                await page.keyboard.press('Enter');
            }

            // Wait for results or error
            await page.waitForTimeout(3000);
            
            // Check if captcha was successful by looking for results or error messages
            try {
                // Look for error messages indicating wrong captcha
                const errorMessage = await page.evaluate(() => {
                    const errorElements = Array.from(document.querySelectorAll('*'))
                        .filter(el => {
                            const text = el.textContent?.toLowerCase() || '';
                            return text.includes('wrong') || 
                                   text.includes('invalid') || 
                                   text.includes('incorrect') ||
                                   text.includes('captcha') && (text.includes('error') || text.includes('fail'));
                        });
                    
                    return errorElements.length > 0 ? errorElements[0].textContent?.trim() : null;
                });
                
                if (errorMessage) {
                    console.log(`[step 3] Captcha error detected: ${errorMessage}`);
                    if (attempt < captchaRetries) {
                        console.log(`[step 3] Retrying captcha (attempt ${attempt + 1}/${captchaRetries})`);
                        // Refresh captcha if possible
                        const refreshButton = await page.$('img[onclick*="refresh"], a[onclick*="refresh"], button[onclick*="refresh"]');
                        if (refreshButton) {
                            await refreshButton.click();
                            await page.waitForTimeout(2000);
                        }
                        continue; // Go to next attempt
                    } else {
                        throw new Error('All captcha attempts failed - invalid captcha');
                    }
                }
                
                // If we get here, captcha was likely successful
                console.log('[step 3] ✅ Captcha appears to be accepted');
                success = true;
                break;
                
            } catch (error) {
                console.log('[step 3] Error checking captcha result, assuming success:', error.message);
                success = true;
                break;
            }
            
        } catch (error) {
            console.error(`[step 3] Error in captcha attempt ${attempt}:`, error);
            if (attempt === captchaRetries) {
                throw error;
            }
            // Wait before retry
            await page.waitForTimeout(2000);
        }
    }

    if (!success) {
        throw new Error(`Failed to solve NCLT captcha after ${captchaRetries} attempts`);
    }
    
    return true;
}

// Extract detailed case data from individual case detail page
async function extractDetailedCaseData(page, basicCaseInfo = {}) {
    try {
        console.log('📄 Extracting detailed case data from NCLT case detail page...');
        
        const caseData = await page.evaluate((basicInfo) => {
            try {
                // Initialize case data object with basic info
                const caseData = {
                    // Basic info from search results
                    filingNumber: basicInfo.filingNo || '',
                    caseNumber: basicInfo.caseNo || '',
                    parties: basicInfo.parties || '',
                    listingDate: basicInfo.listingDate || '',
                    status: basicInfo.status || '',
                    
                    // Detailed fields to extract
                    filingDate: '',
                    partyName: '',
                    petitionerAdvocate: '',
                    respondentAdvocate: '',
                    registeredOn: '',
                    lastListed: '',
                    nextListingDate: '',
                    caseStatus: '',
                    caseType: '',
                    
                    // Order/listing history
                    listingHistory: [],
                    orderDetails: [],
                    judgmentUrls: []
                };
                
                console.log('Starting targeted NCLT case data extraction...');
                
                // Method 1: Extract from structured tables (priority)
                const tables = document.querySelectorAll('table');
                console.log(`Found ${tables.length} tables to analyze`);
                
                tables.forEach((table, tableIndex) => {
                    const rows = table.querySelectorAll('tr');
                    
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td, th');
                        
                        // Handle 2-column label-value tables (case details)
                        if (cells.length === 2) {
                            const label = cells[0].textContent?.trim().toLowerCase() || '';
                            const value = cells[1].textContent?.trim() || '';
                            
                            if (value && value.length > 1) {
                                // Map NCLT specific fields
                                if (label.includes('filing number')) {
                                    caseData.filingNumber = value;
                                } else if (label.includes('filing date')) {
                                    caseData.filingDate = value;
                                } else if (label.includes('party name')) {
                                    caseData.partyName = value;
                                } else if (label.includes('petitioner advocate')) {
                                    caseData.petitionerAdvocate = value;
                                } else if (label.includes('respondent advocate')) {
                                    caseData.respondentAdvocate = value;
                                } else if (label.includes('case number')) {
                                    caseData.caseNumber = value;
                                } else if (label.includes('registered on')) {
                                    caseData.registeredOn = value;
                                } else if (label.includes('last listed')) {
                                    caseData.lastListed = value;
                                } else if (label.includes('next listing date')) {
                                    caseData.nextListingDate = value;
                                } else if (label.includes('case status')) {
                                    caseData.caseStatus = value;
                                }
                            }
                        }
                        
                        // Handle listing history tables (4+ columns)
                        else if (cells.length >= 4) {
                            const headers = Array.from(row.closest('table').querySelectorAll('th')).map(th => th.textContent?.trim().toLowerCase() || '');
                            
                            // Check if this is a listing history table
                            if (headers.some(h => h.includes('date') && (h.includes('listing') || h.includes('upload'))) ||
                                headers.some(h => h.includes('order') || h.includes('judgment'))) {
                                
                                const rowData = Array.from(cells).map(cell => cell.textContent?.trim() || '');
                                
                                // Skip header rows
                                if (!rowData[0] || rowData[0].toLowerCase().includes('s.no') || rowData[0].toLowerCase().includes('date')) {
                                    return;
                                }
                                
                                // Extract listing entry
                                const listingEntry = {
                                    sNo: rowData[0] || '',
                                    dateOfListing: rowData[1] || '',
                                    dateOfUpload: rowData[2] || '',
                                    orderJudgment: rowData[3] || '',
                                    pdfLinks: []
                                };
                                
                                // Look for PDF links in this row
                                const links = row.querySelectorAll('a');
                                links.forEach(link => {
                                    if (link.href && (link.href.includes('.pdf') || link.textContent?.toLowerCase().includes('view'))) {
                                        listingEntry.pdfLinks.push({
                                            url: link.href,
                                            text: link.textContent?.trim() || 'View PDF'
                                        });
                                        
                                        // Also add to judgment URLs
                                        caseData.judgmentUrls.push(link.href);
                                    }
                                });
                                
                                // Only add if we have meaningful data
                                if (listingEntry.dateOfListing || listingEntry.pdfLinks.length > 0) {
                                    caseData.listingHistory.push(listingEntry);
                                    caseData.orderDetails.push(listingEntry);
                                }
                            }
                        }
                    });
                });
                
                // Method 2: Extract from definition lists or similar structures
                const definitionLists = document.querySelectorAll('dl');
                definitionLists.forEach(dl => {
                    const terms = dl.querySelectorAll('dt');
                    const definitions = dl.querySelectorAll('dd');
                    
                    terms.forEach((term, index) => {
                        const label = term.textContent?.trim().toLowerCase() || '';
                        const value = definitions[index]?.textContent?.trim() || '';
                        
                        if (value && value.length > 1) {
                            if (label.includes('filing number')) {
                                caseData.filingNumber = value;
                            } else if (label.includes('party name')) {
                                caseData.partyName = value;
                            }
                            // Add more mappings as needed
                        }
                    });
                });
                
                // Clean up extracted data
                Object.keys(caseData).forEach(key => {
                    if (typeof caseData[key] === 'string') {
                        caseData[key] = caseData[key]
                            .replace(/\s+/g, ' ')
                            .replace(/\n/g, ' ')
                            .replace(/\r/g, ' ')
                            .replace(/\t/g, ' ')
                            .trim();
                    }
                });
                
                // Remove duplicate URLs
                caseData.judgmentUrls = [...new Set(caseData.judgmentUrls)];
                
                console.log('Targeted NCLT extraction completed:', {
                    filingNumber: caseData.filingNumber,
                    partyName: caseData.partyName,
                    listingHistoryCount: caseData.listingHistory.length,
                    judgmentUrlsCount: caseData.judgmentUrls.length
                });
                
                return caseData;
                
            } catch (error) {
                console.error('Error in targeted NCLT case data extraction:', error);
                return null;
            }
        }, basicCaseInfo);
        
        if (!caseData) {
            console.log('⚠️ No case data extracted from NCLT page');
            return null;
        }
        
        // Enhance the case data with additional metadata
        const enhancedCaseData = {
            ...caseData,
            
            // System metadata
            extractedAt: new Date().toISOString(),
            pageUrl: page.url(),
            dataSource: 'NCLT Case Detail Page - Targeted',
            
            // Ensure we have primary identifiers
            primaryFilingNumber: caseData.filingNumber || basicCaseInfo.filingNo || '',
            primaryCaseNumber: caseData.caseNumber || basicCaseInfo.caseNo || '',
            primaryParties: caseData.partyName || caseData.parties || basicCaseInfo.parties || '',
            
            // Combine advocates
            allAdvocates: [
                caseData.petitionerAdvocate,
                caseData.respondentAdvocate
            ].filter(adv => adv && adv.trim()).join(' | '),
            
            // Judgment date priority
            primaryJudgmentDate: caseData.lastListed || caseData.filingDate || caseData.registeredOn || null,
            
            // Full parties information
            fullParties: caseData.partyName || caseData.parties || basicCaseInfo.parties || ''
        };
        
        console.log(`✅ Successfully extracted targeted NCLT case data with ${enhancedCaseData.judgmentUrls.length} PDF URLs`);
        
        return enhancedCaseData;
        
    } catch (error) {
        console.error('❌ Error extracting detailed NCLT case data:', error.message);
        return null;
    }
}

async function scrapeNCLTCourt(query, captchaText = null) {
    let browser = null;
    try {
        console.log(`🔍 Starting NCLT court scraping for query: ${JSON.stringify(query)}`);
        
        // Launch browser with Cloud Functions compatible settings
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080'
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to NCLT search page
        console.log('🌐 Navigating to NCLT search page...');
        await page.goto('https://nclt.gov.in/order-cp-wise', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Fill the search form
        console.log('📝 Filling NCLT search form...');
        
        // Select bench
        if (query.bench) {
            await page.select('select[name="bench"]', query.bench);
            console.log(`✅ Selected bench: ${query.bench}`);
        }
        
        // Select case type
        if (query.caseType) {
            await page.select('select[name="case_type"]', query.caseType);
            console.log(`✅ Selected case type: ${query.caseType}`);
        }
        
        // Enter diary number
        if (query.diaryNumber) {
            await page.type('input[name="cp_no"]', query.diaryNumber);
            console.log(`✅ Entered diary number: ${query.diaryNumber}`);
        }
        
        // Select year
        if (query.year) {
            await page.select('select[name="year"]', query.year);
            console.log(`✅ Selected year: ${query.year}`);
        }

        // Handle captcha
        console.log('🔒 Handling NCLT captcha...');
        await handleNCLTCaptcha(page);

        // Wait for results to load
        console.log('⏳ Waiting for search results...');
        await page.waitForTimeout(5000);

        // Extract search results
        console.log('📋 Extracting search results...');
        const searchResults = await page.evaluate(() => {
            const results = [];
            const tables = document.querySelectorAll('table');
            
            tables.forEach(table => {
                const rows = table.querySelectorAll('tr');
                
                rows.forEach((row, index) => {
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length >= 4) {
                        const rowData = {
                            sNo: cells[0]?.textContent?.trim() || '',
                            filingNo: cells[1]?.textContent?.trim() || '',
                            caseNo: cells[2]?.textContent?.trim() || '',
                            parties: cells[3]?.textContent?.trim() || '',
                            listingDate: cells[4]?.textContent?.trim() || '',
                            status: cells[5]?.textContent?.trim() || ''
                        };
                        
                        // Look for detail links
                        const links = row.querySelectorAll('a');
                        if (links.length > 0) {
                            rowData.detailLink = links[0].href;
                        }
                        
                        if (rowData.filingNo || rowData.caseNo) {
                            results.push(rowData);
                        }
                    }
                });
            });
            
            return results;
        });

        console.log(`📋 Found ${searchResults.length} search results`);

        if (searchResults.length === 0) {
            return {
                success: true,
                totalRecords: 0,
                data: [],
                message: 'No NCLT cases found for the given criteria'
            };
        }

        // Extract detailed data from each case
        const allExtractedData = [];
        
        for (let i = 0; i < Math.min(searchResults.length, 10); i++) { // Limit to 10 cases for performance
            const result = searchResults[i];
            
            if (result.detailLink) {
                console.log(`📖 Processing case ${i + 1}/${searchResults.length}: ${result.caseNo}`);
                
                try {
                    await page.goto(result.detailLink, { waitUntil: 'networkidle2', timeout: 30000 });
                    await page.waitForTimeout(2000);
                    
                    const detailData = await extractDetailedCaseData(page, result);
                    
                    if (detailData) {
                        allExtractedData.push(detailData);
                        console.log(`✅ Extracted data for case: ${detailData.primaryCaseNumber}`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error processing case ${result.caseNo}:`, error.message);
                }
            }
        }

        const extractionResult = {
            success: true,
            totalRecords: allExtractedData.length,
            data: allExtractedData,
            message: `Successfully extracted ${allExtractedData.length} NCLT cases`
        };

        return extractionResult;

    } catch (error) {
        console.error('❌ Error in NCLT court scraping:', error.message);
        return {
            success: false,
            error: error.message,
            totalRecords: 0,
            data: []
        };
        
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔒 Browser closed');
        }
    }
}

module.exports = {
    scrapeNCLTCourt,
    handleNCLTCaptcha,
    extractDetailedCaseData
};
