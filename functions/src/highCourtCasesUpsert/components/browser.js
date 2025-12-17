const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const { wait } = require('./utils');
const caseTypeMap = require("./mapping");

// Initialize browser with proper configuration
async function initializeBrowser() {
    const browser = await puppeteer.launch({  args: chromium.args,
        executablePath: await chromium.executablePath,  // ✅ Required
        headless: chromium.headless});
    
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
}

// Setup dialog handler
function setupDialogHandler(page) {
    let modalHandled = false;
    page.on('dialog', async dialog => {
        console.log(`[modal] JS Alert says: ${dialog.message()}`);
        await wait(2000);
        await dialog.accept();
        modalHandled = true;
        console.log('[modal] JS Alert accepted');
    });
    console.log(`[setupDialogHandler]: ${modalHandled}`);
    return modalHandled;

}

// Navigate to main page and handle initial setup
async function navigateToMainPage(page, modalHandled) {
    console.log('[navigateToMainPage] Going to main page...');
    await page.goto('https://hcservices.ecourts.gov.in/hcservices/main.php', { waitUntil: 'networkidle2' });
    await wait(3000);

    console.log('[navigateToMainPage] About to click Court Orders...');
    await page.click('#leftPaneMenuCO');
    console.log('[navigateToMainPage] Clicked Court Orders. Waiting for modal...');
    await wait(3000);

    // Handle modal
    if (!modalHandled) {
        console.log('[modal] No JS alert detected, checking for custom HTML modal...');
        const okClicked = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
                .find(el => el.offsetParent !== null && /ok/i.test(el.textContent || el.value));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (okClicked) {
            console.log('[modal] Custom HTML modal OK clicked via evaluate.');
            await wait(2000);
            modalHandled = true;
        } else {
            console.log('[modal] No custom HTML modal found via evaluate.');
        }
    } else {
        console.log('[modal] JS alert was handled.');
    }
    console.log(`[navigateToMainPage] navigated to main page`);
    return modalHandled;
}

// Select High Court of Delhi
async function selectHighCourt(page, highCourtname) {
    // Wait for the element to appear
    console.log('[selectHighCourt] Waiting for High Court dropdown...');
    await page.waitForSelector('#sess_state_code', { timeout: 30000 });
    await wait(3000);
    // Wait until the specified high court is present in the dropdown
    await page.waitForFunction((highCourtname) => {
        const el = document.querySelector('#sess_state_code');
        if (!el) return false;
        return Array.from(el.options).some(o => o.textContent.includes(highCourtname));
    }, { timeout: 20000 }, highCourtname);
    console.log(`[debug] ${highCourtname} is now present in the dropdown.`);

    // Print all available options for debugging
    const options = await page.$$eval('#sess_state_code option', opts => opts.map(o => ({value: o.value, text: o.textContent})));
    // console.log('[debug] High Court dropdown options:', options);

    // Find the correct value for the specified high court
    const targetCourt = options.find(o => o.text.includes(highCourtname));
    if (!targetCourt) {
        console.error(`[error] ${highCourtname} not found in dropdown options. Exiting.`);
        throw new Error(`${highCourtname} not found in dropdown options`);
    }

    // Wait for the dropdown to be enabled
    await page.waitForFunction(() => {
        const el = document.querySelector('#sess_state_code');
        return el && !el.disabled;
    });
    console.log('[debug] High Court dropdown is enabled.');

    console.log(`[select] Selecting ${highCourtname} with value: ${targetCourt.value}...`);
    let retries = 5;
    let selectedHighCourt;
    for (let i = 0; i < retries; i++) {
        await page.select('#sess_state_code', targetCourt.value);
        await wait(1000);
        selectedHighCourt = await page.$eval('#sess_state_code', el => ({
            value: el.value,
            text: el.options[el.selectedIndex].textContent
        }));
        console.log(`[debug] Attempt ${i+1}: High Court selected value:`, selectedHighCourt.value, 'text:', selectedHighCourt.text);
        if (selectedHighCourt.text.includes(highCourtname)) {
            break;
        }
    }
    if (!selectedHighCourt.text.includes(highCourtname)) {
        console.error(`[error] ${highCourtname} could NOT be selected after retries. Exiting.`);
        throw new Error(`${highCourtname} could NOT be selected after retries`);
    }
    await wait(3000);
}

// Select Principal Bench at Delhi
async function selectPrincipalBench(page, bench) {
    console.log('[wait] Waiting for Bench dropdown...');
    await page.waitForSelector('#court_complex_code option[value]');
    await wait(3000);

    // Print all available options for debugging
    const benchOptions = await page.$$eval('#court_complex_code option', opts => opts.map(o => ({value: o.value, text: o.textContent})));
    console.log('[debug] Bench dropdown options:', benchOptions);
    console.log('[debug] Bench dropdown texts:', benchOptions.map(o => o.text));

    // Find the value for the specified bench
    const targetBench = benchOptions.find(o => o.text.toLowerCase().includes(bench.toLowerCase()));
    if (!targetBench) {
        console.error(`[error] ${bench} not found in dropdown options. Exiting.`);
        throw new Error(`${bench} not found in dropdown options`);
    }

    // Retry loop for selecting the specified bench
    let benchRetries = 5;
    let selectedBench;
    for (let i = 0; i < benchRetries; i++) {
        await page.select('#court_complex_code', targetBench.value);
        await wait(1000);
        selectedBench = await page.$eval('#court_complex_code', el => ({
            value: el.value,
            text: el.options[el.selectedIndex].textContent
        }));
        console.log(`[debug] Attempt ${i+1}: Bench selected value:`, selectedBench.value, 'text:', selectedBench.text);
        if (selectedBench.text.toLowerCase().includes(bench.toLowerCase())) {
            break;
        }
    }
    if (!selectedBench.text.toLowerCase().includes(bench.toLowerCase())) {
        console.error(`[error] ${bench} could NOT be selected after retries. Exiting.`);
        throw new Error(`${bench} could NOT be selected after retries`);
    }
    await wait(3000);
}

// Set date fields
async function setDateFields(page, date) {
    console.log('[click] Clicking on Order Date tab...');
    await page.click('#COorderDate');
    await wait(3000);

    // Handle date picker for from_date
    console.log(`[date] Setting from_date: ${date}`);
    await page.click('#from_date');
    await wait(1000);
    
    // Parse the target date
    const [day, month, year] = date.split('-').map(Number);
    
    // Set the date using JavaScript in dd-mm-yyyy format
    await page.evaluate((day, month, year) => {
        const fromDateInput = document.querySelector('#from_date');
        if (fromDateInput) {
            // Format as dd-mm-yyyy
            const formattedDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
            fromDateInput.value = formattedDate;
            
            // Trigger change events
            fromDateInput.dispatchEvent(new Event('change', { bubbles: true }));
            fromDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, day, month, year);
    await wait(2000);

    // Handle date picker for to_date (same as from_date for single date)
    console.log(`[date] Setting to_date: ${date}`);
    await page.click('#to_date');
    await wait(1000);
    
    // Set the date using JavaScript in dd-mm-yyyy format
    await page.evaluate((day, month, year) => {
        const toDateInput = document.querySelector('#to_date');
        if (toDateInput) {
            // Format as dd-mm-yyyy
            const formattedDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
            toDateInput.value = formattedDate;
            
            // Trigger change events
            toDateInput.dispatchEvent(new Event('change', { bubbles: true }));
            toDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, day, month, year);
    await wait(2000);

    // Verify dates were set correctly
    const dateValues = await page.evaluate(() => {
        const fromDate = document.querySelector('#from_date')?.value || '';
        const toDate = document.querySelector('#to_date')?.value || '';
        return { fromDate, toDate };
    });
    
    console.log(`[date] Date verification - From: "${dateValues.fromDate}", To: "${dateValues.toDate}"`);
    
    if (!dateValues.fromDate || !dateValues.toDate) {
        console.error('[error] Date fields not properly set. Trying alternative method...');
        
        // Alternative method: Try to set dates by clicking calendar elements
        try {
            // Click from_date and try to select date from calendar
            await page.click('#from_date');
            await wait(1000);
            
            // Look for calendar elements and try to select the date
            const calendarDateSelected = await page.evaluate((targetDay) => {
                // Look for calendar date elements
                const dateElements = document.querySelectorAll('.ui-datepicker-calendar td a, .calendar-day, [data-date]');
                for (let element of dateElements) {
                    const elementText = element.textContent.trim();
                    if (elementText === targetDay.toString()) {
                        element.click();
                        return true;
                    }
                }
                return false;
            }, day);
            
            if (calendarDateSelected) {
                console.log('[date] Successfully selected from_date from calendar');
            } else {
                console.log('[date] Could not find calendar date element for from_date');
            }
            
            await wait(1000);
            
            // Click to_date and try to select date from calendar
            await page.click('#to_date');
            await wait(1000);
            
            const calendarDateSelected2 = await page.evaluate((targetDay) => {
                // Look for calendar date elements
                const dateElements = document.querySelectorAll('.ui-datepicker-calendar td a, .calendar-day, [data-date]');
                for (let element of dateElements) {
                    const elementText = element.textContent.trim();
                    if (elementText === targetDay.toString()) {
                        element.click();
                        return true;
                    }
                }
                return false;
            }, day);
            
            if (calendarDateSelected2) {
                console.log('[date] Successfully selected to_date from calendar');
            } else {
                console.log('[date] Could not find calendar date element for to_date');
            }
            
        } catch (calendarError) {
            console.error('[error] Calendar selection failed:', calendarError.message);
        }
    }

    // Close any open calendar popups by pressing Escape
    console.log('[calendar] Pressing Escape to close any open calendar popups...');
    await page.keyboard.press('Escape');
    await wait(500);
}

async function setDiaryNumberFields(page, diaryNumber, caseTypeValue) {
    console.log(`[date] clicking on case number tab`);
    await page.click('#COcaseNumber');
    await wait(3000);

    // Parse diary number to extract case number and year
    const [caseNumber, year] = diaryNumber.split('/');
    console.log(`[parse] Diary number: ${diaryNumber} -> Case: ${caseNumber}, Year: ${year}`);

    // Handle case type dropdown
    console.log(`[dropdown] Selecting case type: ${caseTypeValue}`);
    await page.click('#case_type_order');
    await wait(1000);
    await page.select('#case_type_order', caseTypeMap[caseTypeValue].toString());
    await wait(2000);

    // Fill case number field
    console.log(`[input] Filling case number: ${caseNumber}`);
    await page.click('#case_no_order');
    await wait(500);
    await page.type('#case_no_order', caseNumber);
    await wait(1000);

    // Fill year field
    console.log(`[input] Filling year: ${year}`);
    await page.click('#rgyearCaseOrder');
    await wait(500);
    await page.type('#rgyearCaseOrder', year);
    await wait(1000);

    console.log(`[complete] All fields filled - Case Type: ${caseTypeValue}, Case Number: ${caseNumber}, Year: ${year}`);
}

module.exports = {
    initializeBrowser,
    setupDialogHandler,
    navigateToMainPage,
    selectHighCourt,
    selectPrincipalBench,
    setDateFields,
    setDiaryNumberFields
}; 