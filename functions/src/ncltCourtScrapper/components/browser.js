const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

// Case type mapping - text to value (from testform.js)
const CASE_TYPE_MAPPING = {
  // Exact same order as your options
  "Rule 63 Appeal": "42",
  "IA (Liq.) Progress Report": "41",
  "Interlocutory Application(IBC)(Dis.)": "40",
  "Interlocutory Application(IBC)(Liq.)": "39",
  "Interlocutory Application(IBC)(Plan)": "38",
  "Restored Company Petition (Companies Act)": "37",
  "Restored Company Petition (IBC)": "36",
  "Voluntary Liquidation (IBC)": "35",
  "Transfer Application (IBC)": "34",
  "Insolvency & Bankruptcy (Pre-Packaged)": "33",
  "Transfer Application": "32",
  "Interlocutory Application (I.B.C)": "31",
  "Execution Petition": "30",
  "Transfer Petition (IBC)": "29",
  "Cross Appeal (IBC)": "28",
  "Company Appeal (IBC)": "27",
  "Miscellaneous Application (IBC)": "26",
  "Contempt Petition (IBC)": "25",
  "Cross Application (IBC)": "24",
  "Intervention Petition (IBC)": "23",
  "Restoration Application (IBC)": "22",
  "Review Application (IBC)": "21",
  "Interlocatory Application (IBC)": "20",
  "Rehabilitation petition(IBC)": "19",
  "Company Application(IBC)": "18",
  "Company Petition IB (IBC)": "16",
  "CP(AA) Merger and Amalgamation(Companies Act)": "15",
  "CA(A) Merger and Amalgamation(Companies Act)": "14",
  "Company Application(Companies Act)": "13",
  "Cross Appeal(Companies Act)": "12",
  "Company Appeal(Companies Act)": "11",
  "Miscellaneous Application(Companies Act)": "10",
  "Contempt Petition(Companies Act)": "9",
  "Cross Application (Companies Act)": "8",
  "Intervention Petition(Companies Act)": "7",
  "Restoration Application (Companies Act)": "6",
  "Review Application (Companies Act)": "5",
  "Interlocatory Application(Companies Act)": "4",
  "Rehabilitation petition (Companies Act)": "3",
  "Company Petition (Companies Act)": "2",
  "Transfer Petition(Companies Act)": "1",

  // Case insensitive variations (same order)
  "rule 63 appeal": "42",
  "ia (liq.) progress report": "41",
  "interlocutory application(ibc)(dis.)": "40",
  "interlocutory application(ibc)(liq.)": "39",
  "interlocutory application(ibc)(plan)": "38",
  "restored company petition (companies act)": "37",
  "restored company petition (ibc)": "36",
  "voluntary liquidation (ibc)": "35",
  "transfer application (ibc)": "34",
  "insolvency & bankruptcy (pre-packaged)": "33",
  "transfer application": "32",
  "interlocutory application (i.b.c)": "31",
  "execution petition": "30",
  "transfer petition (ibc)": "29",
  "cross appeal (ibc)": "28",
  "company appeal (ibc)": "27",
  "miscellaneous application (ibc)": "26",
  "contempt petition (ibc)": "25",
  "cross application (ibc)": "24",
  "intervention petition (ibc)": "23",
  "restoration application (ibc)": "22",
  "review application (ibc)": "21",
  "interlocatory application (ibc)": "20",
  "rehabilitation petition(ibc)": "19",
  "company application(ibc)": "18",
  "company petition ib (ibc)": "16",
  "cp(aa) merger and amalgamation(companies act)": "15",
  "ca(a) merger and amalgamation(companies act)": "14",
  "company application(companies act)": "13",
  "cross appeal(companies act)": "12",
  "company appeal(companies act)": "11",
  "miscellaneous application(companies act)": "10",
  "contempt petition(companies act)": "9",
  "cross application (companies act)": "8",
  "intervention petition(companies act)": "7",
  "restoration application (companies act)": "6",
  "review application (companies act)": "5",
  "interlocatory application(companies act)": "4",
  "rehabilitation petition (companies act)": "3",
  "company petition (companies act)": "2",
  "transfer petition(companies act)": "1"
};

const BENCH_MAPPING = {
  // Exact same order as your options
  "Principal Bench": "delhi_1",
  "New Delhi Bench Court-II": "delhi_2",
  "New Delhi Bench Court-III": "delhi_3",
  "New Delhi Bench Court-IV": "delhi_4",
  "New Delhi Bench Court-V": "delhi_5",
  "New Delhi Bench Court-VI": "delhi_6",
  "Ahmedabad": "ahmedabad",
  "Allahabad": "allahabad",
  "Amravati": "amravati",
  "Bengaluru": "bengaluru",
  "Chandigarh": "chandigarh",
  "Chennai": "chennai",
  "Cuttak": "cuttak",
  "Guwahati": "guwahati",
  "Hyderabad": "hyderabad",
  "Indore": "indore",
  "Jaipur": "jaipur",
  "Kochi": "kochi",
  "Kolkata": "kolkata",
  "Mumbai": "mumbai",

  // Case insensitive variations (same order)
  "principal bench": "delhi_1",
  "new delhi bench court-ii": "delhi_2",
  "new delhi bench court-iii": "delhi_3",
  "new delhi bench court-iv": "delhi_4",
  "new delhi bench court-v": "delhi_5",
  "new delhi bench court-vi": "delhi_6",
  "ahmedabad": "ahmedabad",
  "allahabad": "allahabad",
  "amravati": "amravati",
  "bengaluru": "bengaluru",
  "chandigarh": "chandigarh",
  "chennai": "chennai",
  "cuttak": "cuttak",
  "guwahati": "guwahati",
  "hyderabad": "hyderabad",
  "indore": "indore",
  "jaipur": "jaipur",
  "kochi": "kochi",
  "kolkata": "kolkata",
  "mumbai": "mumbai"
};

// Helper function to replace waitForTimeout
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to convert text-based payload to value-based payload
function convertPayloadTextToValues(payload) {
  const convertedPayload = { ...payload };
  
  // Convert case_type from text to value
  if (payload.case_type && typeof payload.case_type === 'string') {
    const caseTypeValue = CASE_TYPE_MAPPING[payload.case_type] || CASE_TYPE_MAPPING[payload.case_type.toLowerCase()];
    if (caseTypeValue) {
      convertedPayload.case_type = caseTypeValue;
      console.log(`🔄 Converted case type: "${payload.case_type}" → "${caseTypeValue}"`);
    } else {
      console.log(`⚠️ Unknown case type: "${payload.case_type}". Available types:`);
      Object.keys(CASE_TYPE_MAPPING).filter(key => key === key.toLowerCase()).forEach(key => {
        console.log(`   • "${key}" → "${CASE_TYPE_MAPPING[key]}"`);
      });
      throw new Error(`Unknown case type: "${payload.case_type}"`);
    }
  }
  
  // Convert bench from text to value (if needed)
  if (payload.bench && typeof payload.bench === 'string') {
    const benchValue = BENCH_MAPPING[payload.bench] || BENCH_MAPPING[payload.bench.toLowerCase()];
    if (benchValue) {
      convertedPayload.bench = benchValue;
      console.log(`🔄 Converted bench: "${payload.bench}" → "${benchValue}"`);
    } else {
      console.log(`⚠️ Unknown bench: "${payload.bench}". Available benches:`);
      Object.keys(BENCH_MAPPING).filter(key => key === key.toLowerCase()).forEach(key => {
        console.log(`   • "${key}" → "${BENCH_MAPPING[key]}"`);
      });
      throw new Error(`Unknown bench: "${payload.bench}"`);
    }
  }
  
  // Ensure cp_no and year are strings
  if (payload.cp_no && typeof payload.cp_no === 'number') {
    convertedPayload.cp_no = payload.cp_no.toString();
  }
  
  if (payload.year && typeof payload.year === 'number') {
    convertedPayload.year = payload.year.toString();
  }
  
  return convertedPayload;
}

// Create browser instance (supports both local and cloud environments)
async function createBrowser() {
    try {
        console.log('[browser] Creating browser instance...');
        
        const isLocal = process.env.NODE_ENV !== 'production';
        
        if (isLocal) {
            // Local development - use regular puppeteer
            const puppeteerRegular = require('puppeteer');
            return await puppeteerRegular.launch({
                headless: false,
                slowMo: 500,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--no-zygote',
                    '--single-process'
                ],
                defaultViewport: { width: 1366, height: 768 }
            });
        } else {
            // Cloud environment with additional args for reliability
            return await chromium.puppeteer.launch({
                args: [
                    ...chromium.args, 
                    '--hide-scrollbars', 
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-dev-shm-usage'
                ],
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath,
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        }
    } catch (error) {
        console.error('[browser] Failed to create browser:', error.message);
        throw error;
    }
}

// Navigate to NCLT website with retries and fallbacks (ENHANCED)
async function navigateToNCLTPage(page) {
    const urls = [
        'https://nclt.gov.in/order-cp-wise',
        'https://www.nclt.gov.in/order-cp-wise'
    ];
    
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            console.log(`\n🌐 Navigation attempt ${attempt}/5...`);
            
            // Clear any previous navigation state
            if (attempt > 1) {
                await page.goto('about:blank');
                await delay(3000);
            }
            
            // Navigate with multiple wait conditions
            const response = await page.goto(urls[0], {
                waitUntil: ['domcontentloaded', 'networkidle0'],
                timeout: 300000 // 5 minutes timeout
            });
            
            console.log(`📊 Response status: ${response ? response.status() : 'No response'}`);
            
            if (response && response.ok()) {
                // Wait for the form selector with multiple attempts
                let selectorFound = false;
                for (let selectorAttempt = 1; selectorAttempt <= 5; selectorAttempt++) {
                    try {
                        console.log(`   🔍 Waiting for form selector (attempt ${selectorAttempt}/5)...`);
                        await page.waitForSelector('select[name="bench"]', { timeout: 60000 });
                        selectorFound = true;
                        console.log('   ✅ Form selector found!');
                        break;
                    } catch (selectorError) {
                        console.log(`   ⚠️ Selector attempt ${selectorAttempt} failed, waiting...`);
                        await delay(10000);
                        
                        // Try alternative selectors
                        try {
                            const alternativeSelector = await page.$('form, select, input[type="submit"]');
                            if (alternativeSelector) {
                                console.log('   ✅ Alternative form elements found!');
                                selectorFound = true;
                                break;
                            }
                        } catch (altError) {
                            console.log('   ⚠️ No alternative selectors found');
                        }
                    }
                }
                
                if (selectorFound) {
                    console.log('✅ Navigation successful!');
                    navigationSuccess = true;
                    break;
                } else {
                    throw new Error('Required form elements not found after multiple attempts');
                }
            } else {
                throw new Error(`HTTP ${response ? response.status() : 'unknown'} response`);
            }
            
        } catch (navError) {
            console.log(`❌ Navigation attempt ${attempt} failed:`, navError.message);
            
            if (attempt < 5) {
                const waitTime = Math.min(attempt * 15000, 60000);
                console.log(`🔄 Waiting ${waitTime/1000} seconds before retry...`);
                await delay(waitTime);
            }
        }
    }
    
    if (!navigationSuccess) {
        throw new Error('Failed to navigate to NCLT website after 5 attempts');
    }
}

// Check if we're on the correct page and can proceed
async function validateNCLTPage(page) {
    try {
        console.log('[validate] Checking if we\'re on a valid NCLT page...');
        
        const pageInfo = await page.evaluate(() => {
            const title = document.title;
            const url = window.location.href;
            const hasForm = !!document.querySelector('form');
            const hasSelect = !!document.querySelector('select');
            const hasInput = !!document.querySelector('input');
            const bodyText = document.body ? document.body.textContent.toLowerCase() : '';
            
            return {
                title,
                url,
                hasForm,
                hasSelect,
                hasInput,
                isNCLTSite: url.includes('nclt.gov.in') || bodyText.includes('nclt') || bodyText.includes('national company law'),
                bodyLength: bodyText.length
            };
        });
        
        console.log('[validate] Page validation result:', pageInfo);
        
        if (pageInfo.isNCLTSite && (pageInfo.hasForm || pageInfo.hasSelect || pageInfo.hasInput)) {
            console.log('[validate] ✅ Valid NCLT page detected');
            return true;
        } else if (pageInfo.bodyLength > 1000) {
            console.log('[validate] ⚠️ Page loaded but may not be the expected form page');
            return true;
        } else {
            console.log('[validate] ❌ Invalid or empty page');
            return false;
        }
        
    } catch (error) {
        console.error('[validate] Page validation failed:', error.message);
        return false;
    }
}

// Enhanced form filling with better element detection (UPDATED FROM TESTFORM.JS)
async function fillNCLTForm(page, bench, caseType, cpNo, year) {
    try {
        console.log(`[form] Filling NCLT form with: bench=${bench}, caseType=${caseType}, cpNo=${cpNo}, year=${year}`);
        
        // First, let's see what form elements are available
        const formInfo = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select')).map((select, index) => ({
                index,
                name: select.name || select.id || `select-${index}`,
                options: Array.from(select.options).map(opt => ({ value: opt.value, text: opt.textContent.trim() }))
            }));
            
            const inputs = Array.from(document.querySelectorAll('input')).map((input, index) => ({
                index,
                name: input.name || input.id || `input-${index}`,
                type: input.type,
                placeholder: input.placeholder
            }));
            
            return { selects, inputs };
        });
        
        console.log('[form] Available form elements:', JSON.stringify(formInfo, null, 2));
        
        // Fill bench selection
        if (bench) {
            console.log(`[form] Looking for bench selector for: ${bench}`);
            
            const benchFilled = await page.evaluate((benchValue) => {
                const selects = document.querySelectorAll('select');
                
                for (const select of selects) {
                    const options = Array.from(select.options);
                    
                    // Look for exact value match first
                    let benchOption = options.find(opt => opt.value === benchValue);
                    
                    // If not found, look for text match
                    if (!benchOption) {
                        benchOption = options.find(opt => 
                            opt.textContent.toLowerCase().includes(benchValue.toLowerCase()) ||
                            opt.value.toLowerCase().includes(benchValue.toLowerCase())
                        );
                    }
                    
                    if (benchOption) {
                        select.value = benchOption.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Selected bench: ${benchOption.value} (${benchOption.textContent})`);
                        return true;
                    }
                }
                return false;
            }, bench);
            
            if (benchFilled) {
                console.log(`[form] ✅ Selected bench: ${bench}`);
            } else {
                console.log(`[form] ⚠️ Could not find bench option for: ${bench}`);
            }
        }
        
        // Fill case type selection
        if (caseType) {
            console.log(`[form] Looking for case type selector for: ${caseType}`);
            
            const caseTypeFilled = await page.evaluate((caseTypeValue) => {
                const selects = document.querySelectorAll('select');
                
                for (const select of selects) {
                    const options = Array.from(select.options);
                    
                    // Look for exact value match first
                    let caseTypeOption = options.find(opt => opt.value === caseTypeValue);
                    
                    // If not found, look for partial text match
                    if (!caseTypeOption) {
                        caseTypeOption = options.find(opt => 
                            opt.textContent.toLowerCase().includes('merger') ||
                            opt.textContent.toLowerCase().includes('amalgamation') ||
                            opt.value.includes(caseTypeValue)
                        );
                    }
                    
                    if (caseTypeOption) {
                        select.value = caseTypeOption.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Selected case type: ${caseTypeOption.value} (${caseTypeOption.textContent})`);
                        return true;
                    }
                }
                return false;
            }, caseType);
            
            if (caseTypeFilled) {
                console.log(`[form] ✅ Selected case type: ${caseType}`);
            } else {
                console.log(`[form] ⚠️ Could not find case type option for: ${caseType}`);
            }
        }
        
        // Fill CP number
        if (cpNo) {
            console.log(`[form] Looking for CP number input for: ${cpNo}`);
            
            const cpNoFilled = await page.evaluate((cpNoValue) => {
                const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
                
                for (const input of inputs) {
                    const placeholder = input.placeholder ? input.placeholder.toLowerCase() : '';
                    const name = input.name ? input.name.toLowerCase() : '';
                    const id = input.id ? input.id.toLowerCase() : '';
                    
                    if (placeholder.includes('cp') || placeholder.includes('number') ||
                        name.includes('cp') || name.includes('number') ||
                        id.includes('cp') || id.includes('number')) {
                        
                        input.value = cpNoValue.toString();
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Filled CP number input: ${input.name || input.id || 'unnamed'}`);
                        return true;
                    }
                }
                return false;
            }, cpNo);
            
            if (cpNoFilled) {
                console.log(`[form] ✅ Filled CP No: ${cpNo}`);
            } else {
                console.log(`[form] ⚠️ Could not find CP number input`);
            }
        }
        
        // Fill year selection
        if (year) {
            console.log(`[form] Looking for year selector for: ${year}`);
            
            const yearFilled = await page.evaluate((yearValue) => {
                const selects = document.querySelectorAll('select');
                
                for (const select of selects) {
                    const options = Array.from(select.options);
                    
                    // Look for year options
                    const yearOption = options.find(opt => 
                        opt.value === yearValue.toString() ||
                        opt.textContent.trim() === yearValue.toString()
                    );
                    
                    if (yearOption) {
                        select.value = yearOption.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Selected year: ${yearOption.value} (${yearOption.textContent})`);
                        return true;
                    }
                }
                return false;
            }, year);
            
            if (yearFilled) {
                console.log(`[form] ✅ Selected year: ${year}`);
            } else {
                console.log(`[form] ⚠️ Could not find year option for: ${year}`);
            }
        }
        
        console.log('[form] ✅ Form filling process completed');
        
    } catch (error) {
        console.error('[form] Form filling failed:', error.message);
        throw error;
    }
}

// Enhanced captcha handling with AI solving
// Add this enhanced captcha handling function to your browser.js

 

 // ...existing code...

// Enhanced NCLT captcha handler
async function handleNCLTCaptcha(page, captchaText = null) {
    console.log('[captcha] 🔍 Enhanced NCLT captcha handling...');
    
    try {
        // Wait for page to settle
        await page.waitForTimeout(3000);
        
        // Find captcha elements with multiple selectors
        const captchaInfo = await page.evaluate(() => {
            // Look for captcha input field
            const captchaSelectors = [
                'input[placeholder*="captcha" i]',
                'input[placeholder*="Captcha"]', 
                'input[name*="captcha" i]',
                'input[name="txtInput"]',
                'input[id*="captcha" i]',
                '.captcha input',
                '#captcha'
            ];
            
            let captchaInput = null;
            let usedSelector = '';
            
            for (const selector of captchaSelectors) {
                captchaInput = document.querySelector(selector);
                if (captchaInput) {
                    usedSelector = selector;
                    break;
                }
            }
            
            // Look for captcha image
            const captchaImage = document.querySelector('img[src*="captcha"]') || 
                                document.querySelector('img[alt*="captcha"]') ||
                                document.querySelector('.captcha img') ||
                                document.querySelector('img'); // fallback to any image
            
            return {
                hasInput: !!captchaInput,
                hasImage: !!captchaImage,
                inputSelector: usedSelector,
                imageSrc: captchaImage ? captchaImage.src : null,
                inputName: captchaInput ? captchaInput.name : null,
                inputPlaceholder: captchaInput ? captchaInput.placeholder : null
            };
        });
        
        console.log('[captcha] Captcha detection:', captchaInfo);
        
        if (!captchaInfo.hasInput) {
            console.log('[captcha] ✅ No captcha input field found');
            return true;
        }
        
        if (!captchaInfo.hasImage) {
            console.log('[captcha] ⚠️ Captcha input found but no captcha image detected');
            return false;
        }
        
        // If manual captcha text provided
        if (captchaText) {
            console.log(`[captcha] 📝 Using provided captcha: "${captchaText}"`);
            
            const filled = await page.evaluate((text, selector) => {
                const input = document.querySelector(selector);
                if (input) {
                    input.focus();
                    input.value = '';
                    input.value = text;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.blur();
                    return true;
                }
                return false;
            }, captchaText, captchaInfo.inputSelector);
            
            if (filled) {
                console.log('[captcha] ✅ Manual captcha filled successfully');
                return true;
            } else {
                console.log('[captcha] ❌ Failed to fill manual captcha');
                return false;
            }
        }
        
        // AI captcha solving
        console.log('[captcha] 🤖 Attempting AI captcha solving...');
        
        try {
            const { solveCaptcha } = require('./captcha');
            
            // Find captcha image element
            const captchaImageElement = await page.$('img');
            if (!captchaImageElement) {
                throw new Error('No captcha image element found for screenshot');
            }
            
            // Wait for image to load completely
            await page.waitForTimeout(2000);
            
            // Take screenshot of the captcha image
            const imageBuffer = await captchaImageElement.screenshot({
                type: 'png',
                omitBackground: true
            });
            
            console.log(`[captcha] 📸 Screenshot captured: ${imageBuffer.length} bytes`);
            
            if (imageBuffer.length < 500) {
                throw new Error('Screenshot too small - image may not be loaded');
            }
            
            // Solve captcha using AI
            const solvedText = await solveCaptcha(imageBuffer);
            console.log(`[captcha] ✅ AI solved captcha: "${solvedText}"`);
            
            // Fill the captcha input field
            const filled = await page.evaluate((text, selector) => {
                const input = document.querySelector(selector);
                if (input) {
                    console.log(`Filling captcha input with: ${text}`);
                    input.focus();
                    input.value = '';
                    input.value = text;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.blur();
                    return true;
                }
                return false;
            }, solvedText, captchaInfo.inputSelector);
            
            if (filled) {
                console.log('[captcha] ✅ AI captcha filled successfully');
                
                // Verify the value was set
                await page.waitForTimeout(1000);
                const verification = await page.evaluate((selector) => {
                    const input = document.querySelector(selector);
                    return input ? input.value : null;
                }, captchaInfo.inputSelector);
                
                console.log(`[captcha] 🔍 Verified input value: "${verification}"`);
                return true;
            } else {
                throw new Error('Failed to fill captcha input field');
            }
            
        } catch (aiError) {
            console.log('[captcha] ❌ AI captcha solving failed:', aiError.message);
            console.log('[captcha] ⚠️ Captcha auto-solving failed - continuing anyway');
            return false;
        }
        
    } catch (error) {
        console.error('[captcha] ❌ Captcha handling error:', error.message);
        console.log('[captcha] ⚠️ Captcha auto-solving failed - continuing anyway');
        return false;
    }
}

// Enhanced form submission to find the Search button
async function submitNCLTForm(page, searchParams) {
    try {
        console.log('[submit] Enhanced form submission with better button detection...');
        
        const originalUrl = page.url();
        console.log(`📍 Original URL: ${originalUrl}`);
        
        // Enhanced search button detection
        console.log('🔍 Looking for Search button...');
        const submitResult = await page.evaluate(() => {
            // Multiple selectors to find the search/submit button
            const buttonSelectors = [
                'input[value="Search"]',
                'button[type="submit"]',
                'input[type="submit"]',
                'button:contains("Search")',
                'input[name*="submit"]',
                '.search-btn',
                '.btn-search',
                '#search-btn',
                'input[value*="Search" i]',
                'button[onclick*="submit"]'
            ];
            
            for (const selector of buttonSelectors) {
                try {
                    let button;
                    
                    if (selector.includes(':contains')) {
                        // Handle :contains selector manually
                        const buttons = document.querySelectorAll('button');
                        button = Array.from(buttons).find(btn => 
                            btn.textContent.toLowerCase().includes('search')
                        );
                    } else {
                        button = document.querySelector(selector);
                    }
                    
                    if (button && !button.disabled) {
                        console.log(`Found button with selector: ${selector}`);
                        console.log(`Button text: "${button.textContent || button.value}"`);
                        
                        button.click();
                        return { 
                            success: true, 
                            selector: selector,
                            buttonText: button.textContent || button.value || 'No text'
                        };
                    }
                } catch (e) {
                    console.log(`Error with selector ${selector}:`, e.message);
                }
            }
            
            // Last resort - try any button or input that might be a submit
            const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
            for (const btn of allButtons) {
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('search') || text.includes('submit') || btn.type === 'submit') {
                    try {
                        btn.click();
                        return {
                            success: true,
                            selector: 'fallback',
                            buttonText: text
                        };
                    } catch (e) {
                        console.log('Fallback button click failed:', e.message);
                    }
                }
            }
            
            return { success: false, error: 'No search button found' };
        });
        
        if (!submitResult.success) {
            console.log('❌ Could not find or click search button:', submitResult.error);
            return { success: false, error: submitResult.error || 'Search button not found' };
        }
        
        console.log(`✅ Search button clicked: "${submitResult.buttonText}" (${submitResult.selector})`);
        
        // Wait for form submission and potential page change
        try {
            await Promise.race([
                page.waitForNavigation({ 
                    waitUntil: ['domcontentloaded'], 
                    timeout: 30000 
                }),
                page.waitForFunction(() => {
                    return document.querySelector('table') || 
                           document.body.textContent.includes('No Record Found') ||
                           document.body.textContent.includes('Search Results');
                }, { timeout: 30000 })
            ]);
        } catch (waitError) {
            console.log('⚠️ Wait timeout - continuing anyway:', waitError.message);
        }
        
        // Extended wait for results to load
        await page.waitForTimeout(10000);
        
        const finalUrl = page.url();
        console.log(`📍 Final URL after submission: ${finalUrl}`);
        
        return { success: true, url: finalUrl };
        
    } catch (error) {
        console.error('[submit] ❌ Form submission failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ...existing code...

// Check for results (ENHANCED FROM TESTFORM.JS)
async function checkForResults(page) {
    try {
        console.log('🔍 Enhanced results checking...');
        
        // Wait for page to stabilize
        await delay(5000);
        
        const currentUrl = page.url();
        console.log(`[results] Current URL: ${currentUrl}`);
        
        const pageAnalysis = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasTable: document.querySelectorAll('table').length > 0,
                tableCount: document.querySelectorAll('table').length,
                bodyLength: document.body ? document.body.textContent.length : 0,
                hasResultsContent: document.body ? (
                    document.body.textContent.toLowerCase().includes('case') ||
                    document.body.textContent.toLowerCase().includes('petition') ||
                    document.body.textContent.toLowerCase().includes('order') ||
                    document.body.textContent.toLowerCase().includes('filing') ||
                    document.body.textContent.toLowerCase().includes('search results')
                ) : false,
                hasErrorMessage: (() => {
                    if (!document.body) return false;
                    
                    const bodyText = document.body.textContent.toLowerCase();
                    const errorKeywords = ['error', 'invalid', 'failed', 'not found', 'no records'];
                    const excludeKeywords = ['old orders and judgments', 'header menu', 'skip to main content', 'footer'];
                    
                    for (const errorKeyword of errorKeywords) {
                        if (bodyText.includes(errorKeyword)) {
                            const contextFound = excludeKeywords.some(exclude => {
                                const errorIndex = bodyText.indexOf(errorKeyword);
                                const excludeIndex = bodyText.indexOf(exclude);
                                return excludeIndex !== -1 && Math.abs(excludeIndex - errorIndex) < 100;
                            });
                            if (!contextFound) {
                                return true;
                            }
                        }
                    }
                    return false;
                })(),
                snippet: document.body ? document.body.textContent.substring(0, 1000) : 'No body content'
            };
        });
        
        console.log('📊 Enhanced page analysis:', {
            hasTable: pageAnalysis.hasTable,
            tableCount: pageAnalysis.tableCount,
            hasResultsContent: pageAnalysis.hasResultsContent,
            hasErrorMessage: pageAnalysis.hasErrorMessage
        });
        
        if (pageAnalysis.hasErrorMessage) {
            console.log('⚠️ Error detected on page, but checking if results are still available...');
            
            if (pageAnalysis.hasTable && pageAnalysis.tableCount > 0) {
                console.log('✅ Tables found despite error message, proceeding with extraction');
                return { success: true, hasResults: true, warning: 'Error message detected but results available' };
            } else {
                return { success: false, error: 'Error message detected with no results', errorType: 'NO_CASE_FOUND' };
            }
        }
        
        const hasResults = pageAnalysis.hasTable || pageAnalysis.hasResultsContent || pageAnalysis.bodyLength > 2000;
        
        if (hasResults) {
            console.log('✅ Enhanced results check: Results found');
            return { success: true, hasResults: true };
        } else {
            console.log('❌ Enhanced results check: No results found');
            return { success: true, hasResults: false, errorType: 'NO_CASE_FOUND', message: 'No records found' };
        }
        
    } catch (error) {
        console.error('❌ Error in enhanced results check:', error.message);
        return { success: false, error: error.message };
    }
}

// Get page info for debugging
async function getPageInfo(page) {
    try {
        const info = await page.evaluate(() => ({
            title: document.title,
            url: window.location.href,
            hasForm: !!document.querySelector('form'),
            hasTable: !!document.querySelector('table')
        }));
        
        console.log('[debug] Page info:', info);
        return info;
    } catch (error) {
        console.error('[debug] Failed to get page info:', error.message);
        return {};
    }
}

// Enhanced table data extraction (FROM TESTFORM.JS)
async function extractTableData(page) {
    console.log('📊 Enhanced table data extraction...');
    
    try {
        const results = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            const extractedResults = [];
            
            tables.forEach((table, tableIndex) => {
                const rows = Array.from(table.querySelectorAll('tr'));
                
                if (rows.length > 1) {
                    const headers = Array.from(rows[0].querySelectorAll('th, td')).map(cell => 
                        cell.textContent.trim()
                    );
                    
                    const hasCaseHeaders = headers.some(header => 
                        header.toLowerCase().includes('filing') ||
                        header.toLowerCase().includes('case') ||
                        header.toLowerCase().includes('petitioner') ||
                        header.toLowerCase().includes('status')
                    );
                    
                    if (!hasCaseHeaders) return;
                    
                    const dataRows = rows.slice(1).map((row, rowIndex) => {
                        const cells = Array.from(row.querySelectorAll('td, th'));
                        const rowData = {
                            rowIndex: rowIndex + 1,
                            data: {},
                            statusLinks: [],
                            allLinks: []
                        };
                        
                        cells.forEach((cell, cellIndex) => {
                            const header = headers[cellIndex] || `Column_${cellIndex + 1}`;
                            const cellText = cell.textContent.trim();
                            
                            rowData.data[header] = cellText;
                            
                            const links = cell.querySelectorAll('a');
                            if (links.length > 0) {
                                links.forEach(link => {
                                    const onclick = link.getAttribute('onclick');
                                    const href = link.href;
                                    const linkText = link.textContent.trim();
                                    
                                    const linkInfo = {
                                        text: linkText,
                                        href: href,
                                        onclick: onclick,
                                        cellHeader: header,
                                        isClickable: !!onclick || (href && href !== window.location.href + '#'),
                                        isStatusLink: linkText.toLowerCase().includes('pending') ||
                                                     linkText.toLowerCase().includes('disposed') ||
                                                     linkText.toLowerCase().includes('status') ||
                                                     header.toLowerCase().includes('status'),
                                        isPDFLink: linkText.toLowerCase().includes('pdf') ||
                                                  linkText.toLowerCase().includes('view') ||
                                                  href.toLowerCase().includes('pdf')
                                    };
                                    
                                    rowData.allLinks.push(linkInfo);
                                    
                                    if (linkInfo.isStatusLink) {
                                        rowData.statusLinks.push(linkInfo);
                                    }
                                });
                            }
                        });
                        
                        return rowData;
                    }).filter(row => 
                        Object.values(row.data).some(value => 
                            typeof value === 'string' && value.length > 0
                        )
                    );
                    
                    if (dataRows.length > 0) {
                        extractedResults.push({
                            tableIndex: tableIndex + 1,
                            headers,
                            rows: dataRows,
                            rowCount: dataRows.length,
                            statusLinkCount: dataRows.reduce((count, row) => count + row.statusLinks.length, 0),
                            totalLinkCount: dataRows.reduce((count, row) => count + row.allLinks.length, 0)
                        });
                    }
                }
            });
            
            return extractedResults.length > 0 ? extractedResults : null;
        });
        
        if (results && results.length > 0) {
            console.log(`✅ Enhanced extraction: Found ${results.length} table(s) with ${results.reduce((total, table) => total + table.rowCount, 0)} total cases`);
            return results;
        } else {
            console.log('❌ Enhanced extraction: No results found');
            return [];
        }
        
    } catch (error) {
        console.error('[extract] Enhanced table extraction failed:', error.message);
        return [];
    }
}

// Process detail links for comprehensive case information (FROM TESTFORM.JS)
async function processDetailLinks(page, tableData) {
    console.log(`[process] Enhanced processing of ${tableData.length} search result(s)...`);
    
    const completeData = [];
    
    if (tableData && tableData.length > 0) {
        for (let i = 0; i < tableData.length; i++) {
            const result = tableData[i];
            console.log(`\n🔍 Processing table ${i + 1}/${tableData.length}...`);
            
            for (let rowIndex = 0; rowIndex < result.rows.length; rowIndex++) {
                const row = result.rows[rowIndex];
                const statusLinks = row.statusLinks || [];
                
                if (statusLinks.length > 0) {
                    console.log(`   📎 Found ${statusLinks.length} status link(s), extracting detailed information...`);
                    
                    for (const statusLink of statusLinks) {
                        const detailedInfo = await extractDetailedCaseInfo(page, statusLink, row);
                        
                        if (detailedInfo) {
                            const completeCase = {
                                searchResult: result,
                                detailedCaseInfo: detailedInfo,
                                extractedAt: new Date().toISOString()
                            };
                            
                            completeData.push(completeCase);
                            console.log(`   ✅ Successfully extracted complete information for case`);
                        } else {
                            const basicCase = {
                                searchResult: result,
                                detailedCaseInfo: null,
                                extractedAt: new Date().toISOString(),
                                note: 'Detailed extraction failed, basic search result only'
                            };
                            
                            completeData.push(basicCase);
                            console.log(`   ⚠️ Added basic search result only (detailed extraction failed)`);
                        }
                    }
                } else {
                    const basicCase = {
                        searchResult: result,
                        detailedCaseInfo: null,
                        extractedAt: new Date().toISOString(),
                        note: 'No status links found'
                    };
                    
                    completeData.push(basicCase);
                    console.log(`   📋 Added search result (no status links found)`);
                }
            }
        }
    }
    
    console.log(`✅ Enhanced processing completed: ${completeData.length} complete case(s) processed`);
    return completeData;
}

// Extract detailed case information (FROM TESTFORM.JS)
async function extractDetailedCaseInfo(page, statusLink, rowData) {
    try {
        console.log(`      🔧 Extracting detailed info via: ${statusLink.text}`);
        
        const originalUrl = page.url();
        
        if (statusLink.href && statusLink.href !== '#' && !statusLink.href.includes('javascript:')) {
            console.log(`      🌐 Navigating to: ${statusLink.href}`);
            
            try {
                await page.goto(statusLink.href, { 
                    waitUntil: ['domcontentloaded', 'networkidle2'], 
                    timeout: 300000
                });
                
                await delay(5000);
                
                const caseDetails = await extractComprehensiveCaseDetails(page);
                
                await page.goto(originalUrl, { 
                    waitUntil: ['domcontentloaded', 'networkidle2'], 
                    timeout: 300000 
                });
                await delay(3000);
                
                return caseDetails;
                
            } catch (navError) {
                console.log(`      ❌ Navigation failed: ${navError.message}`);
                return null;
            }
        }
        
        return null;
        
    } catch (error) {
        console.log(`      ❌ Failed to extract detailed info: ${error.message}`);
        return null;
    }
}

// Extract comprehensive case details (FROM TESTFORM.JS)
async function extractComprehensiveCaseDetails(page) {
    console.log('      📊 Extracting comprehensive case details with PDF links...');
    
    try {
        await delay(3000);
        
        const caseDetails = await page.evaluate(() => {
            const details = {
                pageInfo: {
                    title: document.title,
                    url: window.location.href,
                    extractedAt: new Date().toISOString()
                },
                basicCaseInfo: {},
                allParties: [],
                listingHistory: [],
                pdfLinks: [],
                allSections: []
            };
            
            // Expand all collapsible sections
            const expandButtons = document.querySelectorAll('button[data-toggle="collapse"], .btn[data-toggle="collapse"], [aria-expanded="false"]');
            expandButtons.forEach(button => {
                try {
                    if (button.getAttribute('aria-expanded') === 'false') {
                        button.click();
                    }
                } catch (e) {
                    // Continue if click fails
                }
            });
            
            const allTables = document.querySelectorAll('table');
            
            allTables.forEach((table, tableIndex) => {
                const rows = table.querySelectorAll('tr');
                
                // Process key-value pairs for basic info
                const firstRow = rows[0];
                if (firstRow && firstRow.querySelectorAll('td, th').length === 2) {
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length === 2) {
                            const key = cells[0].textContent.trim();
                            const value = cells[1].textContent.trim();
                            
                            if (key && value && key.length < 200) {
                                const cleanKey = key.replace(/[:\s]+$/, '').trim();
                                details.basicCaseInfo[cleanKey] = value.trim();
                            }
                        }
                    });
                }
                
                // Process listing history tables
                const headerRow = table.querySelector('tr');
                if (headerRow) {
                    const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => 
                        cell.textContent.trim()
                    );
                    
                    if (headers.some(h => 
                        h.toLowerCase().includes('date') || 
                        h.toLowerCase().includes('listing') || 
                        h.toLowerCase().includes('order') ||
                        h.toLowerCase().includes('judgment'))) {
                        
                        const dataRows = Array.from(table.querySelectorAll('tr')).slice(1);
                        
                        dataRows.forEach((row, rowIndex) => {
                            const cells = Array.from(row.querySelectorAll('td, th'));
                            const rowData = { 
                                rowIndex: rowIndex + 1, 
                                data: {},
                                pdfLinks: []
                            };
                            
                            cells.forEach((cell, cellIndex) => {
                                const header = headers[cellIndex] || `Column_${cellIndex + 1}`;
                                const cellText = cell.textContent.trim();
                                rowData.data[header] = cellText;
                                
                                const links = cell.querySelectorAll('a');
                                if (links.length > 0) {
                                    links.forEach(link => {
                                        const linkText = link.textContent.trim();
                                        const linkHref = link.href;
                                        
                                        if (linkText.toLowerCase().includes('pdf') || 
                                            linkText.toLowerCase().includes('view') ||
                                            linkHref.toLowerCase().includes('pdf') ||
                                            linkHref.toLowerCase().includes('gen_pdf')) {
                                            
                                            const pdfInfo = {
                                                text: linkText,
                                                href: linkHref,
                                                cellHeader: header,
                                                dateContext: cellText
                                            };
                                            
                                            rowData.pdfLinks.push(pdfInfo);
                                            details.pdfLinks.push(pdfInfo);
                                        }
                                    });
                                }
                            });
                            
                            if (Object.keys(rowData.data).length > 1) {
                                details.listingHistory.push(rowData);
                            }
                        });
                    }
                }
            });
            
            return details;
        });
        
        console.log(`      ✅ Comprehensive extraction completed: ${Object.keys(caseDetails.basicCaseInfo).length} basic fields, ${caseDetails.listingHistory.length} listing entries, ${caseDetails.pdfLinks.length} PDF links`);
        
        return caseDetails;
        
    } catch (error) {
        console.log(`      ❌ Failed to extract comprehensive details: ${error.message}`);
        return null;
    }
}

// Extract case details from case-details page (ENHANCED)
async function extractCaseDetails(page) {
    console.log('[details] Enhanced NCLT case details extraction...');
    
    try {
        await delay(2000);
        
        const caseDetails = await page.evaluate(() => {
            const details = {
                filingNumber: '',
                filingDate: '',
                partyName: '',
                petitionerAdvocate: '',
                respondentAdvocate: '',
                caseNumber: '',
                registeredOn: '',
                lastListed: '',
                nextListingDate: '',
                caseStatus: '',
                listingHistory: []
            };
            
            // Extract basic case information
            const tables = document.querySelectorAll('table');
            
            tables.forEach((table) => {
                const rows = table.querySelectorAll('tr');
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    
                    if (cells.length === 2) {
                        const label = cells[0].textContent.trim().toLowerCase();
                        const value = cells[1].textContent.trim();
                        
                        if (label.includes('filing number')) {
                            details.filingNumber = value;
                        } else if (label.includes('filing date')) {
                            details.filingDate = value;
                        } else if (label.includes('party name')) {
                            details.partyName = value;
                        } else if (label.includes('petitioner advocate')) {
                            details.petitionerAdvocate = value;
                        } else if (label.includes('respondent advocate')) {
                            details.respondentAdvocate = value;
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
                        }
                    }
                });
            });
            
            // Extract Listing History
            const listingHistoryHeaders = Array.from(document.querySelectorAll('th')).filter(th => 
                th.textContent.trim().toLowerCase().includes('s.no') ||
                th.textContent.trim().toLowerCase().includes('date of listing') ||
                th.textContent.trim().toLowerCase().includes('order/judgement')
            );
            
            if (listingHistoryHeaders.length > 0) {
                const historyTable = listingHistoryHeaders[0].closest('table');
                
                if (historyTable) {
                    const historyRows = historyTable.querySelectorAll('tr');
                    
                    Array.from(historyRows).slice(1).forEach((row) => {
                        const cells = row.querySelectorAll('td');
                        
                        if (cells.length >= 4) {
                            const pdfLinks = [];
                            const pdfLinksInCell = cells[3]?.querySelectorAll('a') || [];
                            
                            Array.from(pdfLinksInCell).forEach(link => {
                                if (link.href && (
                                    link.href.includes('.pdf') || 
                                    link.textContent.toLowerCase().includes('pdf') ||
                                    link.textContent.toLowerCase().includes('view')
                                )) {
                                    pdfLinks.push({
                                        url: link.href,
                                        text: link.textContent.trim()
                                    });
                                }
                            });
                            
                            const historyEntry = {
                                serialNo: cells[0]?.textContent.trim() || '',
                                dateOfListing: cells[1]?.textContent.trim() || '',
                                dateOfUpload: cells[2]?.textContent.trim() || '',
                                orderJudgement: cells[3]?.textContent.trim() || '',
                                pdfLinks: pdfLinks,
                                pdfUrl: pdfLinks.length > 0 ? pdfLinks[0].url : null
                            };
                            
                            details.listingHistory.push(historyEntry);
                        }
                    });
                }
            }
            
            return details;
        });
        
        console.log(`[details] Enhanced extraction completed: ${caseDetails.listingHistory.length} listing entries`);
        return caseDetails;
        
    } catch (error) {
        console.error('[details] Enhanced case details extraction failed:', error.message);
        return { listingHistory: [] };
    }
}

// Legacy extraction fallback
async function extractSearchResults(page) {
    console.log('[legacy] Using enhanced legacy extraction method...');
    
    try {
        const results = await extractTableData(page);
        
        return {
            success: true,
            totalRecords: Array.isArray(results) ? results.length : 0,
            data: Array.isArray(results) ? results : []
        };
    } catch (error) {
        console.error('[legacy] Enhanced legacy extraction failed:', error.message);
        return {
            success: false,
            error: error.message,
            totalRecords: 0,
            data: []
        };
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

module.exports = {
    createBrowser,
    closeBrowser,
    navigateToNCLTPage,
    validateNCLTPage,
    fillNCLTForm,
    handleNCLTCaptcha,
    submitNCLTForm,
    checkForResults,
    getPageInfo,
    extractTableData,
    processDetailLinks,
    extractCaseDetails,
    extractSearchResults,
    convertPayloadTextToValues,
    CASE_TYPE_MAPPING,
    BENCH_MAPPING,
    
    // Enhanced functions from testform.js
    extractDetailedCaseInfo,
    extractComprehensiveCaseDetails,
    
    // Legacy function stubs for compatibility
    extractTableDataEnhanced: extractTableData,
    selectBench: () => {},
    selectCaseType: () => {},
    selectYear: () => {},
    fillCPNumber: () => {},
    extractNCLTCaseData: () => {},
    extractSingleCaseDetails: () => {}
};