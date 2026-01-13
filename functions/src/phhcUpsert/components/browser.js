const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { wait } = require('./utils');

// Initialize browser with proper configuration
async function initializeBrowser() {
    const browser = await puppeteer.launch({ 
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    page.on('console', m => console.log('[page]', m.text()));

    console.log(`[initializeBrowser]: browser and page initialized`);
    return { browser, page };
}

// Navigate to PHHC search page
async function navigateToSearchPage(page) {
    console.log('[navigateToSearchPage] Going to PHHC search page...');
    await page.goto('https://phhc.gov.in/home.php?search_param=case', { waitUntil: 'networkidle2' });
    await wait(3000);
    console.log('[navigateToSearchPage] Navigated to search page');
}

// Fill case search form
async function fillCaseSearchForm(page, caseType, caseNumber, caseYear) {
    console.log('[fillCaseSearchForm] Filling form with:', { caseType, caseNumber, caseYear });
    
    // Wait for form to load
    await page.waitForSelector('#t_case_type', { timeout: 30000 });
    await wait(1000);
    
    // Select case type from dropdown
    if (caseType) {
        await page.select('#t_case_type', caseType);
        console.log(`[fillCaseSearchForm] Selected case type: ${caseType}`);
        await wait(500);
    }
    
    // Fill case number
    if (caseNumber) {
        await page.click('#t_case_no', { clickCount: 3 }); // Select all
        await page.type('#t_case_no', caseNumber);
        console.log(`[fillCaseSearchForm] Entered case number: ${caseNumber}`);
        await wait(500);
    }
    
    // Select case year from dropdown
    if (caseYear) {
        await page.select('#t_case_year', caseYear);
        console.log(`[fillCaseSearchForm] Selected case year: ${caseYear}`);
        await wait(500);
    }
    
    console.log('[fillCaseSearchForm] Form filled successfully');
}

// Submit search form
async function submitSearchForm(page) {
    console.log('[submitSearchForm] Submitting form...');
    
    // Wait for submit button to be available
    await page.waitForSelector('input[name="submit"][value="Search Case"]', { timeout: 10000 });
    
    // Click submit button and wait for navigation
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
            console.log('[submitSearchForm] Navigation timeout, continuing...');
        }),
        page.click('input[name="submit"][value="Search Case"]')
    ]);
    
    console.log('[submitSearchForm] Submit button clicked');
    
    // Wait for results to load
    await wait(3000);
    
    // Wait for results table
    try {
        await page.waitForSelector('#tables11', { timeout: 15000 });
        console.log('[submitSearchForm] Results table found');
    } catch (error) {
        console.log('[submitSearchForm] Results table not found, may be no results or error occurred');
        // Check if there's an error message
        const errorText = await page.evaluate(() => {
            const errorDiv = document.querySelector('.error, #error, .alert');
            return errorDiv ? errorDiv.textContent.trim() : null;
        });
        if (errorText) {
            console.log(`[submitSearchForm] Error message found: ${errorText}`);
        }
    }
    
    await wait(2000);
}

// Extract case links from results table
async function extractCaseLinks(page) {
    console.log('[extractCaseLinks] Extracting case links from results...');
    
    const caseLinks = await page.evaluate(() => {
        const links = [];
        const table = document.querySelector('#tables11');
        
        if (!table) {
            return links;
        }
        
        // Find all rows with case links (skip header row)
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach((row, index) => {
            if (index === 0) return; // Skip header row
            
            const caseLinkCell = row.querySelector('td:first-child a');
            if (caseLinkCell) {
                const href = caseLinkCell.getAttribute('href');
                const caseId = caseLinkCell.textContent.trim();
                
                if (href && href.includes('enq_caseno.php?case_id=')) {
                    // Extract case_id from href
                    const urlParams = new URLSearchParams(href.split('?')[1]);
                    const caseIdParam = urlParams.get('case_id');
                    
                    // Construct full URL
                    let fullUrl;
                    if (href.startsWith('http')) {
                        fullUrl = href;
                    } else if (href.startsWith('/')) {
                        fullUrl = `https://phhc.gov.in${href}`;
                    } else {
                        fullUrl = `https://phhc.gov.in/${href}`;
                    }
                    
                    links.push({
                        caseId: caseId,
                        caseIdParam: caseIdParam,
                        fullUrl: fullUrl
                    });
                }
            }
        });
        
        return links;
    });
    
    console.log(`[extractCaseLinks] Found ${caseLinks.length} case link(s)`);
    return caseLinks;
}

module.exports = {
    initializeBrowser,
    navigateToSearchPage,
    fillCaseSearchForm,
    submitSearchForm,
    extractCaseLinks
};

