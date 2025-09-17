const functions = require('firebase-functions');
<<<<<<< HEAD
const puppeteer = require('puppeteer-core');
const axios     = require('axios');
const chromium = require('chrome-aws-lambda');


const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey

if (!KEY) { console.error('🔴  OPENAI_API_KEY missing'); process.exit(1); }

const wait  = ms => new Promise(r => setTimeout(r, ms));
const digits = d => d.replace(/-/g, '');          // 01-01-2025 → 01012025

/* ─── arithmetic captcha via OpenAI Vision ─── */
const solveCaptcha = async (buf) => {
  const dataURL = 'data:image/png;base64,' + buf.toString('base64');
  const r = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4-turbo',
      messages: [{
        role: 'user',
        content: [
          { type: 'text',
            text: 'Image shows a simple "+" or "-" arithmetic task; reply ONLY the integer result.' },
          { type: 'image_url', image_url: { url: dataURL } }
        ]
      }],
      max_tokens: 5
    },
    { headers: { Authorization: `Bearer ${KEY}` } }
  );
  const ans = r.data.choices[0].message.content.trim();
  if (!/^-?\d+$/.test(ans)) throw new Error('Non-numeric answer');
  return ans;
}


/* ─── main routine ─── */
const fetchSupremeCourtCauseList = async (listType, searchBy = 'all_courts', causelistType, listingDate, mainAndSupplementry) => {
  console.log(`[start] [fetchSupremeCourtCauseList] Scraping cause list for: ${listingDate}`);
  console.log(`[debug] [fetchSupremeCourtCauseList] Parameters: listType=${listType}, searchBy=${searchBy}, causelistType=${causelistType}, listingDate=${listingDate}, mainAndSupplementry=${mainAndSupplementry}`);

  console.log('[debug] [fetchSupremeCourtCauseList] Launching browser...');
  const browser = await puppeteer.launch({  args: chromium.args,
    executablePath: await chromium.executablePath,  // ✅ Required
    headless: chromium.headless});
  console.log('[debug] [fetchSupremeCourtCauseList] Browser launched successfully');

  console.log('[debug] [fetchSupremeCourtCauseList] Creating new page...');
  const page = await browser.newPage();
  console.log('[debug] [fetchSupremeCourtCauseList] New page created');
  
  // Set a proper user agent
  console.log('[debug] [fetchSupremeCourtCauseList] Setting user agent...');
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });
  console.log('[debug] [fetchSupremeCourtCauseList] User agent and viewport set');

  try {
    // Enable request interception
    console.log('[debug] [fetchSupremeCourtCauseList] Enabling request interception...');
    await page.setRequestInterception(true);
    
    // Only log critical errors
    page.on('request', request => request.continue());
    page.on('response', async response => {
      if (response.status() === 403) {
        console.log('[error] [fetchSupremeCourtCauseList] Access forbidden (403)');
      }
    });
    console.log('[debug] [fetchSupremeCourtCauseList] Request interception enabled');

    console.log('[debug] [fetchSupremeCourtCauseList] Navigating to cause list page...');
    await page.goto('https://www.sci.gov.in/cause-list/#cause-list', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    console.log('[debug] [fetchSupremeCourtCauseList] Successfully navigated to cause list page');
    
    // Wait for the form to be ready
    console.log('[debug] [fetchSupremeCourtCauseList] Waiting for form to be ready...');
    await page.waitForSelector('#listing_date', { visible: true, timeout: 30000 });
    console.log('[debug] [fetchSupremeCourtCauseList] Form is ready, starting to fill fields...');
    
    // Fill the form - handle all required fields
    try {
      console.log('[debug] [fetchSupremeCourtCauseList] Starting form field population...');
      
      // // 1. List Type
      // console.log(`[debug] [fetchSupremeCourtCauseList] Setting list type to: ${listType}`);
      // await page.click(`input[name="list_type"][value="${listType}"]`);
      // await wait(300);
      // console.log('[debug] [fetchSupremeCourtCauseList] List type set');
      
      // 2. Search By
      console.log(`[debug] [fetchSupremeCourtCauseList] Setting search by to: ${searchBy}`);
      await page.select('#search_by', searchBy);
      await wait(300);
      console.log('[debug] [fetchSupremeCourtCauseList] Search by set');
      
      // 3. Causelist Type - handle different options based on listType
      console.log(`[debug] [fetchSupremeCourtCauseList] Setting causelist type to: ${causelistType} for list type: ${listType}`);
      if (listType === 'daily') {
        console.log('[debug] [fetchSupremeCourtCauseList] Using daily causelist type selector');
        await page.select('.daily #causelist_type', causelistType);
      } else {
        console.log('[debug] [fetchSupremeCourtCauseList] Using other causelist type selector');
        await page.select('.other #causelist_type', causelistType);
      }
      await wait(300);
      console.log('[debug] [fetchSupremeCourtCauseList] Causelist type set');
      
      // 4. Main/Supplementary
      // console.log(`[debug] [fetchSupremeCourtCauseList] Setting main/supplementary to: ${mainAndSupplementry}`);
      // await page.click(`input[name="msb"][value="${mainAndSupplementry}"]`);
      // await wait(300);
      // console.log('[debug] [fetchSupremeCourtCauseList] Main/supplementary set');
      
      // 5. Date field
      console.log(`[debug] [fetchSupremeCourtCauseList] Setting listing date to: ${listingDate} (formatted: ${digits(listingDate)})`);
      await page.click('#listing_date', { clickCount: 3 });
      await page.type('#listing_date', digits(listingDate), { delay: 100 });
      await wait(800);
      console.log('[debug] [fetchSupremeCourtCauseList] Listing date set');
      
      // Verify all fields are properly set
      console.log('[debug] [fetchSupremeCourtCauseList] Starting form field verification...');
      
      // Check List Type
      const selectedListType = await page.evaluate(() => {
        const checkedRadio = document.querySelector('input[name="list_type"]:checked');
        return checkedRadio ? checkedRadio.value : null;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] List Type verification: ${selectedListType} (expected: ${listType})`);
      
      // Check Search By
      const selectedSearchBy = await page.evaluate(() => {
        const select = document.querySelector('#search_by');
        return select ? select.value : null;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Search By verification: ${selectedSearchBy} (expected: ${searchBy})`);
      
      // Check Causelist Type
      const selectedCauselistType = await page.evaluate(() => {
        const select = document.querySelector('#causelist_type');
        return select ? select.value : null;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Causelist Type verification: ${selectedCauselistType} (expected: ${causelistType})`);
      
      // Check Main/Supplementary
      const selectedMsb = await page.evaluate(() => {
        const checkedRadio = document.querySelector('input[name="msb"]:checked');
        return checkedRadio ? checkedRadio.value : null;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Main/Supplementary verification: ${selectedMsb} (expected: ${mainAndSupplementry})`);
      
      // Check Date field
      const selectedDate = await page.evaluate(() => {
        const input = document.querySelector('#listing_date');
        return input ? input.value : null;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Date verification: ${selectedDate} (expected: ${listingDate})`);
      
      // Overall validation
      const allFieldsCorrect = 
        selectedListType === listType &&
        selectedSearchBy === searchBy &&
        selectedCauselistType === causelistType &&
        selectedMsb === mainAndSupplementry &&
        selectedDate === listingDate;
      
      if (allFieldsCorrect) {
        console.log('[success] [fetchSupremeCourtCauseList] All form fields are correctly set!');
      } else {
        console.log('[warning] [fetchSupremeCourtCauseList] Some form fields may not be set correctly');
        console.log(`[debug] [fetchSupremeCourtCauseList] Field comparison: listType(${selectedListType}==${listType}), searchBy(${selectedSearchBy}==${searchBy}), causelistType(${selectedCauselistType}==${causelistType}), msb(${selectedMsb}==${mainAndSupplementry}), date(${selectedDate}==${listingDate})`);
      }
      
    } catch (formError) {
      console.log('[warning] [fetchSupremeCourtCauseList] Some form fields could not be filled, continuing with defaults:', formError.message);
      console.log('[debug] [fetchSupremeCourtCauseList] Form error details:', formError);
      // Continue with just the date field if other fields fail
      console.log('[debug] [fetchSupremeCourtCauseList] Attempting to set only the date field...');
      await page.click('#listing_date', { clickCount: 3 });
      await page.type('#listing_date', digits(listingDate), { delay: 100 });
      await wait(800);
      console.log('[debug] [fetchSupremeCourtCauseList] Date field set as fallback');
    }

    // Handle captcha
    console.log('[debug] [fetchSupremeCourtCauseList] Starting captcha handling...');
    console.log('[debug] [fetchSupremeCourtCauseList] Waiting for captcha image to appear...');
    const imgEl = await page.waitForSelector('.siwp_img, .captcha-img');
    console.log('[debug] [fetchSupremeCourtCauseList] Captcha image found');
    
    console.log('[debug] [fetchSupremeCourtCauseList] Getting captcha image URL...');
    const imgURL = await page.evaluate(el => el.src, imgEl);
    console.log(`[debug] [fetchSupremeCourtCauseList] Captcha image URL: ${imgURL}`);
    
    console.log('[debug] [fetchSupremeCourtCauseList] Downloading captcha image...');
    const { data } = await axios.get(imgURL, { responseType: 'arraybuffer' });
    console.log(`[debug] [fetchSupremeCourtCauseList] Captcha image downloaded, size: ${data.length} bytes`);

    console.log('[debug] [fetchSupremeCourtCauseList] Solving captcha with OpenAI...');
    const answer = await solveCaptcha(Buffer.from(data));
    console.log(`[info] [fetchSupremeCourtCauseList] Captcha solved: ${answer}`);
    
    console.log('[debug] [fetchSupremeCourtCauseList] Typing captcha answer...');
    await page.type('#siwp_captcha_value_0', answer);
    await wait(600);
    console.log('[debug] [fetchSupremeCourtCauseList] Captcha answer entered');

    // Submit and wait for results
    console.log('[debug] [fetchSupremeCourtCauseList] Submitting form...');
    await page.click('input[value="Search"]');
    console.log('[debug] [fetchSupremeCourtCauseList] Form submitted, waiting for results...');
    await wait(10000);
    console.log('[debug] [fetchSupremeCourtCauseList] Initial wait completed, checking for results...');

    try {
      console.log('[debug] [fetchSupremeCourtCauseList] Waiting for results to load...');
      await page.waitForFunction(
        () => {
          const links = document.querySelectorAll('a[href*=".pdf" i]');
          const error = document.querySelector('.error-message, .alert-danger');
          if (error) throw new Error(error.innerText);
          return links.length > 0;
        },
        { timeout: 120_000 }
      );
      console.log('[debug] [fetchSupremeCourtCauseList] Results loaded successfully');
      
      console.log('[debug] [fetchSupremeCourtCauseList] Counting PDF links...');
      const total = await page.evaluate(
        () => document.querySelectorAll('a[href*=".pdf" i]').length);
      console.log(`[info] [fetchSupremeCourtCauseList] Found ${total} cause list(s)`);

      // Wait for table to be fully loaded
      console.log('[debug] [fetchSupremeCourtCauseList] Waiting for table to fully load...');
      await wait(5000);
      console.log('[debug] [fetchSupremeCourtCauseList] Table loading wait completed');

      // Extract table data
      console.log('[debug] [fetchSupremeCourtCauseList] Starting table data extraction...');
      const rows = await page.evaluate(() => {
        console.log('[debug] [page] Starting table extraction...');
        const rows = document.querySelectorAll('table tbody tr');
        console.log(`[debug] [page] Found ${rows.length} table rows`);
        
        return Array.from(rows).map((tr, index) => {
          console.log(`[debug] [page] Processing row ${index + 1}`);
          const obj = {};
          
          // Extract data from table cells using data-th attributes
          const cells = tr.querySelectorAll('td');
          console.log(`[debug] [page] Row ${index + 1} has ${cells.length} cells`);
          
          cells.forEach((td, cellIndex) => {
            const label = td.getAttribute('data-th');
            if (label) {
              // Get text content from the span.bt-content or direct text
              const spanContent = td.querySelector('.bt-content');
              const cellText = spanContent ? spanContent.textContent.trim() : td.textContent.trim();
              obj[label.trim()] = cellText.replace(/\s+/g, ' ') || null;
              console.log(`[debug] [page] Cell ${cellIndex + 1}: ${label.trim()} = "${cellText}"`);
            }
          });
          
          // Extract links to cause list files
          const links = tr.querySelectorAll('a[href*=".pdf" i]');
          console.log(`[debug] [page] Row ${index + 1} has ${links.length} PDF links`);
          
          obj.causeListLinks = Array.from(links, (a, linkIndex) => {
            const linkData = { 
              text: a.textContent.trim(), 
              url: a.href,
              filename: a.href.split('/').pop() || a.href
            };
            console.log(`[debug] [page] Link ${linkIndex + 1}: ${linkData.text} -> ${linkData.filename}`);
            return linkData;
          });
          
          // Add row ID if available
          if (tr.id) {
            obj.rowId = tr.id;
            console.log(`[debug] [page] Row ${index + 1} has ID: ${tr.id}`);
          }
          
          console.log(`[debug] [page] Row ${index + 1} processed, keys: ${Object.keys(obj).join(', ')}`);
          return obj;
        }).filter(row => Object.keys(row).length > 1);
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Table extraction completed, got ${rows.length} rows`);

      if (rows.length === 0) {
        console.log('[warning] [fetchSupremeCourtCauseList] No table data found in website');
      } else {
        console.log('[info] [fetchSupremeCourtCauseList] Raw extracted data:');
        rows.forEach((row, index) => {
          console.log(`[info] [fetchSupremeCourtCauseList] Row ${index + 1}:`, {
            serialNumber: row["Serial Number"],
            file: row["File"],
            causeListLinks: row.causeListLinks
          });
        });
        console.log(`[info] [fetchSupremeCourtCauseList] Successfully extracted ${rows.length} rows`);       
      }

      // Transform data to include required fields for new database schema
      console.log('[debug] [fetchSupremeCourtCauseList] Starting data transformation...');
      const transformedRows = rows.map((row, index) => {
        const transformed = {
        ...row,
        // Add missing required fields
        "causeListType": listType,// Convert to array of URLs
        "date": listingDate
        };
        console.log(`[debug] [fetchSupremeCourtCauseList] Row ${index + 1} transformed:`, transformed);
        return transformed;
      });
      console.log(`[debug] [fetchSupremeCourtCauseList] Data transformation completed, returning ${transformedRows.length} rows`);

      return transformedRows;
=======

// Import all components from index
const {
  solveCaptcha,
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  validateFormFields,
  handleCaptcha,
  submitForm,
  waitForResults,
  extractTableData,
  transformData
} = require('./components');

/* ─── main routine ─── */
const fetchSupremeCourtCauseList = async (formData) => {
  console.log(`[start] [fetchSupremeCourtCauseList] Scraping cause list with parameters:`, formData);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);
    
    // Navigate to the page
    await navigateToPage(page);
    
    // Fill and validate form with the new form data structure
    await fillForm(page, formData);
    await validateFormFields(page, formData);
    
    // Handle captcha and submit
    await handleCaptcha(page, solveCaptcha);
    await submitForm(page);
    
    // Wait for results and extract data
    await waitForResults(page);
    const rows = await extractTableData(page);
    
    // // Transform data for database
    // const transformedRows = transformData(rows, formData);

    // return transformedRows;

    return rows;

>>>>>>> 3434e5eae763eccb797906be171a79dfe99431eb

    } catch (error) {
      console.error('[error] [fetchSupremeCourtCauseList] Failed to get results:', error.message);
      console.log('[debug] [fetchSupremeCourtCauseList] Error details:', error);
      throw error;
<<<<<<< HEAD
    } 

  } finally {
    console.log('[debug] [fetchSupremeCourtCauseList] Closing browser...');
    await browser.close();
    console.log("[end] [fetchSupremeCourtCauseList] Supreme Court Cause List Scraping completed successfully");
  }
}

module.exports = {
  fetchSupremeCourtCauseList
=======
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log("[end] [fetchSupremeCourtCauseList] Supreme Court Cause List Scraping completed successfully");
  }
};


module.exports = {
  fetchSupremeCourtCauseList,
>>>>>>> 3434e5eae763eccb797906be171a79dfe99431eb
}; 