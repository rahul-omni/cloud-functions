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

// Navigate to Gurugram District Court Cause List page
async function navigateToCauseListPage(page) {
    try {
        console.log('[start] [navigateToCauseListPage] Opening Gurugram District Court Cause List page...');
        await page.goto('https://gurugram.dcourts.gov.in/cause-list-%e2%81%84-daily-board/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('[info] [navigateToCauseListPage] Waiting for form to load...');
        await page.waitForSelector('#ecourt-services-cause-list-cause-list', { timeout: 30000 });
        await wait(3000);
        console.log('[end] [navigateToCauseListPage] Navigated to Cause List page');
    } catch (error) {
        console.error('[error] [navigateToCauseListPage] Failed to navigate to cause list page:', error.message);
        throw new Error(`Failed to navigate to cause list page: ${error.message}`);
    }
}

// Select court complex or court establishment
async function selectCourtComplex(page, courtComplex, courtEstablishment = null) {
    console.log('[start] [selectCourtComplex] Setting up court selection...');
    
    // Select Court Complex radio button (should be selected by default)
    console.log('[info] [selectCourtComplex] Ensuring Court Complex is selected...');
    await page.click('#chkYes');
    await wait(1000);

    // Select court complex - using the provided option
    console.log(`[info] [selectCourtComplex] Selecting Court complex: ${courtComplex}`);
    await page.waitForSelector('#est_code', { timeout: 10000 });
    
    // Get available court options
    const courtOptions = await page.$$eval('#est_code option', opts => 
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
    );
    // console.log('[info] [selectCourtComplex] Available court options:', courtOptions);
    
    // Select the court complex
    const selectedCourt = courtOptions.find(opt => opt.value && opt.value !== '' && opt.text === courtComplex);

    if (!selectedCourt) {
        throw new Error('No valid court options found');
    }
    
    await page.select('#est_code', selectedCourt.value);
    console.log(`[end] [selectCourtComplex] Selected court: ${selectedCourt.text}`);
    await wait(2000);

    return selectedCourt;
}

// Select court establishment (alternative to court complex)
async function selectCourtEstablishment(page, courtEstablishment) {
    console.log('[start] [selectCourtEstablishment] Setting up court establishment selection...');
    
    // Select Court Establishment radio button
    console.log('[info] [selectCourtEstablishment] Selecting Court Establishment radio button...');
    await page.click('#chkNo');
    await wait(1000);

    // Select court establishment
    console.log(`[info] [selectCourtEstablishment] Selecting Court establishment: ${courtEstablishment}`);
    await page.waitForSelector('#court_establishment', { timeout: 10000 });
    
    // Get available court establishment options
    const establishmentOptions = await page.$$eval('#court_establishment option', opts => 
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
    );
    console.log('[info] [selectCourtEstablishment] Available establishment options:', establishmentOptions);
    
    // Select the court establishment
    const selectedEstablishment = establishmentOptions.find(opt => opt.value && opt.value !== '' && opt.text === courtEstablishment);

    if (!selectedEstablishment) {
        throw new Error('No valid court establishment options found');
    }
    
    await page.select('#court_establishment', selectedEstablishment.value);
    console.log(`[end] [selectCourtEstablishment] Selected establishment: ${selectedEstablishment.text}`);
    await wait(2000);

    return selectedEstablishment;
}

// Select court number (this will be populated after court complex/establishment selection)
async function selectCourtNumber(page, courtNumber) {
    console.log(`[start] [selectCourtNumber] Selecting court number: ${courtNumber}`);
    
    // Wait for court dropdown to be enabled
    await page.waitForSelector('#court:not([disabled])', { timeout: 10000 });
    
    // Get available court options
    const courtOptions = await page.$$eval('#court option', opts => 
        opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
    );
    // console.log('[info] [selectCourtNumber] Available court options:', courtOptions);
    
    // Select the court number
    const selectedCourt = courtOptions.find(opt => opt.value && opt.value !== '' && opt.text === courtNumber);

    if (!selectedCourt) {
        throw new Error('No valid court number options found');
    }
    
    await page.select('#court', selectedCourt.value);
    console.log(`[end] [selectCourtNumber] Selected court: ${selectedCourt.text}`);
    await wait(1000);

    return selectedCourt;
}

// Set cause list date
async function setCauseListDate(page, date) {
    const formDate = formatDateForForm(date);
    
    console.log(`[start] [setCauseListDate] Filling cause list date: ${formDate}`);
    
    // Remove readonly attribute and set value directly using JavaScript
    await page.evaluate((date) => {
        const dateInput = document.querySelector('#date');
        if (dateInput) {
            dateInput.removeAttribute('readonly');
            dateInput.value = date;
            // Trigger change event to notify the form
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, formDate);
    await wait(1000);
    
    // Verify that date was set correctly
    const dateValue = await page.evaluate(() => {
        const date = document.querySelector('#date')?.value || '';
        return date;
    });
    
    console.log(`[info] [setCauseListDate] Date verification - Date: "${dateValue}"`);
    
    if (!dateValue) {
        throw new Error(`Date field not properly set. Date: "${dateValue}"`);
    }

    console.log(`[end] [setCauseListDate] Date set correctly`);
    return dateValue;
}

// Select cause type (Civil or Criminal)
async function selectCauseType(page, causeType) {
    console.log(`[start] [selectCauseType] Selecting cause type: ${causeType}`);
    
    if (causeType.toLowerCase() === 'civil') {
        await page.click('#chkCauseTypeCivil');
        console.log('[info] [selectCauseType] Selected Civil cause type');
    } else if (causeType.toLowerCase() === 'criminal') {
        await page.click('#chkCauseTypeCriminal');
        console.log('[info] [selectCauseType] Selected Criminal cause type');
    } else {
        throw new Error(`Invalid cause type: ${causeType}. Must be 'Civil' or 'Criminal'`);
    }
    
    await wait(1000);
    console.log(`[end] [selectCauseType] Cause type selection completed`);
}

// Load all cases by clicking "Load More" buttons (if applicable)
async function loadAllCases(page) {
    try {
        console.log('[loadmore] Checking for Load More buttons...');
        
        // Check if there are any Load More buttons
        const hasLoadMoreButtons = await page.evaluate(() => {
            const loadMoreButtons = document.querySelectorAll('.loadMoreCases, .load-more, [class*="load"], [class*="more"]');
            return loadMoreButtons.length > 0;
        });
        
        if (!hasLoadMoreButtons) {
            console.log('[loadmore] No Load More buttons found, all cases already loaded');
            return;
        }
        
        console.log('[loadmore] Found Load More buttons, loading all cases...');
        
        let loadMoreClicks = 0;
        const maxClicks = 10; // Prevent infinite loops
        
        while (loadMoreClicks < maxClicks) {
            // Check for Load More buttons
            const buttonsClicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('.loadMoreCases, .load-more, [class*="load"], [class*="more"]');
                let clicked = 0;
                
                buttons.forEach(button => {
                    if (button.style.display !== 'none' && button.style.visibility !== 'hidden') {
                        button.click();
                        clicked++;
                    }
                });
                
                return clicked;
            });
            
            if (buttonsClicked === 0) {
                console.log('[loadmore] No more Load More buttons to click');
                break;
            }
            
            loadMoreClicks += buttonsClicked;
            console.log(`[loadmore] Clicked ${buttonsClicked} Load More buttons (total: ${loadMoreClicks})`);
            
            // Wait for content to load
            await wait(3000);
        }
        
        console.log(`[loadmore] Completed loading all cases (${loadMoreClicks} clicks)`);
        
    } catch (error) {
        console.error('[error] [loadAllCases] Failed to load all cases:', error.message);
        // Don't throw error, just log it and continue
        console.log('[loadmore] Continuing without loading more cases...');
    }
}

module.exports = {
    initializeBrowser,
    setupResponseInterceptor,
    navigateToCauseListPage,
    selectCourtComplex,
    selectCourtEstablishment,
    selectCourtNumber,
    setCauseListDate,
    selectCauseType,
    loadAllCases,
};
