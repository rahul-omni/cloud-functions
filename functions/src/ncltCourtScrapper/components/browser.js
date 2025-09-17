const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { wait } = require('./utils');

// Create browser instance (supports both local and cloud environments)
async function createBrowser() {
    try {
        let browser;
        
        // Try local Chrome first (for development)
        const localChromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
        ];
        
        let localChromePath = null;
        const fs = require('fs');
        
        // Check if we can find local Chrome
        for (const path of localChromePaths) {
            try {
                if (fs.existsSync(path)) {
                    localChromePath = path;
                    console.log('🔍 Found local Chrome at:', path);
                    break;
                }
            } catch (err) {
                // Continue checking other paths
            }
        }
        
        if (localChromePath) {
            // Use local Chrome for development
            console.log('🚀 Launching local Chrome for development...');
            browser = await puppeteer.launch({
                executablePath: localChromePath,
                headless: false, // ✅ MAKE VISIBLE so we can see what's happening
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                defaultViewport: { width: 1280, height: 720 }
            });
        } else {
            // Fallback to chrome-aws-lambda (for cloud environments)
            console.log('☁️ Using chrome-aws-lambda for cloud environment...');
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath,
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        }
        
        console.log('✅ Browser created successfully');
        return browser;
    } catch (error) {
        console.error('❌ Failed to create browser:', error.message);
        console.log('💡 Suggestion: Install Chrome browser or run "npm install puppeteer" to download Chromium');
        throw new Error(`Failed to create browser: ${error.message}`);
    }
}

// Close browser instance
async function closeBrowser(browser) {
    try {
        if (browser) {
            await browser.close();
            console.log('✅ Browser closed successfully');
        }
    } catch (error) {
        console.error('❌ Failed to close browser:', error.message);
    }
}

// Navigate to NCLT website
async function navigateToNCLTPage(page) {
    try {
        console.log('🌐 Navigating to NCLT website...');
        await page.goto('https://nclt.gov.in/order-cp-wise', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ NCLT website loaded successfully');
        await wait(3000); // Wait for page to fully load
    } catch (error) {
        console.error('❌ Failed to navigate to NCLT page:', error.message);
        throw new Error(`Failed to navigate to NCLT page: ${error.message}`);
    }
}

// Fill NCLT search form
  // Replace the fillNCLTForm function (around line 120):

async function fillNCLTForm(page, bench, caseType, cpNo, year) {
    try {
        console.log('📝 Filling NCLT search form...');
        
        // Log the EXACT parameters being received - FIXED
        console.log('[debug] Form parameters:', {
            bench,
            caseType,
            cpNo,      // This should be just the diary number like "36"
            year       // This should be just the year like "2022"
        });

        const results = {
            bench: 'failed',
            caseType: 'failed', 
            cpNo: 'failed',
            year: 'failed'
        };

        // Step 1: Select Bench
        console.log('[step 1] Selecting bench...');
        try {
            const benchSelector = 'select[name="bench"]';
            await page.waitForSelector(benchSelector, { timeout: 10000 });
            
            const benchOptions = await page.evaluate((selector) => {
                const select = document.querySelector(selector);
                if (!select) return [];
                return Array.from(select.options).map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
            }, benchSelector);
            
            console.log('[debug] Available bench options:', benchOptions);
            
            // Find matching bench option
            const matchingBench = benchOptions.find(option => 
                option.text.toLowerCase().includes(bench.toLowerCase()) ||
                bench.toLowerCase().includes(option.text.toLowerCase())
            );
            
            if (matchingBench) {
                console.log(`[debug] Found matching bench: "${matchingBench.text}" with value: ${matchingBench.value}`);
                await page.select(benchSelector, matchingBench.value);
                console.log(`✅ Selected bench: "${matchingBench.text}"`);
                results.bench = 'success';
            } else {
                console.log(`❌ Bench "${bench}" not found in options`);
            }
            
            await page.waitForTimeout(2000);
            
        } catch (benchError) {
            console.error('❌ Error selecting bench:', benchError.message);
        }

        // Step 2: Select Case Type
        console.log('[step 2] Selecting case type...');
        try {
            const caseTypeSelector = 'select[name="case_type"]';
            await page.waitForSelector(caseTypeSelector, { timeout: 10000 });
            
            const caseTypeOptions = await page.evaluate((selector) => {
                const select = document.querySelector(selector);
                if (!select) return [];
                return Array.from(select.options).map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
            }, caseTypeSelector);
            
            console.log('[debug] Available case type options:', caseTypeOptions.slice(0, 5));
            
            // Find matching case type option
            const matchingCaseType = caseTypeOptions.find(option => 
                option.text.toLowerCase().includes(caseType.toLowerCase()) ||
                caseType.toLowerCase().includes(option.text.toLowerCase())
            );
            
            if (matchingCaseType) {
                console.log(`[debug] Found matching option: "${matchingCaseType.text}" with value: ${matchingCaseType.value}`);
                await page.select(caseTypeSelector, matchingCaseType.value);
                console.log(`✅ Selected using page.select(): "${matchingCaseType.text}"`);
                results.caseType = 'success';
            } else {
                console.log(`❌ Case type "${caseType}" not found in options`);
            }
            
            await page.waitForTimeout(1000);
            
        } catch (caseTypeError) {
            console.error('❌ Error selecting case type:', caseTypeError.message);
        }

        // Step 3: Fill CP Number - FIXED TO USE ONLY DIARY NUMBER
        console.log('[step 3] Filling CP number...');
        try {
            // Use ONLY the cpNo (diary number), don't combine with year
            const cpNumber = cpNo ? cpNo.toString() : '';  // Just use cpNo as-is
            
            console.log(`[info] Entering CP Number: ${cpNumber}`);  // Should be just "36"
            
            const cpSelectors = [
                '#cpno',
                'input[name="cp_no"]',
                'input[name="cpno"]',
                'input[placeholder*="CP"]',
                'input[placeholder*="Case"]'
            ];
            
            let cpFilled = false;
            for (const selector of cpSelectors) {
                try {
                    console.log(`[debug] Trying CP number selector: ${selector}`);
                    await page.waitForSelector(selector, { timeout: 3000 });
                    
                    // Clear and fill
                    await page.click(selector, { clickCount: 3 });
                    await page.type(selector, cpNumber);  // Enter just the diary number
                    
                    // Verify
                    const filledValue = await page.$eval(selector, input => input.value);
                    if (filledValue === cpNumber) {
                        console.log(`✅ CP Number entered: ${cpNumber} using ${selector}`);
                        results.cpNo = 'success';
                        cpFilled = true;
                        break;
                    }
                } catch (selectorError) {
                    console.log(`[debug] Selector ${selector} failed: ${selectorError.message}`);
                    continue;
                }
            }
            
            if (!cpFilled) {
                console.log('❌ Failed to fill CP number with any selector');
            }
            
            await page.waitForTimeout(500);
            
        } catch (cpError) {
            console.error('❌ Error filling CP number:', cpError.message);
        }

        // Step 4: Select Year - FIXED TO USE SEPARATE YEAR
        console.log('[step 4] Selecting year...');
        try {
            const yearSelector = 'select[name="year"]';
            await page.waitForSelector(yearSelector, { timeout: 10000 });
            
            const yearOptions = await page.evaluate((selector) => {
                const select = document.querySelector(selector);
                if (!select) return [];
                return Array.from(select.options).map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
            }, yearSelector);
            
            console.log('[debug] Available year options:', yearOptions);
            
            // Find matching year - use the year parameter directly
            const yearToSelect = year ? year.toString() : '';
            const matchingYear = yearOptions.find(option => 
                option.value === yearToSelect ||
                option.text === yearToSelect ||
                option.value.includes(yearToSelect) ||
                option.text.includes(yearToSelect)
            );
            
            if (matchingYear) {
                console.log(`[debug] Found matching year: "${matchingYear.text}" with value: ${matchingYear.value}`);
                await page.select(yearSelector, matchingYear.value);
                console.log(`✅ Selected year: "${matchingYear.text}"`);
                results.year = 'success';
            } else {
                console.log(`❌ Year "${year}" not found in options`);
                // Try to select first available year if exact match not found
                if (yearOptions.length > 1) {
                    const firstYear = yearOptions.find(opt => opt.value !== '');
                    if (firstYear) {
                        await page.select(yearSelector, firstYear.value);
                        console.log(`⚠️ Selected fallback year: "${firstYear.text}"`);
                        results.year = 'success';
                    }
                }
            }
            
            await page.waitForTimeout(500);
            
        } catch (yearError) {
            console.error('❌ Error selecting year:', yearError.message);
        }

        // Final results
        console.log('[debug] Form filling results:', results);
        
        const successCount = Object.values(results).filter(r => r === 'success').length;
        const totalFields = Object.keys(results).length;
        
        if (successCount >= 3) { // At least 3 out of 4 fields filled
            console.log(`✅ NCLT form filled successfully (${successCount}/${totalFields} fields)`);
            return true;
        } else {
            console.log(`⚠️ NCLT form partially filled (${successCount}/${totalFields} fields)`);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error filling NCLT form:', error.message);
        throw error;
    }
}

 

// Handle captcha solving with retries (similar to District Court scraper)
async function handleNCLTCaptcha(page, captchaRetries = 5) {
    console.log('[captcha] Starting NCLT captcha handling...');
    let success = false;
    
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);
        
        try {
            // Check if captcha is present
            const captchaInfo = await page.evaluate(() => {
                const captchaInput = document.querySelector('input[name*="captcha"], input[placeholder*="captcha"], input[placeholder*="Captcha"], input[id*="captcha"]');
                const captchaImage = document.querySelector('img[src*="captcha"], img[alt*="captcha"]') || 
                                   document.querySelector('img');
                
                return {
                    hasCaptchaInput: !!captchaInput,
                    hasCaptchaImage: !!captchaImage,
                    captchaInputSelector: captchaInput ? 
                        (captchaInput.id ? `#${captchaInput.id}` : 
                         captchaInput.name ? `input[name="${captchaInput.name}"]` : 
                         'input[placeholder*="captcha"]') : null,
                    captchaImageSrc: captchaImage ? captchaImage.src : null
                };
            });
            
            if (!captchaInfo.hasCaptchaInput) {
                console.log('[captcha] ✅ No captcha detected on page - proceeding without captcha');
                success = true;
                break;
            }
            
            console.log('[captcha] Captcha detected, attempting to solve...');
            
            // Wait for captcha image to be present
            if (captchaInfo.hasCaptchaImage) {
                await page.waitForTimeout(1000);

                // Get captcha image element
                const captchaElement = await page.$('img[src*="captcha"], img[alt*="captcha"], img');
                if (!captchaElement) {
                    throw new Error('Captcha image element not found');
                }

                // Take screenshot of captcha
                const captchaBuffer = await captchaElement.screenshot();
                console.log(`[captcha] Captured captcha image for attempt ${attempt}`);

                // Import the captcha solver
                const { solveCaptcha } = require('./captcha');
                
                // Solve captcha using OpenAI Vision API
                const captchaAnswer = await solveCaptcha(captchaBuffer);
                console.log(`[captcha] Entering answer: ${captchaAnswer}`);

                // Clear previous input if retry
                if (attempt > 1) {
                    await page.click(captchaInfo.captchaInputSelector, { clickCount: 3 });
                    await page.keyboard.press('Delete');
                    await page.waitForTimeout(500);
                }

                // Enter captcha answer
                await page.type(captchaInfo.captchaInputSelector, captchaAnswer);
                await page.waitForTimeout(1000);

                console.log('[captcha] ✅ Captcha entered successfully');
                success = true;
                break;
            } else {
                console.log('[captcha] ⚠️ Captcha input found but no image - proceeding without captcha solution');
                success = true;
                break;
            }
            
        } catch (error) {
            console.log(`[captcha] Attempt ${attempt} failed:`, error.message);
            if (attempt === captchaRetries) {
                console.log('[captcha] ⚠️ All captcha attempts failed - proceeding anyway');
                success = true; // Continue without captcha
                break;
            }
            
            // Refresh page for next attempt
            if (attempt < captchaRetries) {
                console.log('[captcha] Refreshing page for next attempt...');
                await page.reload({ waitUntil: 'networkidle2' });
                await page.waitForTimeout(2000);
                
                // Need to re-fill form after page refresh
                // This will be handled by the calling function
            }
        }
    }

    return success;
}

// Get page info for debugging
async function getPageInfo(page) {
    try {
        const pageInfo = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasForm: !!document.querySelector('form'),
                hasTables: document.querySelectorAll('table').length,
                bodyText: document.body.textContent.substring(0, 500)
            };
        });
        
        console.log('[debug] Page info:', pageInfo);
        return pageInfo;
    } catch (error) {
        console.error('[debug] Error getting page info:', error.message);
        return null;
    }
}

// Submit NCLT search form
// Fix the submit button selector around line 150-160:
// Replace the submitNCLTForm function (around line 200):

// Submit NCLT search form (DIRECT NAVIGATION: Bypass form submission by constructing URL)
async function submitNCLTForm(page, formParams) {
    console.log('[submit] Starting direct navigation to NCLT results...');
    
    try {
        // Extract parameters for URL construction
        const bench = formParams.bench || 'Principal Bench';
        const caseType = formParams.caseType || 'Company Petition IB (IBC)';
        const cpNo = formParams.cpNo || formParams.diaryNumber || '36';
        const year = formParams.year || '2022';
        
        console.log('[submit] Parameters for URL construction:', { bench, caseType, cpNo, year });
        
        // Map bench to value - Enhanced with all bench options
        let benchValue = 'delhi_1'; // Default to Principal Bench
        const benchLower = bench.toLowerCase();
        
        if (benchLower.includes('principal') || benchLower.includes('delhi')) {
            benchValue = 'delhi_1';
        } else if (benchLower.includes('mumbai')) {
            benchValue = 'mumbai';
        } else if (benchLower.includes('kolkata')) {
            benchValue = 'kolkata';
        } else if (benchLower.includes('chennai')) {
            benchValue = 'chennai';
        } else if (benchLower.includes('amravati')) {
            benchValue = 'amravati';
        } else if (benchLower.includes('ahmedabad')) {
            benchValue = 'ahmedabad';
        } else if (benchLower.includes('allahabad')) {
            benchValue = 'allahabad';
        } else if (benchLower.includes('bengaluru')) {
            benchValue = 'bengaluru';
        } else if (benchLower.includes('chandigarh')) {
            benchValue = 'chandigarh';
        } else if (benchLower.includes('cuttak')) {
            benchValue = 'cuttak';
        } else if (benchLower.includes('guwahati')) {
            benchValue = 'guwahati';
        } else if (benchLower.includes('hyderabad')) {
            benchValue = 'hyderabad';
        } else if (benchLower.includes('indore')) {
            benchValue = 'indore';
        } else if (benchLower.includes('jaipur')) {
            benchValue = 'jaipur';
        } else if (benchLower.includes('kochi')) {
            benchValue = 'kochi';
        }
        
        // Map case type to value
        let caseTypeValue = '16'; // Default to Company Petition IB (IBC)
        if (caseType.toLowerCase().includes('company petition ib')) {
            caseTypeValue = '16';
        } else if (caseType.toLowerCase().includes('company petition')) {
            caseTypeValue = '1';
        } else if (caseType.toLowerCase().includes('company appeal')) {
            caseTypeValue = '2';
        }
        
        console.log('[submit] Mapped values:', { 
            benchValue, 
            caseTypeValue, 
            cpNo, 
            year 
        });
        
        // Create Base64 encoded URL parameters (like the real website)
        const benchEncoded = Buffer.from(benchValue).toString('base64');
        const caseTypeEncoded = Buffer.from(caseTypeValue).toString('base64');
        const cpNoEncoded = Buffer.from(cpNo).toString('base64');
        const yearEncoded = Buffer.from(year).toString('base64');
        
        console.log('[submit] Base64 encoded parameters:', {
            bench: benchEncoded,
            case_type: caseTypeEncoded,
            cp_no: cpNoEncoded,
            year: yearEncoded
        });
        
        // Construct the direct results URL
        const resultsUrl = `https://nclt.gov.in/order-cp-wise-search?bench=${benchEncoded}&case_type=${caseTypeEncoded}&cp_no=${cpNoEncoded}&year=${yearEncoded}`;
        
        console.log('[submit] Constructed results URL:', resultsUrl);
        console.log('[submit] Navigating directly to results page...');
        
        // Navigate directly to the results page
        await page.goto(resultsUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Wait for content to load
        await page.waitForTimeout(3000);
        
        const finalUrl = page.url();
        console.log('[submit] Final URL after direct navigation:', finalUrl);
        
        // Check if we're on the correct results page
        const pageAnalysis = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasTable: document.querySelectorAll('table').length > 0,
                tableCount: document.querySelectorAll('table').length,
                hasSearchForm: document.querySelector('form') !== null,
                bodyTextSample: document.body.textContent.substring(0, 200),
                isResultsPage: window.location.href.includes('order-cp-wise-search'),
                hasNoResultsMessage: document.body.textContent.toLowerCase().includes('no records found') ||
                                   document.body.textContent.toLowerCase().includes('no data available'),
                tableHeaders: Array.from(document.querySelectorAll('th')).map(th => th.textContent.trim()),
                rowCount: document.querySelectorAll('tbody tr').length
            };
        });
        
        console.log('[submit] Page analysis after direct navigation:', pageAnalysis);
        
        if (pageAnalysis.isResultsPage) {
            if (pageAnalysis.hasTable && pageAnalysis.rowCount > 0) {
                console.log('[submit] ✅ Successfully reached results page with data table');
                console.log(`[submit] Found ${pageAnalysis.rowCount} result rows`);
                return true;
            } else if (pageAnalysis.hasNoResultsMessage) {
                console.log('[submit] ✅ Reached results page but no matching records found');
                return true;
            } else {
                console.log('[submit] ✅ Reached results page, checking for table structure...');
                return true;
            }
        } else {
            console.log('[submit] ⚠️ Navigation may not have reached expected results page');
            console.log('[submit] Current URL:', pageAnalysis.url);
            console.log('[submit] Current title:', pageAnalysis.title);
            
            // Check if we got redirected to an error page or login page
            if (pageAnalysis.url.includes('error') || pageAnalysis.url.includes('login')) {
                console.log('[submit] ❌ Redirected to error or login page');
                return false;
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('[submit] Error during direct navigation:', error.message);
        return false;
    }
}

// Check for results (improved detection for NCLT)
async function checkForResults(page) {
    try {
        console.log('🔍 Checking for search results...');
        
        // Wait a bit for dynamic content to load
        await page.waitForTimeout(3000);
        
        const resultCheck = await page.evaluate(() => {
            const url = window.location.href;
            const bodyText = document.body.textContent.toLowerCase();
            
            // Look for tables
            const tables = document.querySelectorAll('table');
            const hasTable = tables.length > 0;
            
            // DETAILED TABLE ANALYSIS
            const tableDetails = [];
            tables.forEach((table, index) => {
                const rows = table.querySelectorAll('tr');
                const headerRow = rows[0];
                const headers = headerRow ? Array.from(headerRow.querySelectorAll('th, td')).map(cell => cell.textContent.trim()) : [];
                
                const dataRows = Array.from(rows).slice(1); // Skip header
                const sampleData = dataRows.slice(0, 3).map(row => 
                    Array.from(row.querySelectorAll('td')).map(cell => ({
                        text: cell.textContent.trim(),
                        hasLink: !!cell.querySelector('a'),
                        linkHref: cell.querySelector('a')?.href || null,
                        linkText: cell.querySelector('a')?.textContent.trim() || null
                    }))
                );
                
                tableDetails.push({
                    index: index,
                    headers: headers,
                    totalRows: rows.length,
                    dataRows: dataRows.length,
                    sampleData: sampleData,
                    hasLinks: sampleData.some(row => row.some(cell => cell.hasLink))
                });
            });
            
            // More comprehensive result detection
            const hasResults = bodyText.includes('filing') ||
                             bodyText.includes('case') ||
                             bodyText.includes('party') ||
                             bodyText.includes('petitioner') ||
                             bodyText.includes('respondent') ||
                             bodyText.includes('pending') ||
                             bodyText.includes('cp(ib)') ||
                             hasTable;
            
            // Check for no results messages - Enhanced detection
            const hasNoResultsMessage = bodyText.includes('no records found') ||
                                       bodyText.includes('no data found') ||
                                       bodyText.includes('record not found') ||
                                       bodyText.includes('no results') ||
                                       bodyText.includes('no cases found') ||
                                       bodyText.includes('no data available') ||
                                       bodyText.includes('please click here for data prior to') ||
                                       bodyText.includes('data prior to 31 august,2021');
            
            // Count potential data rows
            let dataRowCount = 0;
            tables.forEach(table => {
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 0) {
                        // Check if row contains actual data (not headers)
                        const firstCellText = cells[0].textContent.trim().toLowerCase();
                        if (!firstCellText.includes('s.no') && 
                            !firstCellText.includes('serial') &&
                            !firstCellText.includes('filing number') &&
                            cells.length >= 3) {
                            dataRowCount++;
                        }
                    }
                });
            });
            
            // Look for specific NCLT indicators
            const ncltIndicators = {
                hasFilingNumber: bodyText.includes('filing number') || bodyText.includes('filing no'),
                hasCaseNumber: bodyText.includes('case number') || bodyText.includes('case no'),
                hasPendingStatus: bodyText.includes('pending'),
                hasParties: bodyText.includes('petitioner') || bodyText.includes('respondent'),
                hasCompanyPetition: bodyText.includes('cp(ib)') || bodyText.includes('company petition')
            };
            
            const ncltScore = Object.values(ncltIndicators).filter(Boolean).length;
            
            // PAGE CONTENT SAMPLE
            const contentSample = document.body.textContent.substring(0, 500);
            
            return {
                url,
                hasTable,
                totalTables: tables.length,
                dataRowCount,
                hasNoResultsMessage,
                hasResults,
                ncltIndicators,
                ncltScore,
                tableDetails,
                contentSample
            };
        });
        
        console.log('[debug] Enhanced results check:', {
            url: resultCheck.url,
            hasTable: resultCheck.hasTable,
            totalTables: resultCheck.totalTables,
            dataRowCount: resultCheck.dataRowCount,
            hasNoResultsMessage: resultCheck.hasNoResultsMessage,
            ncltScore: resultCheck.ncltScore
        });
        
        // DETAILED LOGGING OF TABLES
        if (resultCheck.tableDetails && resultCheck.tableDetails.length > 0) {
            console.log('[📊 TABLE ANALYSIS]');
            resultCheck.tableDetails.forEach(table => {
                console.log(`[table ${table.index}] Headers:`, table.headers);
                console.log(`[table ${table.index}] Data rows: ${table.dataRows}/${table.totalRows}`);
                console.log(`[table ${table.index}] Has links: ${table.hasLinks}`);
                
                if (table.sampleData.length > 0) {
                    console.log(`[table ${table.index}] Sample data:`);
                    table.sampleData.forEach((row, rowIndex) => {
                        console.log(`  Row ${rowIndex + 1}:`, row.map(cell => ({
                            text: cell.text.substring(0, 50),
                            hasLink: cell.hasLink,
                            linkText: cell.linkText
                        })));
                    });
                }
            });
        }
        
        // CONTENT SAMPLE
        console.log('[📄 PAGE CONTENT SAMPLE]:', resultCheck.contentSample);
        
        if (resultCheck.hasNoResultsMessage) {
            return {
                success: false,
                hasResults: false,
                message: 'This case number or diary number does not exist. Please check and try again.',
                errorType: 'NO_CASE_FOUND'
            };
        }
        
        // If we have NCLT indicators and data rows, consider it successful
        if (resultCheck.ncltScore >= 2 && resultCheck.dataRowCount > 0) {
            return {
                success: true,
                hasResults: true,
                message: `Found ${resultCheck.dataRowCount} potential records with NCLT indicators`
            };
        }
        
        // If we have tables with data, it's likely results
        if (resultCheck.hasTable && resultCheck.dataRowCount > 0) {
            return {
                success: true,
                hasResults: true,
                message: `Found ${resultCheck.dataRowCount} records in ${resultCheck.totalTables} tables`
            };
        }
        
        // If we have NCLT indicators but no clear data rows, still try to extract
        if (resultCheck.ncltScore >= 2) {
            return {
                success: true,
                hasResults: true,
                message: `Found NCLT content (score: ${resultCheck.ncltScore}) - attempting extraction`
            };
        }
        
        if (!resultCheck.hasTable && !resultCheck.hasResults) {
            console.log('❓ No clear results found');
            console.log('[debug] Body text sample:', resultCheck.contentSample);
            return {
                success: true,
                hasResults: false,
                message: 'No results table or NCLT content found'
            };
        }

        return {
            success: true,
            hasResults: false,
            message: 'No data rows found in table'
        };
        
    } catch (error) {
        console.error('❌ Error checking results:', error.message);
        return {
            success: false,
            error: error.message,
            hasResults: false
        };
    }
}

// Extract table data (enhanced for NCLT structure) - FIXED FOR EMPTY ROWS
async function extractTableData(page) {
    console.log('[extract] Extracting data from NCLT results table...');
    
    try {
        // Wait for results to load
        await page.waitForTimeout(5000);
        
        // First, let's see what's actually on the page
        const pageInfo = await page.evaluate(() => {
            return {
                title: document.title,
                url: window.location.href,
                bodyText: document.body.textContent.substring(0, 500),
                tableCount: document.querySelectorAll('table').length,
                formCount: document.querySelectorAll('form').length,
                hasResults: document.body.textContent.toLowerCase().includes('result')
            };
        });
        
        console.log('[extract] Page analysis:', pageInfo);
        
        const extraction = await page.evaluate(() => {
            console.log('[page] Starting enhanced table data extraction...');
            
            const results = [];
            
            // Strategy 1: Look for standard tables
            const tables = document.querySelectorAll('table');
            console.log(`[page] Found ${tables.length} tables on page`);
            
            if (tables.length > 0) {
                tables.forEach((table, tableIndex) => {
                    console.log(`[page] Analyzing table ${tableIndex + 1}...`);
                    
                    // Get ALL rows including those in tbody, thead, etc.
                    const allRows = Array.from(table.querySelectorAll('tr'));
                    console.log(`[page] Table ${tableIndex + 1} has ${allRows.length} total rows`);
                    
                    if (allRows.length === 0) return;
                    
                    // Let's analyze each row to understand the structure
                    allRows.forEach((row, rowIndex) => {
                        const cells = Array.from(row.querySelectorAll('td, th'));
                        const cellTexts = cells.map(cell => cell.textContent.trim());
                        
                        console.log(`[page] Row ${rowIndex}: ${cells.length} cells:`, cellTexts);
                        
                        // Skip obvious header rows - Enhanced detection
                        if (cells.length > 0) {
                            const firstCell = cellTexts[0].toLowerCase();
                            const allCellText = cellTexts.join(' ').toLowerCase();
                            
                            // Check for header row indicators
                            if (firstCell.includes('s.no') || 
                                firstCell.includes('serial') ||
                                firstCell.includes('filing') ||
                                firstCell === 's. no' ||
                                firstCell === 'sr. no' ||
                                row.querySelector('th') ||
                                allCellText.includes('filing no.') ||
                                allCellText.includes('case no') ||
                                allCellText.includes('petitioner vs. respondent') ||
                                allCellText.includes('listing date') ||
                                (cellTexts.length >= 4 && cellTexts[1].toLowerCase().includes('filing') && cellTexts[2].toLowerCase().includes('case'))) {
                                console.log(`[page] Skipping header row ${rowIndex}: ${cellTexts.join(' | ')}`);
                                return;
                            }
                        }
                        
                        // Process rows with actual data - Enhanced validation
                        if (cells.length >= 3) {
                            // Check if this row has substantial content and looks like case data
                            const hasSubstantialContent = cellTexts.some(text => 
                                text.length > 5 && 
                                !text.toLowerCase().includes('no data') &&
                                !text.toLowerCase().includes('no record') &&
                                !text.toLowerCase().includes('filing no.') &&
                                !text.toLowerCase().includes('case no') &&
                                !text.toLowerCase().includes('petitioner vs') &&
                                !text.toLowerCase().includes('please click here') &&
                                !text.toLowerCase().includes('data prior to') &&
                                text !== '-' && text !== ''
                            );
                            
                            // Additional check for actual case data patterns
                            const hasCasePattern = cellTexts.some(text => 
                                /\d{6,}/g.test(text) ||                    // Filing numbers (6+ digits)
                                /\d{2,4}\/\d{4}/g.test(text) ||           // Case numbers like 54/2021
                                text.includes(' VS ') ||                   // Party names
                                text.includes(' V/S ') ||
                                /\d{2}-\d{2}-\d{4}/g.test(text)           // Dates like 03-08-2021
                            );
                            
                            if (hasSubstantialContent && hasCasePattern) {
                                console.log(`[page] Processing valid case data row ${rowIndex}: ${cellTexts[0]} | ${cellTexts[1]} | ${cellTexts[2]}`);
                                
                                const rowData = {
                                    rowIndex: rowIndex,
                                    tableIndex: tableIndex,
                                    source: 'table',
                                    serialNumber: cellTexts[0] || '',
                                    filingNumber: cellTexts[1] || '',
                                    caseNumber: cellTexts[2] || '',
                                    petitionerVsRespondent: cellTexts[3] || '',
                                    listingDate: cellTexts[4] || '',
                                    status: cellTexts[5] || cellTexts[cellTexts.length - 1] || '',
                                    statusLink: null,
                                    rawCells: cellTexts,
                                    cellCount: cells.length
                                };
                                
                                // Look for status links in the row
                                cells.forEach((cell, cellIndex) => {
                                    const links = Array.from(cell.querySelectorAll('a'));
                                    if (links.length > 0) {
                                        links.forEach(link => {
                                            const linkText = link.textContent.trim().toLowerCase();
                                            const linkHref = link.href;
                                            
                                            console.log(`[page] Found link in row ${rowIndex}, cell ${cellIndex}: "${linkText}" -> ${linkHref}`);
                                            
                                            // Set status link if it looks like a status link
                                            if (linkText.includes('pending') || 
                                                linkText.includes('disposed') ||
                                                linkText.includes('status') ||
                                                cellIndex >= cells.length - 2) { // Last two columns often have status
                                                rowData.statusLink = linkHref;
                                                console.log(`[page] Set status link: ${linkHref}`);
                                            }
                                        });
                                    }
                                });
                                
                                results.push(rowData);
                            } else {
                                console.log(`[page] Skipping row ${rowIndex}: no case pattern detected - ${cellTexts.join(' | ')}`);
                            }
                        } else {
                            console.log(`[page] Skipping row ${rowIndex}: too few cells (${cells.length})`);
                        }
                    });
                });
            }
            
            // Strategy 2: If no table data found, look for alternative structures
            if (results.length === 0) {
                console.log('[page] No table data found, looking for alternative structures...');
                
                // Look for div-based results, but exclude navigation elements
                const resultDivs = document.querySelectorAll('div[class*="result"], div[class*="case"], div[class*="record"], .row');
                console.log(`[page] Found ${resultDivs.length} potential result divs`);
                
                if (resultDivs.length > 0) {
                    resultDivs.forEach((div, index) => {
                        const text = div.textContent.trim();
                        
                        // Filter out navigation elements
                        const isNavigation = text.includes('Header Menu') || 
                                           text.includes('Footer menu') || 
                                           text.includes('Show —') || 
                                           text.includes('Hide —') ||
                                           text.includes('Breadcrumb') ||
                                           text.includes('Order Case Wise') ||
                                           text.includes('Case No. Search') ||
                                           text.includes('Old Orders and Judgments') ||
                                           div.closest('nav, header, footer, .navigation, .menu') ||
                                           div.querySelector('nav, .menu, .navigation');
                        
                        // Only process if it's substantial content and not navigation
                        if (text && text.length > 30 && !isNavigation) {
                            // Additional check for actual case data patterns
                            const hasFilingNumber = /\d{6,}/g.test(text) || /\d{2,4}\/\d{4}/g.test(text);
                            const hasPartyNames = text.includes(' VS ') || text.includes(' V/S ') || text.includes(' vs ');
                            const hasLegalTerms = text.includes('Petitioner') || text.includes('Respondent') || text.includes('Advocate');
                            
                            if (hasFilingNumber || hasPartyNames || hasLegalTerms) {
                                console.log(`[page] Processing valid case div ${index}: ${text.substring(0, 100)}...`);
                                
                                results.push({
                                    rowIndex: index,
                                    source: 'div',
                                    serialNumber: (index + 1).toString(),
                                    filingNumber: '',
                                    caseNumber: '',
                                    petitionerVsRespondent: text.substring(0, 200),
                                    listingDate: '',
                                    status: 'Found in div',
                                    statusLink: null,
                                    rawCells: [text],
                                    cellCount: 1
                                });
                            } else {
                                console.log(`[page] Skipping div ${index}: no legal content patterns`);
                            }
                        } else if (isNavigation) {
                            console.log(`[page] Skipping div ${index}: navigation element`);
                        }
                    });
                }
                
                // Strategy 3: Look for any text that might contain case information
                if (results.length === 0) {
                    console.log('[page] Still no data, scanning page text...');
                    
                    const pageText = document.body.textContent;
                    
                    // Look for filing number patterns
                    const filingNumbers = pageText.match(/\d{2,4}\/\d{4}\/\d+/g);
                    console.log(`[page] Found potential filing numbers:`, filingNumbers);
                    
                    if (filingNumbers && filingNumbers.length > 0) {
                        filingNumbers.forEach((filing, index) => {
                            results.push({
                                rowIndex: index,
                                source: 'text_scan',
                                serialNumber: (index + 1).toString(),
                                filingNumber: filing,
                                caseNumber: '',
                                petitionerVsRespondent: 'Found via text scan',
                                listingDate: '',
                                status: 'Text scan result',
                                statusLink: null,
                                rawCells: [filing],
                                cellCount: 1
                            });
                        });
                    }
                }
            }
            
            console.log(`[page] Final extraction results: ${results.length} items`);
            return results;
        });
        
        console.log(`[extract] Extracted ${extraction.length} rows from page`);
        
        if (extraction.length > 0) {
            console.log('[extract] Sample extraction:', {
                source: extraction[0].source,
                serialNumber: extraction[0].serialNumber,
                filingNumber: extraction[0].filingNumber,
                status: extraction[0].status,
                hasStatusLink: !!extraction[0].statusLink,
                cellCount: extraction[0].cellCount
            });
            
            // Log all extractions for debugging
            extraction.forEach((item, index) => {
                console.log(`[extract] Item ${index + 1}:`, {
                    source: item.source,
                    filing: item.filingNumber,
                    status: item.status,
                    hasLink: !!item.statusLink,
                    cells: item.cellCount
                });
            });
        } else {
            console.log('[extract] ⚠️ No data extracted from page!');
            
            // Additional debugging - let's see what's really on the page
            const debugInfo = await page.evaluate(() => {
                return {
                    fullPageText: document.body.textContent.substring(0, 1000),
                    allTables: Array.from(document.querySelectorAll('table')).map((table, i) => ({
                        index: i,
                        rowCount: table.querySelectorAll('tr').length,
                        innerHTML: table.innerHTML.substring(0, 500)
                    })),
                    allForms: Array.from(document.querySelectorAll('form')).map(form => form.action || 'no action'),
                    hasErrorMessage: document.body.textContent.toLowerCase().includes('error') ||
                                   document.body.textContent.toLowerCase().includes('no result') ||
                                   document.body.textContent.toLowerCase().includes('not found')
                };
            });
            
            console.log('[extract] Debug info:', debugInfo);
        }
        
        return extraction;
        
    } catch (error) {
        console.error('[extract] Error extracting table data:', error.message);
        console.error('[extract] Stack trace:', error.stack);
        return [];
    }
}

// Process detail links (similar to District Court scraper)
async function processDetailLinks(page, tableData) {
    console.log('[process] Processing status links for detailed case information...');
    
    const detailedCases = [];
    
    for (let i = 0; i < tableData.length; i++) {
        const row = tableData[i];
        
        // Process rows that have status links (typically "Pending" status)
        if (row.statusLink && row.status.toLowerCase().includes('pending')) {
            console.log(`[process] Processing case ${i + 1}/${tableData.length}: ${row.filingNumber || row.caseNumber}`);
            
            try {
                // Navigate to case details page
                console.log(`[navigate] Going to: ${row.statusLink}`);
                await page.goto(row.statusLink, { 
                    waitUntil: 'networkidle2', 
                    timeout: 30000 
                });
                await page.waitForTimeout(2000);
                
                // Extract detailed case information
                const detailedInfo = await extractCaseDetails(page);
                
                if (detailedInfo && Object.keys(detailedInfo).length > 0) {
                    // Combine basic row data with detailed information
                    const combinedData = {
                        ...row,
                        ...detailedInfo,
                        detailsUrl: row.statusLink,
                        hasDetailedInfo: true
                    };
                    
                    detailedCases.push(combinedData);
                    console.log(`✅ Extracted details for: ${row.filingNumber || row.caseNumber}`);
                } else {
                    console.log(`⚠️  No detailed info found for: ${row.filingNumber || row.caseNumber}`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing case ${row.filingNumber || row.caseNumber}:`, error.message);
                // Continue with next case
            }
        } else {
            console.log(`⏭️  Skipping row ${i + 1}: No status link or not pending`);
        }
    }
    
    console.log(`[process] Extracted detailed info for ${detailedCases.length}/${tableData.length} cases`);
    return detailedCases;
}

// Extract detailed case information (simplified, similar to District Court scraper)
async function extractCaseDetails(page) {
    console.log('[details] Extracting detailed case information from NCLT case details page...');
    
    try {
        // Wait for page content to load
        await page.waitForTimeout(2000);
        
        const caseDetails = await page.evaluate(() => {
            const details = {
                // Basic case information (from NCLT case details page)
                filingNumber: '',
                filingDate: '',
                partyName: '',
                petitionerAdvocate: '',
                caseNumber: '',
                registeredOn: '',
                lastListed: '',
                nextListingDate: '',
                caseStatus: '',
                respondentAdvocate: '',
                
                // Additional fields that might be present
                caseTitle: '',
                caseType: '',
                benchName: '',
                judgeName: '',
                courtComplex: '',
                natureOfCase: '',
                caseValue: '',
                currentStage: '',
                
                // Order/hearing history
                orderDetails: [],
                hearingHistory: [],
                listingHistory: [],
                allParties: [],
                
                // Raw extracted data for debugging
                rawTables: [],
                additionalFields: {}
            };
            
            console.log('[debug] Starting NCLT case details extraction...');
            
            // Extract from table structures (primary method for NCLT)
            const tables = document.querySelectorAll('table');
            console.log(`[debug] Found ${tables.length} tables on case details page`);
            
            tables.forEach((table, tableIndex) => {
                const tableData = {
                    index: tableIndex,
                    rows: []
                };
                
                const rows = table.querySelectorAll('tr');
                rows.forEach((row, rowIndex) => {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    
                    if (cells.length >= 2) {
                        const label = cells[0].textContent.trim().toLowerCase();
                        const value = cells[1].textContent.trim();
                        
                        tableData.rows.push({ label, value });
                        
                        // NCLT-specific field mapping based on your case details image
                        if (value && value.length > 0) {
                            // Primary NCLT fields from the case details page
                            if (label.includes('filing number')) {
                                details.filingNumber = value;
                            } else if (label.includes('filing date')) {
                                details.filingDate = value;
                            } else if (label.includes('party name')) {
                                details.partyName = value;
                            } else if (label.includes('petitioner advocate') || label.includes('petitioner counsel')) {
                                details.petitionerAdvocate = value;
                            } else if (label.includes('case number')) {
                                details.caseNumber = value;
                            } else if (label.includes('registered on')) {
                                details.registeredOn = value;
                            } else if (label.includes('last listed')) {
                                details.lastListed = value;
                            } else if (label.includes('next listing date')) {
                                details.nextListingDate = value;
                            } else if (label.includes('case status')) {
                                details.caseStatus = value;
                            } else if (label.includes('respondent advocate') || label.includes('respondent counsel')) {
                                details.respondentAdvocate = value;
                            }
                            
                            // Additional fields
                            else if (label.includes('case title') || label.includes('title')) {
                                details.caseTitle = value;
                            } else if (label.includes('case type') || label.includes('type of case')) {
                                details.caseType = value;
                            } else if (label.includes('bench') || label.includes('coram')) {
                                details.benchName = value;
                            } else if (label.includes('judge') || label.includes('hon\'ble')) {
                                details.judgeName = value;
                            } else if (label.includes('court') || label.includes('complex')) {
                                details.courtComplex = value;
                            } else if (label.includes('nature') || label.includes('nature of case')) {
                                details.natureOfCase = value;
                            } else if (label.includes('value') || label.includes('case value')) {
                                details.caseValue = value;
                            } else if (label.includes('stage') || label.includes('current stage')) {
                                details.currentStage = value;
                            }
                            
                            // Store unknown fields for reference
                            else {
                                details.additionalFields[label] = value;
                            }
                        }
                    }
                });
                
                if (tableData.rows.length > 0) {
                    details.rawTables.push(tableData);
                }
            });
            
            // Extract listing history from tables (Order/Judgement section)
            const historyTables = document.querySelectorAll('table');
            console.log(`[debug] Processing ${historyTables.length} tables for listing history`);
            
            historyTables.forEach((table, tableIdx) => {
                const headers = Array.from(table.querySelectorAll('th, tr:first-child td'))
                    .map(th => th.textContent.trim().toLowerCase());
                
                console.log(`[debug] Table ${tableIdx} headers:`, headers);
                
                // Check if this looks like a listing/order history table
                const isListingTable = headers.some(h => 
                    (h.includes('date') && (h.includes('listing') || h.includes('upload') || h.includes('order'))) ||
                    h.includes('s.no') || h.includes('order/judgement') || h.includes('order') ||
                    h.includes('judgment') || h.includes('serial') || h.includes('view')
                );
                
                if (isListingTable) {
                    console.log(`[debug] Found listing history table ${tableIdx}`);
                    
                    // Get all rows (both tbody tr and direct tr)
                    const allRows = Array.from(table.querySelectorAll('tr'));
                    const dataRows = allRows.slice(1); // Skip header row
                    
                    console.log(`[debug] Processing ${dataRows.length} data rows in table ${tableIdx}`);
                    
                    dataRows.forEach((row, rowIdx) => {
                        const cells = Array.from(row.querySelectorAll('td'));
                        const cellTexts = cells.map(td => td.textContent.trim());
                        
                        // Skip empty rows
                        if (cells.length === 0 || cellTexts.every(text => !text || text.length === 0)) {
                            return;
                        }
                        
                        console.log(`[debug] Row ${rowIdx} cells:`, cellTexts);
                        
                        const historyEntry = {
                            serialNo: cellTexts[0] || '',
                            dateOfListing: cellTexts[1] || '',
                            dateOfUpload: cellTexts[2] || '',
                            orderJudgement: cellTexts[3] || '',
                            rawCells: cellTexts,
                            tableIndex: tableIdx,
                            rowIndex: rowIdx,
                            pdfLinks: []
                        };
                        
                        // Enhanced PDF link extraction - check all cells for links
                        cells.forEach((cell, cellIdx) => {
                            const links = cell.querySelectorAll('a');
                            links.forEach(link => {
                                const href = link.href;
                                const linkText = link.textContent.trim();
                                
                                if (href && (
                                    href.includes('.pdf') || 
                                    linkText.toLowerCase().includes('view') ||
                                    linkText.toLowerCase().includes('pdf') ||
                                    linkText.toLowerCase().includes('download') ||
                                    linkText.toLowerCase().includes('order') ||
                                    linkText.toLowerCase().includes('judgement')
                                )) {
                                    historyEntry.pdfLinks.push({
                                        url: href,
                                        text: linkText,
                                        cellIndex: cellIdx
                                    });
                                    
                                    // For backward compatibility, also set the main pdfUrl
                                    if (!historyEntry.pdfUrl) {
                                        historyEntry.pdfUrl = href;
                                    }
                                }
                            });
                        });
                        
                        // Special handling for "View PDF" links or similar
                        const orderCell = cells[3];
                        if (orderCell) {
                            const viewLinks = orderCell.querySelectorAll('a');
                            viewLinks.forEach(link => {
                                const linkText = link.textContent.trim();
                                if (linkText.toLowerCase().includes('view') || 
                                    linkText.toLowerCase().includes('pdf') ||
                                    linkText.toLowerCase().includes('order')) {
                                    historyEntry.orderJudgement = linkText;
                                    if (!historyEntry.pdfUrl) {
                                        historyEntry.pdfUrl = link.href;
                                    }
                                }
                            });
                        }
                        
                        // Only add entries that have meaningful data
                        if (historyEntry.serialNo || historyEntry.dateOfListing || 
                            historyEntry.dateOfUpload || historyEntry.orderJudgement ||
                            historyEntry.pdfLinks.length > 0) {
                            details.listingHistory.push(historyEntry);
                            console.log(`[debug] Added listing history entry:`, {
                                serialNo: historyEntry.serialNo,
                                dateOfListing: historyEntry.dateOfListing,
                                dateOfUpload: historyEntry.dateOfUpload,
                                orderJudgement: historyEntry.orderJudgement,
                                pdfLinksCount: historyEntry.pdfLinks.length,
                                hasPdfUrl: !!historyEntry.pdfUrl
                            });
                        }
                    });
                } else {
                    console.log(`[debug] Table ${tableIdx} is not a listing history table`);
                }
            });
            
            console.log('[debug] NCLT case details extraction completed');
            console.log('[debug] Extracted key fields:', {
                filingNumber: !!details.filingNumber,
                filingDate: !!details.filingDate,
                partyName: !!details.partyName,
                caseNumber: !!details.caseNumber,
                caseStatus: !!details.caseStatus,
                listingHistoryCount: details.listingHistory.length,
                tablesProcessed: details.rawTables.length
            });
            
            // Detailed logging of listing history for debugging
            if (details.listingHistory.length > 0) {
                console.log('[debug] Listing history details:');
                details.listingHistory.forEach((entry, idx) => {
                    console.log(`[debug] Entry ${idx + 1}:`, {
                        serialNo: entry.serialNo,
                        dateOfListing: entry.dateOfListing,
                        dateOfUpload: entry.dateOfUpload,
                        orderJudgement: entry.orderJudgement,
                        pdfLinksCount: entry.pdfLinks?.length || 0,
                        hasPdfUrl: !!entry.pdfUrl
                    });
                });
            }
            
            return details;
        });
        
        console.log('[details] ✅ Successfully extracted NCLT case details');
        console.log('[details] Summary:', {
            filingNumber: caseDetails.filingNumber ? 'Found' : 'Not found',
            caseNumber: caseDetails.caseNumber ? 'Found' : 'Not found', 
            partyName: caseDetails.partyName ? 'Found' : 'Not found',
            caseStatus: caseDetails.caseStatus ? 'Found' : 'Not found',
            advocates: `${caseDetails.petitionerAdvocate ? 'Petitioner' : ''} ${caseDetails.respondentAdvocate ? 'Respondent' : ''}`.trim() || 'Not found',
            dates: `${caseDetails.filingDate ? 'Filing' : ''} ${caseDetails.nextListingDate ? 'Next' : ''}`.trim() || 'Not found',
            listingHistory: `${caseDetails.listingHistory.length} entries`,
            totalPdfLinks: caseDetails.listingHistory.reduce((total, entry) => total + (entry.pdfLinks?.length || 0), 0),
            entriesWithPdfs: caseDetails.listingHistory.filter(entry => entry.pdfUrl || (entry.pdfLinks && entry.pdfLinks.length > 0)).length
        });
        
        // Log detailed order information if found
        if (caseDetails.listingHistory.length > 0) {
            console.log('[details] Order/Listing History:');
            caseDetails.listingHistory.forEach((entry, idx) => {
                console.log(`[details] ${idx + 1}. S.No: ${entry.serialNo}, Listing: ${entry.dateOfListing}, Upload: ${entry.dateOfUpload}, Order: ${entry.orderJudgement}, PDFs: ${entry.pdfLinks?.length || 0}`);
            });
        }
        
        return caseDetails;
        
    } catch (error) {
        console.error('[details] ❌ Error extracting case details:', error.message);
        console.log('[details] Returning null due to extraction error');
        return null;
    }
}

module.exports = {
    createBrowser,
    closeBrowser,
    navigateToNCLTPage,
    fillNCLTForm,
    handleNCLTCaptcha,
    submitNCLTForm,
    checkForResults,
    getPageInfo,                  // Add this missing function
    
    // Legacy functions (for compatibility)
    selectBench: () => {},
    selectCaseType: () => {},
    selectYear: () => {},
    fillCPNumber: () => {},
    extractNCLTCaseData: () => {},
    extractSearchResults: () => {},
    extractSingleCaseDetails: () => {},
     
    // New simplified functions (similar to District Court scraper pattern)
    extractTableData,             // Extract basic table data
    processDetailLinks,           // Process status links for detailed info
    extractCaseDetails           // Extract detailed case information
};
