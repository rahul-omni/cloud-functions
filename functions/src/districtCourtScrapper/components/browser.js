const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { wait, formatDateForForm } = require('./utils');

// Initialize browser with proper configuration
async function initializeBrowser() {
    try {
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

// Navigate to Gurugram District Court website - Order Date search
async function navigateToOrderDatePage(page) {
    try {
        console.log('[start] [navigateToOrderDatePage] Opening Gurugram District Court website (Order Date search)...');
        await page.goto('https://gurugram.dcourts.gov.in/court-orders-search-by-order-date/', {
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

// Navigate to Gurugram District Court website - Case Number search  
async function navigateToCaseNumberPage(page) {
    try {
        console.log('[start] [navigateToCaseNumberPage] Opening Gurugram District Court website (Case Number search)...');
        await page.goto('https://gurugram.dcourts.gov.in/court-orders-search-by-case-number/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('[info] [navigateToCaseNumberPage] Waiting for form to load...');
        await page.waitForSelector('#ecourt-services-court-order-case-number-order', { timeout: 30000 });
        await wait(3000);
        console.log('[end] [navigateToCaseNumberPage] Navigated to Case Number page');
    } catch (error) {
        console.error('[error] [navigateToCaseNumberPage] Failed to navigate to case number page:', error.message);
        throw new Error(`Failed to navigate to case number page: ${error.message}`);
    }
}

// Select court complex for both search types
async function selectCourtComplex(page, courtComplex) {
    // Select Court Complex radio button (should be selected by default)
    console.log('[start] [selectCourtComplex] Ensuring Court Complex is selected...');
    await page.click('#chkYes');
    await wait(1000);

    // Select court complex - using the first option (District Court, Gurugram)
    console.log(`[info] [selectCourtComplex] Selecting Court complex: ${courtComplex}`);
    await page.waitForSelector('#est_code', { timeout: 10000 });
    
    // Get available court options
    const courtOptions = await page.$$eval('#est_code option', opts => 
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
    );
    console.log('[info] [selectCourtComplex] Available court options:', courtOptions);
    
    // Select the first non-empty option (District Court, Gurugram)
    const selectedCourt = courtOptions.find(opt => opt.value && opt.value !== '' && opt.text === courtComplex);

    if (!selectedCourt) {
        throw new Error('No valid court options found');
    }
    
    await page.select('#est_code', selectedCourt.value);
    console.log(`[end] [selectCourtComplex] Selected court: ${selectedCourt.text}`);
    await wait(2000);

    return selectedCourt;
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
const CASE_TYPE_MAPPING = {
    '148-A': '47',
    'APP': '3',
    'ARB': '13',
    'BA': '25',
    'Bengal Act': '48',
    'CA': '1',
    'CHA': '37',
    'CHI': '36',
    'CM': '18',
    'CMA': '2',
    'COMA': '39',
    'COMI': '38',
    'Commercial Appeal': '62',
    'Commercial Suit': '61',
    'Cp': '58',
    'CRA': '35',
    'CRM': '24',
    'CRMP': '40',
    'CRR': '33',
    'CS': '4',
    'CS37': '11',
    'Dv': '52',
    'ELC': '29',
    'EXE': '12',
    'F54': '49',
    'FD': '8',
    'GW': '9',
    'HAMA': '63',
    'HDRA': '66',
    'HMA': '31',
    'HMCA': '65',
    'INDIG': '15',
    'INDIGA': '16',
    'INSO': '21',
    'ITA': '55',
    'IT ACT': '64',
    'JJB': '23',
    'LAC': '14',
    'MACM': '44',
    'MACP': '43',
    'MHA': '60',
    'MMA': '57',
    'MNT125': '26',
    'MPL': '19',
    'MPLA': '20',
    'NACT': '46',
    'NDPS': '27',
    'PC ACT': '28',
    'PFA': '22',
    'PRI': '32',
    'PROB': '17',
    'RA': '6',
    'REMP': '59',
    'REW': '10',
    'Rp': '5',
    'Rpc': '51',
    'Rti': '50',
    'SC': '34',
    'SC-ST': '53',
    'SUCC': '7',
    'SUMM': '41',
    'TA': '45',
    'TELE ACT': '67',
    'TRAFFIC': '42',
    'UCR': '56',
    'Wkf': '30'
};

// Get case type value from display text
function getCaseTypeValue(caseTypeText) {
    if (!caseTypeText) return null;
    
    const upperCaseType = caseTypeText.toUpperCase();
    
    // First try exact match
    if (CASE_TYPE_MAPPING[caseTypeText]) {
        return CASE_TYPE_MAPPING[caseTypeText];
    }
    
    // Try case-insensitive match
    for (const [key, value] of Object.entries(CASE_TYPE_MAPPING)) {
        if (key.toUpperCase() === upperCaseType) {
            return value;
        }
    }
    
    console.log(`[warning] Case type "${caseTypeText}" not found in mapping, available types:`, Object.keys(CASE_TYPE_MAPPING));
    return null;
}

// Set case number fields in the form (for case number search)
async function setCaseNumberFields(page, caseNumber, caseYear, caseType = null) {
    console.log(`[start] [setCaseNumberFields] Filling case number: ${caseNumber}`);
    await page.type('#reg_no', caseNumber);
    await wait(1000);

    console.log(`[info] [setCaseNumberFields] Filling case year: ${caseYear}`);
    await page.type('#reg_year', caseYear);
    await wait(1000);

    // If case type is provided, select it
    if (caseType) {
        console.log(`[info] [setCaseNumberFields] Selecting case type: ${caseType}`);
        
        // Get the option value for the case type
        const caseTypeValue = getCaseTypeValue(caseType);
        
        if (caseTypeValue) {
            console.log(`[info] [setCaseNumberFields] Mapped case type "${caseType}" to value "${caseTypeValue}"`);
            
            // Wait for dropdown to be available
            await page.waitForSelector('#case_type:not([disabled])', { timeout: 5000 });
            
            // Select the case type using the option value
            await page.select('#case_type', caseTypeValue);
            console.log(`[info] [setCaseNumberFields] Case type selected with value: ${caseTypeValue}`);
            
            // Verify the selection was successful
            const selectedValue = await page.$eval('#case_type', el => el.value);
            const selectedText = await page.$eval('#case_type', el => el.options[el.selectedIndex]?.textContent || '');
            
            console.log(`[info] [setCaseNumberFields] Selection verified - Value: "${selectedValue}", Text: "${selectedText}"`);
            
            if (selectedValue !== caseTypeValue) {
                throw new Error(`Case type selection failed. Expected value: ${caseTypeValue}, Got: ${selectedValue}`);
            }
        } else {
            console.log(`[warning] [setCaseNumberFields] Could not map case type "${caseType}", skipping case type selection`);
            throw new Error('Case type not found. Please select a valid case type')
        }
        
        await wait(1000);
    }

    // Verify that case fields were set correctly
    const caseValues = await page.evaluate(() => {
        const regNo = document.querySelector('#reg_no')?.value || '';
        const regYear = document.querySelector('#reg_year')?.value || '';
        const caseType = document.querySelector('#case_type')?.value || '';
        const caseTypeText = document.querySelector('#case_type')?.options[document.querySelector('#case_type')?.selectedIndex]?.textContent || '';
        return { regNo, regYear, caseType, caseTypeText };
    });
    
    console.log(`[info] [setCaseNumberFields] Case verification - Number: "${caseValues.regNo}", Year: "${caseValues.regYear}", Type: "${caseValues.caseType}" (${caseValues.caseTypeText})`);
    
    if (!caseValues.regNo || !caseValues.regYear) {
        throw new Error(`Case fields not properly set. Number: "${caseValues.regNo}", Year: "${caseValues.regYear}"`);
    }

    console.log(`[end] [setCaseNumberFields] Case fields set correctly`);
    return caseValues;
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