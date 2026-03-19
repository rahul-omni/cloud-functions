// const puppeteer = require('puppeteer');
// const chromium = require('chrome-aws-lambda');
// const { wait } = require('./utils');
// const caseTypeMap = require("./mapping");

// Initialize browser with proper configuration
const puppeteer = require("puppeteer");
const path = require("path");
const { wait } = require("./utils");

async function initializeBrowser() {
  const browser = await puppeteer.launch({
    headless: false,              // 👈 SHOW browser
    slowMo: 50,                   // 👈 visually track actions
    defaultViewport: null,        // 👈 full window
    args: [
      "--start-maximized",
    ],
  });

  const page = await browser.newPage();

  // ✅ Set up download behavior
  try {
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: path.resolve(__dirname),
    });
    console.log("✅ Download path configured to current directory");
  } catch (cdpError) {
    console.log(`⚠️ CDP setup failed: ${cdpError.message}`);
  }

  // ✅ Realistic browser fingerprint
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  await page.setViewport({ width: 1366, height: 768 });

  // ✅ Debug logs from browser
  page.on("console", (m) => console.log("[PAGE]", m.text()));
  page.on("pageerror", (e) => console.error("[PAGE ERROR]", e));

  console.log("[initializeBrowser]: browser and page initialized");

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
    await page.goto('https://www.allahabadhighcourt.in/causelist/viewlistA.jsp', {
        waitUntil: 'networkidle2'
    });

    await wait(3000);

    // ✅ Click first subheading (Cause List Allahabad)
    await page.waitForSelector('h4.subheading', { visible: true });
    const headings = await page.$$('h4.subheading');
    if (!headings.length) throw new Error('No h4.subheading found');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        headings[0].click()
    ]);

    // ✅ Wait for GO button and click
    await page.waitForSelector('input.btn.btn-primary.mb-2[value="GO"]', { visible: true });

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('input.btn.btn-primary.mb-2[value="GO"]')
    ]);

    // ✅ Select first radio (Court Wise) and submit
    await page.waitForSelector('input.form-check-input[name="criteria"][value="court"]', {
        visible: true
    });

    await page.click('input.form-check-input[name="criteria"][value="court"]');

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('input.btn.btn-primary[value="Submit"]')
    ]);

    console.log('[navigateToMainPage] First Submit done. Waiting for second Submit...');

    // ✅ Wait for second Submit button and click again
    await page.waitForSelector('input.btn.btn-primary[value="Submit"]', { visible: true });

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('input.btn.btn-primary[value="Submit"]')
    ]);

    console.log('[navigateToMainPage] Second Submit done. Page ready');

    // ✅ wait for the PDF link and extract href
    await page.waitForSelector('a.btn.btn-sm.btn-link.text-primary[target="_blank"]', { visible: true });

    const pdfLink = await page.$eval(
        'a.btn.btn-sm.btn-link.text-primary[target="_blank"]',
        (el) => el.href
    );

    console.log('[PDF LINK]', pdfLink);
    return pdfLink;
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

  // Parse diary number
  const [caseNumber, year] = diaryNumber.split('/');
  console.log(`[parse] Diary number: ${diaryNumber} → Case: ${caseNumber}, Year: ${year}`);

  // ─────────────────────────────────────────────
  // Case Type
  console.log(`[dropdown] Selecting case type: ${caseTypeValue}`);
  await page.waitForSelector('#case_type', { visible: true });

  // caseTypeValue is already in abbreviated form (e.g. CRL.A.)
  await page.select('#case_type', caseTypeValue.toString());
  await wait(1500);

  // ─────────────────────────────────────────────
  // Case Number
  console.log(`[input] Filling case number: ${caseNumber}`);
  await page.waitForSelector('#case_no', { visible: true });

  await page.click('#case_no', { clickCount: 3 });
  await page.type('#case_no', caseNumber);
  await wait(1000);

  // ─────────────────────────────────────────────
  // Year
  console.log(`[dropdown] Selecting year: ${year}`);
  await page.waitForSelector('#case_year', { visible: true });

  await page.click('#case_year', { clickCount: 3 });
  await page.type('#case_year', year);
  await wait(1000);

  console.log(
    `[complete] Filled → Case Type: ${caseTypeValue}, Case Number: ${caseNumber}, Year: ${year}`
  );
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