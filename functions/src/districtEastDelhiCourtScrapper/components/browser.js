const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { wait, formatDateForForm } = require('./utils');

// District Court URL mapping - maps court identifiers to their base URLs
const DISTRICT_COURT_URLS = {
     
    'east district court, delhi': 'https://eastdelhi.dcourts.gov.in',
    'new delhi district court, delhi': 'https://newdelhi.dcourts.gov.in',
    'central district court, delhi': 'https://centraldelhi.dcourts.gov.in',
    "North East District Court, Delhi": 'https://northeast.dcourts.gov.in/',
   "Shahdara District Court, Delhi": 'https://shahdara.dcourts.gov.in/',
    "South East District Court, Delhi": 'https://southeastdelhi.dcourts.gov.in/',
    "South District Court, Delhi": 'https://southdelhi.dcourts.gov.in/',
    "District Court North Delhi": 'https://northdelhi.dcourts.gov.in/',
    "District Court North West Delhi":  'https://rohini.dcourts.gov.in/',
    "West District Court, Delhi": 'https://westdelhi.dcourts.gov.in/',

    "Dwarka Court South West Delhi": 'https://southwestdelhi.dcourts.gov.in/',
 
  
     
};

// Get the base URL for a given court name
function getCourtBaseUrl(courtName) {
    if (!courtName) {
        throw new Error('Court name is required to determine URL');
    }
    
    // Normalize court name: lowercase and trim
    const normalizedName = courtName.toLowerCase().trim();
    
    console.log(`[court-url] Looking for: "${courtName}"`);
    console.log(`[court-url] Normalized to: "${normalizedName}"`);
    
    // Try to find exact match (normalize keys to lowercase for comparison)
    for (const [key, url] of Object.entries(DISTRICT_COURT_URLS)) {
        if (key.toLowerCase() === normalizedName) {
            console.log(`[court-url] ✅ Exact match found with key "${key}": ${url}`);
            return url;
        }
    }
    
    // Try to find partial match by checking if any key is contained in the court name
    for (const [key, url] of Object.entries(DISTRICT_COURT_URLS)) {
        const normalizedKey = key.toLowerCase();
        if (normalizedName.includes(normalizedKey) || normalizedKey.includes(normalizedName)) {
            console.log(`[court-url] ✅ Partial match with key "${key}": ${url}`);
            return url;
        }
    }
    
    // If no match found, throw an error with available courts
    const availableCourts = [...new Set(Object.values(DISTRICT_COURT_URLS))];
    console.log(`[court-url] ❌ No match found for "${courtName}"`);
    console.log(`[court-url] Available keys:`, Object.keys(DISTRICT_COURT_URLS));
    throw new Error(
        `Court "${courtName}" not found in URL mapping. ` +
        `Available courts: ${availableCourts.join(', ')}`
    );
}

// Initialize browser with proper configuration
async function initializeBrowser() {
    try {
        console.log('[browser] Initializing browser in Cloud Function environment...');
        
        // Configuration specifically for GCP Cloud Functions
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        
        // Set up download behavior
        try {
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: __dirname
            });
            console.log('✅  Download path configured to current directory');
        } catch (cdpError) {
            console.log(`⚠️   CDP setup failed: ${cdpError.message}`);
        }
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });
        
        page.on('console', m => console.log('[page]', m.text()));

        console.log(`[initializeBrowser]: browser and page initialized`);
        return { browser, page };
    } catch (error) {
        console.error('[error] [initializeBrowser] Failed to initialize browser:', error.message);
        throw new Error(`Failed to initialize browser: ${error.message}`);
    }
}

// Setup response interceptor for AJAX requests
function setupResponseInterceptor(page) {
    let searchResults = null;
    
    page.setRequestInterception(true);
    
    page.on('request', (req) => {
        req.continue();
    });
    
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('wp-admin/admin-ajax.php') && response.request().method() === 'POST') {
            try {
                const responseText = await response.text();
                console.log('[ajax] Captured search response');
                searchResults = responseText;
            } catch (error) {
                console.log('[ajax] Error reading response:', error.message);
            }
        }
    });

    console.log('[ajax] Response interceptor setup complete');

    return { getSearchResults: () => searchResults };
}

// Navigate to East District Court, Delhi Court website - Order Date search
async function navigateToOrderDatePage(page) {
    try {
        console.log('[start] [navigateToOrderDatePage] Opening East District Court, DelhiCourt website (Order Date search)...');
        await page.goto('https://eastdelhi.dcourts.gov.in/case-status-search-by-case-number/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('[info] [navigateToOrderDatePage] Waiting for form to load...');
        await page.waitForSelector('#ecourt-services-court-order-order-date', { timeout: 30000 });
        await wait(3000);
        console.log('[end] [navigateToOrderDatePage] Navigated to Order Date page');
    } catch (error) {
        console.error('[error] [navigateToOrderDatePage] Failed to navigate to order date page:', error.message);
        throw new Error(`Failed to navigate to order date page: ${error.message}`);
    }
}

// Navigate to  East Delhi Court website - Case Number search  
 // Navigate to District Court website - Case Number search (Dynamic URL based on court name)
async function navigateToCaseNumberPage(page, courtName = 'East District Court, Delhi') {
    try {
        // Get the base URL for the court
        const baseUrl = getCourtBaseUrl(courtName);
        const targetUrl = `${baseUrl}/case-status-search-by-case-number/`;
        
        console.log(`[start] [navigateToCaseNumberPage] Opening ${courtName} website (Case Number search)...`);
        console.log(`[info] [navigateToCaseNumberPage] Target URL: ${targetUrl}`);
        
        // Go directly to the case number search page
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('[info] [navigateToCaseNumberPage] Waiting for form to load...');
        
        // Wait for the main form elements - based on the actual website structure
        await page.waitForSelector('#est_code, #case_type, #reg_no, #reg_year', { timeout: 30000 });
        
        console.log('[info] Form elements found, page loaded successfully');
        await wait(3000);
        
        console.log(`[end] [navigateToCaseNumberPage] Navigated to ${courtName} Case Number page`);
    } catch (error) {
        console.error('[error] [navigateToCaseNumberPage] Failed to navigate to case number page:', error.message);
        
        // Debug: log available elements
        const availableElements = await page.$$eval('input, select, form', els => 
            els.map(el => ({
                tag: el.tagName,
                id: el.id,
                name: el.name,
                className: el.className
            }))
        );
        console.log('[debug] Available form elements:', availableElements);
        
        throw new Error(`Failed to navigate to case number page: ${error.message}`);
    }
}

// Select court complex for both search types
 // Select court complex for case number search
async function selectCourtComplex(page, courtComplex) {
    try {
        console.log(`[start] [selectCourtComplex] Selecting Court complex: ${courtComplex}`);
        
        // Wait for court complex dropdown
        await page.waitForSelector('#est_code', { timeout: 10000 });
        
        // Get available court options
        const courtOptions = await page.$$eval('#est_code option', opts => 
            opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
        );
        console.log('[info] [selectCourtComplex] Available court options:', courtOptions);
        
        // Find the matching court complex
        const selectedCourt = courtOptions.find(opt => 
            opt.text && opt.text.toLowerCase().includes(courtComplex.toLowerCase())
        );

        if (!selectedCourt) {
            console.log('[warning] Exact match not found, trying partial match...');
            // Try partial match for "Karkardooma"
            const partialMatch = courtOptions.find(opt => 
                opt.text && opt.text.toLowerCase().includes('karkardooma')
            );
            if (partialMatch) {
                await page.select('#est_code', partialMatch.value);
                console.log(`[info] [selectCourtComplex] Selected court (partial match): ${partialMatch.text}`);
                await wait(2000);
                return partialMatch;
            }
            throw new Error(`Court complex "${courtComplex}" not found in options`);
        }
        
        await page.select('#est_code', selectedCourt.value);
        console.log(`[end] [selectCourtComplex] Selected court: ${selectedCourt.text}`);
        await wait(2000);

        return selectedCourt;
    } catch (error) {
        console.error('[error] [selectCourtComplex] Failed to select court complex:', error.message);
        throw new Error(`Failed to select court complex: ${error.message}`);
    }
}

// Set date fields in the form (for order date search)
async function setDateFields(page, fromDate, toDate) {
    // Fill in the date range
    const formFromDate = formatDateForForm(fromDate);
    const formToDate = formatDateForForm(toDate);
    
    console.log(`[start] [setDateFields] Filling from date: ${formFromDate}`);
    
    // Remove readonly attribute and set value directly using JavaScript
    await page.evaluate((date) => {
        const fromDateInput = document.querySelector('#from_date');
        if (fromDateInput) {
            fromDateInput.removeAttribute('readonly');
            fromDateInput.value = date;
            // Trigger change event to notify the form
            fromDateInput.dispatchEvent(new Event('change', { bubbles: true }));
            fromDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, formFromDate);
    await wait(1000);

    console.log(`[info] [setDateFields] Filling to date: ${formToDate}`);
    
    // Remove readonly attribute and set value directly using JavaScript
    await page.evaluate((date) => {
        const toDateInput = document.querySelector('#to_date');
        if (toDateInput) {
            toDateInput.removeAttribute('readonly');
            toDateInput.value = date;
            // Trigger change event to notify the form
            toDateInput.dispatchEvent(new Event('change', { bubbles: true }));
            toDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, formToDate);
    await wait(1000);
    
    // Verify that dates were set correctly
    const dateValues = await page.evaluate(() => {
        const fromDate = document.querySelector('#from_date')?.value || '';
        const toDate = document.querySelector('#to_date')?.value || '';
        return { fromDate, toDate };
    });
    
    console.log(`[info] [setDateFields] Date verification - From: "${dateValues.fromDate}", To: "${dateValues.toDate}"`);
    
    if (!dateValues.fromDate || !dateValues.toDate) {
        throw new Error(`Date fields not properly set. From: "${dateValues.fromDate}", To: "${dateValues.toDate}"`);
    }

    console.log(`[end] [setDateFields] Dates set correctly`);
    return dateValues;
}

// Case type mapping for district court dropdown
 // Replace your CASE_TYPE_MAPPING with this exact mapping from the HTML:
const EAST_DELHI_CASE_TYPE_MAPPING = {
    "ARB. A (COMM.)": "79",
    "ARBTN": "58", 
    "ARBTN CASES": "61",
    "BAIL MATTERS": "71",
    "CA": "20",
    "CBI": "26",
    "CC": "29",
    "CC NI ACT": "89",
    "Civ Suit": "16",
    "CLOR": "62",
    "CR Cases": "21",
    "Cr Rev": "22",
    "CS": "17",
    "CS (COMM)": "74",
    "CT Cases": "24",
    "DPT EQ": "30",
    "DPT EQ CR": "31",
    "DR": "84",
    "E P": "67",
    "ESIC": "70",
    "EX": "38",
    "Ex. - Award by Arb.": "91",
    "Ex. Comm - Award by Arb. Comm": "92",
    "Execution (Comm.)": "82",
    "GP": "45",
    "HINDU ADP": "15",
    "HMA": "1",
    "HMA(IPC)": "83",
    "HTA": "4",
    "IDA": "59",
    "INSV": "90",
    "LAC": "2",
    "LC": "10",
    "LCA": "52",
    "L I D": "56",
    "L I R": "19",
    "MACT": "12",  // CORRECT VALUE: "12" (was "37" before)
    "MACT CR": "37",
    "MC": "25",
    "MCA DJ": "32",
    "MCA SCJ": "34",
    "MCD APPL": "64",
    "MISC CRL": "36",
    "MISC DJ": "33",
    "Misc.DR": "85",
    "MISC RC ARC": "66",
    "MISC SCJ": "35",
    "MUSLIM LAW": "14",
    "OMP (COMM)": "78",
    "OMP (E) (COMM)": "77",
    "OMP (I)(COMM.)": "73",
    "OMP MISC (COMM)": "76",
    "OMP (T) (COMM)": "75",
    "OP": "53",
    "PC": "7",
    "POIT": "11",
    "PPA": "3",
    "PWA": "72",
    "RCA DJ": "27",
    "RC ARC": "8",
    "RCA SCJ": "28",
    "RCT ARCT": "9",
    "REC CASES": "51",
    "REVOCATION": "55",
    "SC": "23",
    "S C COURT": "18",
    "S.M.A": "60",
    "SMA": "57",
    "SUCCESSION COURT": "13",
    "TC": "88",
    "T. P. Civil": "86",
    "T. P. Crl.": "87"
};

// Update your getCaseTypeValue function:
function getCaseTypeValue(caseTypeText) {
    if (!caseTypeText) return null;
    
    // Clean the case type text
    const cleanCaseType = caseTypeText.trim();
    
    // First try exact match in East Delhi mapping
    if (EAST_DELHI_CASE_TYPE_MAPPING[cleanCaseType]) {
        return EAST_DELHI_CASE_TYPE_MAPPING[cleanCaseType];
    }
    
    // Try case-insensitive match
    const upperCaseType = cleanCaseType.toUpperCase();
    for (const [key, value] of Object.entries(EAST_DELHI_CASE_TYPE_MAPPING)) {
        if (key.toUpperCase() === upperCaseType) {
            return value;
        }
    }
    
    console.log(`[warning] Case type "${cleanCaseType}" not found in East Delhi mapping`);
    console.log(`[info] Available case types:`, Object.keys(EAST_DELHI_CASE_TYPE_MAPPING));
    return null;
}

// Set case number fields in the form (for case number search)
 // Set case number fields in the form
async function setCaseNumberFields(page, caseNumber, caseYear, caseType = null) {
    try {
        console.log(`[start] [setCaseNumberFields] Filling case details: ${caseNumber}/${caseYear}, Type: ${caseType}`);
        
        // Fill case number (try typing, fallback to direct set if typing doesn't stick)
        console.log(`[info] [setCaseNumberFields] Filling case number: ${caseNumber}`);
        await page.waitForSelector('#reg_no', { timeout: 5000 });
        try {
            await page.click('#reg_no', { clickCount: 3 });
            await page.type('#reg_no', String(caseNumber || ''), { delay: 20 });
            await wait(300);
        } catch (e) {
            console.warn('[warning] [setCaseNumberFields] Typing reg_no failed, falling back to direct set', e.message);
        }

        // Ensure value is set - fallback by assigning via DOM and dispatching input event
        await page.evaluate((val) => {
            const el = document.querySelector('#reg_no');
            if (el) {
                el.value = val || '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, caseNumber);
        await wait(200);

        // Fill case year (try typing, fallback to direct set if typing doesn't stick)
        console.log(`[info] [setCaseNumberFields] Filling case year: ${caseYear}`);
        await page.waitForSelector('#reg_year', { timeout: 5000 });
        try {
            await page.click('#reg_year', { clickCount: 3 });
            await page.type('#reg_year', String(caseYear || ''), { delay: 20 });
            await wait(300);
        } catch (e) {
            console.warn('[warning] [setCaseNumberFields] Typing reg_year failed, falling back to direct set', e.message);
        }

        await page.evaluate((val) => {
            const el = document.querySelector('#reg_year');
            if (el) {
                el.value = val || '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, caseYear);
        await wait(200);

        // Select case type if provided
        if (caseType) {
            console.log(`[info] [setCaseNumberFields] Selecting case type: ${caseType}`);
            
            const caseTypeValue = getCaseTypeValue(caseType);
            
            if (caseTypeValue) {
                console.log(`[info] [setCaseNumberFields] Mapped case type "${caseType}" to value "${caseTypeValue}"`);
                
                // Wait for case type dropdown
                await page.waitForSelector('#case_type', { timeout: 5000 });
                
                // Select the case type
                await page.select('#case_type', caseTypeValue);
                console.log(`[info] [setCaseNumberFields] Case type selected`);
                
                // Verify selection
                const selectedValue = await page.$eval('#case_type', el => el.value);
                console.log(`[info] [setCaseNumberFields] Selection verified - Value: "${selectedValue}"`);
                
            } else {
                console.log(`[warning] [setCaseNumberFields] Could not map case type "${caseType}", trying to find in dropdown`);
                
                // Try to find case type by text
                const caseTypeOptions = await page.$$eval('#case_type option', opts => 
                    opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
                );
                
                const foundOption = caseTypeOptions.find(opt => 
                    opt.text && opt.text.toLowerCase().includes(caseType.toLowerCase())
                );
                
                if (foundOption) {
                    await page.select('#case_type', foundOption.value);
                    console.log(`[info] [setCaseNumberFields] Selected case type by text: ${foundOption.text}`);
                } else {
                    throw new Error(`Case type "${caseType}" not found in dropdown`);
                }
            }
            await wait(1000);
        }

        // Verify that all fields were set correctly
        const fieldValues = await page.evaluate(() => {
            return {
                regNo: document.querySelector('#reg_no')?.value || '',
                regYear: document.querySelector('#reg_year')?.value || '',
                caseType: document.querySelector('#case_type')?.value || '',
                estCode: document.querySelector('#est_code')?.value || ''
            };
        });
        
        console.log(`[info] [setCaseNumberFields] Field verification:`, fieldValues);
        
        if (!fieldValues.regNo || !fieldValues.regYear) {
            // Try one more time to set values from parameters before giving up
            console.log('[warning] [setCaseNumberFields] Fields empty after initial set, attempting force-set from parameters');
            await page.evaluate((num, yr) => {
                const r = document.querySelector('#reg_no');
                const y = document.querySelector('#reg_year');
                if (r) { r.value = num || ''; r.dispatchEvent(new Event('input', { bubbles: true })); }
                if (y) { y.value = yr || ''; y.dispatchEvent(new Event('input', { bubbles: true })); }
            }, caseNumber, caseYear);
            await wait(300);
            const recheck = await page.evaluate(() => ({
                regNo: document.querySelector('#reg_no')?.value || '',
                regYear: document.querySelector('#reg_year')?.value || ''
            }));
            console.log('[info] [setCaseNumberFields] Re-check after force-set:', recheck);

            if (!recheck.regNo || !recheck.regYear) {
                // Capture a small HTML snippet for debugging and return useful error
                const snippet = await page.evaluate(() => document.querySelector('body')?.innerHTML?.substring(0, 2000) || '');
                console.error('[error] [setCaseNumberFields] Final values missing after fallbacks. HTML snippet:', snippet.substring(0,500));
                throw new Error(`Required fields not set after fallbacks. Case: "${recheck.regNo}", Year: "${recheck.regYear}"`);
            }
        }

        console.log(`[end] [setCaseNumberFields] All fields set correctly`);
        return fieldValues;
        
    } catch (error) {
        console.error('[error] [setCaseNumberFields] Failed to set case number fields:', error.message);
        throw new Error(`Failed to set case number fields: ${error.message}`);
    }
}



// Load all cases by clicking "Load More" buttons
async function loadAllCases(page) {
    try {
        console.log('[loadmore] Loading all cases by clicking Load More buttons...');
        
        let loadMoreClicks = 0;
        
        while (true) {
            // Check current status of all tables
            const tableStatus = await page.evaluate(() => {
                const tables = [];
                const distTableContents = document.querySelectorAll('.distTableContent');
                
                distTableContents.forEach((distTable, index) => {
                    const table = distTable.querySelector('table');
                    if (!table) return;
                    
                    const caption = table.querySelector('caption')?.textContent?.trim() || `Table ${index + 1}`;
                    const estCode = distTable.getAttribute('data-est-code') || '';
                    const totalCasesAttr = distTable.getAttribute('data-total-cases');
                    const totalCases = parseInt(totalCasesAttr) || 0;
                    
                    // Count current rows in table
                    const rows = table.querySelectorAll('tbody tr');
                    const currentCases = rows.length;
                    
                    // Check if Load More button exists and is visible
                    const loadMoreBtn = distTable.querySelector('.loadMoreCases');
                    const hasLoadMore = loadMoreBtn && 
                        window.getComputedStyle(loadMoreBtn).display !== 'none' &&
                        window.getComputedStyle(loadMoreBtn).visibility !== 'hidden';
                    
                    tables.push({
                        caption,
                        estCode,
                        totalCases,
                        currentCases,
                        hasLoadMore,
                        isComplete: currentCases >= totalCases
                    });
                });
                
                return tables;
            });
            
            // Log current status
            console.log('[loadmore] Current table status:');
            tableStatus.forEach(table => {
                const status = table.isComplete ? '✅' : '🔄';
                console.log(`  ${status} ${table.caption}: ${table.currentCases}/${table.totalCases} cases loaded`);
            });
            
            // Check if all tables are complete
            const allTablesComplete = tableStatus.every(table => table.isComplete);
            if (allTablesComplete) {
                console.log('[loadmore] ✅ All tables fully loaded!');
                break;
            }
            
            // Find tables that still need more loading
            const tablesNeedingMore = tableStatus.filter(table => !table.isComplete && table.hasLoadMore);
            
            if (tablesNeedingMore.length === 0) {
                console.log('[loadmore] ⚠️  Some tables incomplete but no Load More buttons available - stopping');
                console.log('[loadmore] This might indicate a website issue or rate limiting');
                break;
            }
            
            console.log(`[loadmore] Found ${tablesNeedingMore.length} tables that need more loading`);
            
            // Click Load More buttons for tables that need it
            let buttonsClicked = 0;
            for (const tableInfo of tablesNeedingMore) {
                try {
                    const clicked = await page.evaluate((estCode) => {
                        const distTable = document.querySelector(`[data-est-code="${estCode}"]`);
                        if (!distTable) return false;
                        
                        const loadMoreBtn = distTable.querySelector('.loadMoreCases');
                        if (loadMoreBtn && 
                            window.getComputedStyle(loadMoreBtn).display !== 'none' &&
                            window.getComputedStyle(loadMoreBtn).visibility !== 'hidden') {
                            loadMoreBtn.click();
                            return true;
                        }
                        return false;
                    }, tableInfo.estCode);
                    
                    if (clicked) {
                        buttonsClicked++;
                        console.log(`[loadmore] Clicked Load More for ${tableInfo.caption} (${tableInfo.currentCases}/${tableInfo.totalCases})`);
                        await wait(2000); // Wait for content to load
                    }
                } catch (clickError) {
                    console.log(`[loadmore] Error clicking Load More for ${tableInfo.caption}: ${clickError.message}`);
                }
            }
            
            if (buttonsClicked === 0) {
                console.log('[loadmore] No buttons were successfully clicked, stopping');
                break;
            }
            
            loadMoreClicks += buttonsClicked;
            console.log(`[loadmore] Total Load More clicks so far: ${loadMoreClicks}`);
            
            // Wait for all content to load
            await wait(3000);
        }
        
        // Final status check
        const finalStatus = await page.evaluate(() => {
            const tables = [];
            const distTableContents = document.querySelectorAll('.distTableContent');
            
            distTableContents.forEach((distTable, index) => {
                const table = distTable.querySelector('table');
                if (!table) return;
                
                const caption = table.querySelector('caption')?.textContent?.trim() || `Table ${index + 1}`;
                const totalCases = parseInt(distTable.getAttribute('data-total-cases')) || 0;
                const currentCases = table.querySelectorAll('tbody tr').length;
                
                tables.push({
                    caption,
                    totalCases,
                    currentCases,
                    percentage: totalCases > 0 ? Math.round((currentCases / totalCases) * 100) : 0
                });
            });
            
            return tables;
        });
        
        console.log('\n[loadmore] 📊 Final loading summary:');
        finalStatus.forEach(table => {
            console.log(`  📋 ${table.caption}: ${table.currentCases}/${table.totalCases} cases (${table.percentage}%)`);
        });
        
        const totalLoaded = finalStatus.reduce((sum, table) => sum + table.currentCases, 0);
        const totalAvailable = finalStatus.reduce((sum, table) => sum + table.totalCases, 0);
        console.log(`  🎯 Grand Total: ${totalLoaded}/${totalAvailable} cases loaded`);
        
        return finalStatus;
    } catch (error) {
        console.error('[error] [loadAllCases] Failed to load all cases:', error.message);
        throw new Error(`Failed to load all cases: ${error.message}`);
    }
}

module.exports = {
    initializeBrowser,
    setupResponseInterceptor,
    navigateToOrderDatePage,
    navigateToCaseNumberPage,
    selectCourtComplex,
    setDateFields,
    setCaseNumberFields,
    loadAllCases,
}; 