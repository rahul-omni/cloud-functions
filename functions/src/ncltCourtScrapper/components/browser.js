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
 // Replace the handleNCLTCaptcha function with this COMPLETE version
async function handleNCLTCaptcha(page, captchaText = null) {
    console.log('[captcha] 🔍 COMPLETE AUTOMATIC NCLT captcha solving...');
    
    try {
        // Wait for page to settle
        await delay(3000);
        
        // STEP 1: Find captcha elements on the page
        const captchaInfo = await page.evaluate(() => {
            // Look for captcha input field
            const captchaSelectors = [
                'input[placeholder*="captcha" i]',
                'input[placeholder*="Captcha"]', 
                'input[name*="captcha" i]',
                'input[id="txtInput"]',
                '#txtInput',
                'input[autocomplete="off"]',
                '.form-control[placeholder*="Enter Captcha"]'
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
            
            // STEP 2: Look for captcha display elements (DOM or image)
            const captchaDisplaySelectors = [
                '#mainCaptcha',           // The div with ID mainCaptcha
                '.captchabg',             // The div with class captchabg  
                'div.captchabg',          
                '.text-center[id="mainCaptcha"]',
                'div[style*="text-decoration-line: underline"]',
                'img[src*="captcha"]',    // Captcha images
                'img[alt*="captcha"]',
                '.captcha img'
            ];
            
            let displayedCaptchaNumber = null;
            let captchaElement = null;
            let captchaMethod = null;
            
            // First try to extract from DOM text (like "5 9 4 7")
            for (const selector of captchaDisplaySelectors) {
                captchaElement = document.querySelector(selector);
                if (captchaElement) {
                    console.log(`Found captcha element with selector: ${selector}`);
                    
                    // If it's a div with text content (like your example)
                    if (captchaElement.tagName !== 'IMG') {
                        const captchaText = captchaElement.textContent || captchaElement.innerText || '';
                        console.log(`Raw captcha text: "${captchaText}"`);
                        
                        // Clean the text - remove spaces and get digits
                        const cleanedText = captchaText.replace(/\s+/g, '').trim();
                        console.log(`Cleaned captcha text: "${cleanedText}"`);
                        
                        // Check if it's a valid 4-digit number
                        if (/^\d{4}$/.test(cleanedText)) {
                            displayedCaptchaNumber = cleanedText;
                            captchaMethod = 'DOM_TEXT';
                            console.log(`Extracted captcha number from DOM: "${displayedCaptchaNumber}"`);
                            break;
                        } else {
                            // Try to extract digits from spaced text like "5 9 4 7"
                            const digits = captchaText.match(/\d/g);
                            if (digits && digits.length >= 4) {
                                displayedCaptchaNumber = digits.slice(0, 4).join('');
                                captchaMethod = 'DOM_SPACED_TEXT';
                                console.log(`Extracted spaced captcha: "${displayedCaptchaNumber}"`);
                                break;
                            }
                        }
                    }
                }
            }
            
            return {
                hasInput: !!captchaInput,
                inputSelector: usedSelector,
                inputName: captchaInput ? captchaInput.name : null,
                inputId: captchaInput ? captchaInput.id : null,
                inputPlaceholder: captchaInput ? captchaInput.placeholder : null,
                displayedNumber: displayedCaptchaNumber,
                captchaMethod: captchaMethod,
                captchaElement: captchaElement ? {
                    tagName: captchaElement.tagName,
                    id: captchaElement.id,
                    className: captchaElement.className,
                    textContent: captchaElement.textContent
                } : null
            };
        });
        
        console.log('[captcha] CAPTCHA DETECTION RESULTS:', {
            hasInput: captchaInfo.hasInput,
            displayedNumber: captchaInfo.displayedNumber,
            captchaMethod: captchaInfo.captchaMethod,
            inputSelector: captchaInfo.inputSelector,
            captchaElement: captchaInfo.captchaElement
        });
        
        if (!captchaInfo.hasInput) {
            console.log('[captcha] ✅ No captcha input field found - proceeding');
            return true;
        }
        
        // Manual captcha for testing
        if (captchaText && captchaText.trim() !== '') {
            console.log(`[captcha] 📝 TESTING: Using provided captcha: "${captchaText}"`);
            const filled = await fillCaptchaInput(page, captchaText.trim(), captchaInfo.inputSelector);
            if (filled) {
                console.log('[captcha] ✅ Manual captcha filled successfully');
                return true;
            }
        }
        
        // STEP 3: If we found the displayed number directly from DOM, use it
        if (captchaInfo.displayedNumber && captchaInfo.captchaMethod) {
            console.log(`[captcha] 🎯 Using directly extracted DOM number: "${captchaInfo.displayedNumber}" (method: ${captchaInfo.captchaMethod})`);
            const filled = await fillCaptchaInput(page, captchaInfo.displayedNumber, captchaInfo.inputSelector);
            if (filled) {
                console.log('[captcha] ✅ Direct DOM extraction successful!');
                return true;
            }
        }
        
        // STEP 4: If DOM extraction failed, use AI-based OCR with screenshot
        console.log('[captcha] 🤖 Starting AI-based captcha solving with screenshot...');
        
        const maxAttempts = 3;
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[captcha] 🎯 AI solving attempt ${attempt}/${maxAttempts}...`);
                
                // STEP 4A: Find the best element to screenshot
                let captchaElement = null;
                
                // Try to find the captcha display element first
                captchaElement = await page.$('#mainCaptcha, .captchabg, div[id="mainCaptcha"]');
                
                // If no specific captcha display element, try captcha images
                if (!captchaElement) {
                    captchaElement = await page.$('img[src*="captcha"], .captcha img, img[alt*="captcha"]');
                }
                
                // If still no element, try any image on the page
                if (!captchaElement) {
                    captchaElement = await page.$('img');
                }
                
                if (!captchaElement) {
                    throw new Error('No captcha element found for AI solving');
                }
                
                // STEP 4B: Take screenshot of the captcha element
                const imageBuffer = await captchaElement.screenshot({
                    type: 'png',
                    omitBackground: false
                });
                
                console.log(`[captcha] 📸 Screenshot captured: ${imageBuffer.length} bytes`);
                
                if (imageBuffer.length < 100) {
                    throw new Error(`Screenshot too small: ${imageBuffer.length} bytes`);
                }
                
                // STEP 4C: Send to AI solver (your solveCaptcha function)
                const { solveCaptcha, solveCaptchaOCR } = require('./captcha');
                
                let solvedText = null;
                
                // Try main AI solver first
                try {
                    console.log('[captcha] 🧠 Sending to main AI solver (solveCaptcha)...');
                    solvedText = await solveCaptcha(imageBuffer);
                    console.log(`[captcha] 🎉 AI solver returned: "${solvedText}"`);
                } catch (mainError) {
                    console.log(`[captcha] Main AI solver failed: ${mainError.message}`);
                    
                    // Try OCR fallback
                    try {
                        console.log('[captcha] 🔍 Trying OCR fallback solver...');
                        solvedText = await solveCaptchaOCR(imageBuffer);
                        console.log(`[captcha] 🎉 OCR solver returned: "${solvedText}"`);
                    } catch (ocrError) {
                        console.log(`[captcha] OCR fallback failed: ${ocrError.message}`);
                        throw mainError;
                    }
                }
                
                // STEP 4D: Validate the AI response
                if (!solvedText || solvedText.trim().length === 0) {
                    throw new Error('AI solver returned empty result');
                }
                
                // Clean the AI response (remove any extra characters)
                const cleanedSolution = solvedText.replace(/[^\d]/g, '').trim();
                
                if (cleanedSolution.length !== 4) {
                    console.log(`[captcha] ⚠️ AI returned "${solvedText}", cleaned to "${cleanedSolution}" (not 4 digits)`);
                    // Still try to use it, but log warning
                }
                
                const finalSolution = cleanedSolution || solvedText.trim();
                console.log(`[captcha] ✅ AI solving successful: "${finalSolution}"`);
                
                // STEP 4E: Fill the captcha input with AI solution
                const filled = await fillCaptchaInput(page, finalSolution, captchaInfo.inputSelector);
                
                if (filled) {
                    // STEP 4F: Verify the input was filled correctly
                    await delay(1000);
                    const verification = await page.evaluate((selector) => {
                        const input = document.querySelector(selector);
                        return input ? input.value : null;
                    }, captchaInfo.inputSelector);
                    
                    console.log(`[captcha] 🔍 Verification check: "${verification}"`);
                    
                    if (verification === finalSolution) {
                        console.log('[captcha] ✅ AI captcha solved and verified perfectly!');
                    } else {
                        console.log('[captcha] ⚠️ Verification mismatch but continuing...');
                    }
                    
                    return true;
                } else {
                    throw new Error('Failed to fill captcha input with AI solution');
                }
                
            } catch (attemptError) {
                lastError = attemptError;
                console.log(`[captcha] ❌ AI attempt ${attempt} failed: ${attemptError.message}`);
                
                if (attempt < maxAttempts) {
                    console.log(`[captcha] 🔄 Retrying in 3 seconds...`);
                    await delay(3000);
                    
                    // Try to refresh captcha for next attempt
                    try {
                        const refreshClicked = await page.evaluate(() => {
                            const refreshElements = document.querySelectorAll('.refresh_captcha, .btnRefresh img, img[src*="refresh"], .btnRefresh');
                            for (const element of refreshElements) {
                                if (element.click) {
                                    element.click();
                                    console.log('Clicked refresh element');
                                    return true;
                                }
                            }
                            
                            // Try clicking parent elements
                            const refreshBtns = document.querySelectorAll('.btnRefresh');
                            for (const btn of refreshBtns) {
                                if (btn.click) {
                                    btn.click();
                                    console.log('Clicked refresh button');
                                    return true;
                                }
                            }
                            
                            return false;
                        });
                        
                        if (refreshClicked) {
                            await delay(2000);
                            console.log('[captcha] 🔄 Captcha refreshed, will get new number for next attempt...');
                        }
                    } catch (refreshError) {
                        console.log('[captcha] ⚠️ Could not refresh captcha:', refreshError.message);
                    }
                }
            }
        }
        
        console.log('[captcha] ❌ ALL captcha solving attempts failed');
        throw new Error(`COMPLETE captcha solving failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
        
    } catch (error) {
        console.error('[captcha] ❌ Complete captcha handling error:', error.message);
        throw error;
    }
}
 
// Helper function to fill captcha input
async function fillCaptchaInput(page, captchaText, inputSelector) {
    try {
        const filled = await page.evaluate((text, selector) => {
            const input = document.querySelector(selector);
            if (input) {
                // Clear any existing value
                input.focus();
                input.value = '';
                
                // Set the new value
                input.value = text;
                
                // Trigger events
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
                
                input.blur();
                return true;
            }
            return false;
        }, captchaText, inputSelector);
        
        if (filled) {
            console.log(`[captcha] ✅ Captcha filled successfully: "${captchaText}"`);
            return true;
        } else {
            console.log('[captcha] ❌ Failed to fill captcha input');
            return false;
        }
    } catch (error) {
        console.log('[captcha] ❌ Error filling captcha input:', error.message);
        return false;
    }
}

// Enhanced form submission to find the Search button
// Replace the existing submitNCLTForm function with this enhanced version

// Enhanced form submission based on testform.js working logic
async function submitNCLTForm(page, searchParams) {
    try {
        console.log('[submit] Enhanced form submission with improved error handling...');
        
        const originalUrl = page.url();
        console.log(`📍 Original URL: ${originalUrl}`);
        
        // Set up navigation promise BEFORE clicking (from testform.js)
        const navigationPromise = page.waitForNavigation({
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 120000 // 2 minutes
        }).catch(navError => {
            console.log('⚠️ Navigation promise failed (this might be normal):', navError.message);
            return null;
        });
        
        // Enhanced search button detection - avoiding main site search
        console.log('🖱️ Finding and clicking submit button...');
        const submitResult = await page.evaluate(() => {
            // Priority 1: Case search form buttons (NOT site search)
            const formSelectors = [
                '#search-case-number-form button[type="submit"]',
                '#search-case-number-form input[type="submit"]',
                'form:not([action*="search/node"]) button[type="submit"]',
                'form:not([action*="search/node"]) input[type="submit"]',
                'form:not(.search-form) button[type="submit"]',
                'form:not(.search-form) input[type="submit"]'
            ];
            
            for (const selector of formSelectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) {
                    // Double check it's not the main site search
                    const isMainSearch = button.closest('.search-form') || 
                                        button.closest('#search-form') ||
                                        button.id === 'edit-submit';
                    
                    if (!isMainSearch) {
                        console.log(`Found case search button: ${selector}`);
                        button.click();
                        return { success: true, selector: selector, type: 'case-form' };
                    }
                }
            }
            
            // Priority 2: Generic submit buttons (but check context)
            const genericSelectors = [
                'input[value="Search"]:not(.search-form input)',
                'button[type="submit"]:not(.search-form button)',
                'input[type="submit"]:not(.search-form input)'
            ];
            
            for (const selector of genericSelectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) {
                    const isMainSearch = button.closest('.search-form') || 
                                        button.closest('#search-form') ||
                                        button.id === 'edit-submit';
                    
                    if (!isMainSearch) {
                        console.log(`Found generic button: ${selector}`);
                        button.click();
                        return { success: true, selector: selector, type: 'generic' };
                    }
                }
            }
            
            // Priority 3: JavaScript form submission
            const forms = document.querySelectorAll('form');
            for (const form of forms) {
                // Skip main site search forms
                if (form.classList.contains('search-form') || 
                    form.id === 'search-form' ||
                    form.action.includes('search/node')) {
                    continue;
                }
                
                // Look for case search form indicators
                const hasCapcha = form.querySelector('input[name*="captcha"]');
                const hasCaseFields = form.querySelector('select[name="bench"]') || 
                                     form.querySelector('select[name="case_type"]') ||
                                     form.querySelector('input[name="cp_no"]');
                
                if (hasCapcha || hasCaseFields) {
                    console.log('Submitting case search form via JavaScript');
                    form.submit();
                    return { success: true, selector: 'form.submit()', type: 'javascript' };
                }
            }
            
            return { success: false, error: 'No valid submit button found' };
        });
        
        if (!submitResult.success) {
            console.log('❌ Could not find or click submit button');
            return { success: false, error: 'Submit button not found' };
        }
        
        console.log(`✅ Submit button clicked successfully (${submitResult.selector})`);
        
        // Wait for navigation (from testform.js approach)
        try {
            console.log('⏳ Waiting for navigation to complete...');
            const navResult = await navigationPromise;
            if (navResult) {
                console.log('✅ Navigation promise resolved');
            } else {
                console.log('⚠️ Navigation promise returned null, but continuing...');
            }
        } catch (navError) {
            console.log('⚠️ Navigation promise failed (this might be normal):', navError.message);
        }
        
        // Extended wait for page to settle (from testform.js)
        await page.waitForTimeout(15000);
        
        const finalUrl = page.url();
        console.log(`📍 Current URL after submission: ${finalUrl}`);
        
        // Enhanced validation (from testform.js logic)
        const pageAnalysis = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasTable: document.querySelectorAll('table').length > 0,
                tableCount: document.querySelectorAll('table').length,
                bodyLength: document.body ? document.body.textContent.length : 0,
                hasResultsContent: document.body ? (
                    document.body.textContent.toLowerCase().includes('filing') ||
                    document.body.textContent.toLowerCase().includes('case') ||
                    document.body.textContent.toLowerCase().includes('petitioner') ||
                    document.body.textContent.toLowerCase().includes('order')
                ) : false,
                hasErrorMessage: document.body ? (
                    document.body.textContent.toLowerCase().includes('no record found') ||
                    document.body.textContent.toLowerCase().includes('error')
                ) : false
            };
        });
        
        console.log('📊 Page analysis after submission:', pageAnalysis);
        
        // Check if we ended up on wrong page (main site search)
        if (finalUrl.includes('search/node')) {
            console.log('❌ Redirected to main site search instead of case search');
            return { success: false, error: 'Wrong search page - main site search instead of case search' };
        }
        
        // Enhanced success criteria (from testform.js)
        const urlChanged = finalUrl !== originalUrl;
        const hasResults = pageAnalysis.hasTable || pageAnalysis.hasResultsContent;
        const isResultsPage = finalUrl.includes('order-cp-wise-search') || 
                             finalUrl.includes('case-details') ||
                             urlChanged;
        
        console.log('🔍 Enhanced success criteria check:');
        console.log(`  📍 URL changed: ${urlChanged}`);
        console.log(`  🔗 On results page: ${isResultsPage}`);
        console.log(`  📊 Has results content: ${pageAnalysis.hasResultsContent}`);
        console.log(`  ❌ Has error: ${pageAnalysis.hasErrorMessage}`);
        
        if (pageAnalysis.hasErrorMessage && !hasResults) {
            console.log('❌ Error detected with no results');
            return { success: false, error: 'Error on results page with no data' };
        }
        
        if (hasResults || isResultsPage || urlChanged) {
            console.log('✅ Successfully submitted form and detected results page');
            return { success: true, url: finalUrl };
        } else {
            console.log('⚠️ Uncertain success state, but continuing');
            return { success: true, url: finalUrl, warning: 'Success uncertain' };
        }
        
    } catch (error) {
        console.error('[submit] ❌ Form submission failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ...existing code...

// Check for results (ENHANCED FROM TESTFORM.JS)
 // Replace the existing checkForResults function
// Replace your debugResultsPage function with this enhanced version

async function debugResultsPage(page) {
    console.log('🔍 Comprehensive page debugging...');
    
    try {
        const pageDebug = await page.evaluate(() => {
            // Get the actual rendered content
            const bodyElement = document.body;
            const fullText = bodyElement ? bodyElement.textContent : 'No body element';
            
            return {
                url: window.location.href,
                title: document.title,
                hasBody: !!document.body,
                bodyExists: !!bodyElement,
                fullBodyText: fullText.substring(0, 3000), // First 3000 chars
                bodyHTML: bodyElement ? bodyElement.innerHTML.substring(0, 3000) : 'No body HTML',
                
                // Check for specific content
                hasFormElements: document.querySelectorAll('form, input, select').length,
                hasTableElements: document.querySelectorAll('table').length,
                hasDivElements: document.querySelectorAll('div').length,
                
                // Look for specific text indicators
                containsCaptchaError: fullText.toLowerCase().includes('captcha') || fullText.toLowerCase().includes('wrong'),
                containsNoRecords: fullText.toLowerCase().includes('no record') || fullText.toLowerCase().includes('not found'),
                containsCaseInfo: fullText.toLowerCase().includes('filing') || fullText.toLowerCase().includes('case number'),
                containsResultsKeywords: fullText.toLowerCase().includes('petitioner') || fullText.toLowerCase().includes('respondent'),
                
                // Check page state
                readyState: document.readyState,
                hasScripts: document.querySelectorAll('script').length,
                
                // Look for error messages
                errorMessages: Array.from(document.querySelectorAll('.error, .alert, .message')).map(el => el.textContent.trim()),
                
                // Check for loading indicators
                hasLoadingElements: document.querySelectorAll('.loading, .spinner, [class*="load"]').length
            };
        });
        
        console.log('📊 Comprehensive Page Debug:');
        console.log('  URL:', pageDebug.url);
        console.log('  Title:', pageDebug.title);
        console.log('  Has Body:', pageDebug.hasBody);
        console.log('  Ready State:', pageDebug.readyState);
        console.log('  Form Elements:', pageDebug.hasFormElements);
        console.log('  Table Elements:', pageDebug.hasTableElements);
        console.log('  Div Elements:', pageDebug.hasDivElements);
        console.log('  Scripts:', pageDebug.hasScripts);
        console.log('  Loading Elements:', pageDebug.hasLoadingElements);
        console.log('  Error Messages:', pageDebug.errorMessages);
        console.log('');
        console.log('🔍 Content Analysis:');
        console.log('  Contains Captcha Error:', pageDebug.containsCaptchaError);
        console.log('  Contains No Records:', pageDebug.containsNoRecords);
        console.log('  Contains Case Info:', pageDebug.containsCaseInfo);
        console.log('  Contains Results Keywords:', pageDebug.containsResultsKeywords);
        console.log('');
        console.log('📄 Full Body Text (first 3000 chars):');
        console.log(pageDebug.fullBodyText);
        console.log('');
        console.log('📄 Body HTML (first 3000 chars):');
        console.log(pageDebug.bodyHTML);
        
        return pageDebug;
        
    } catch (error) {
        console.error('❌ Comprehensive debug failed:', error.message);
        return null;
    }
}
  
 // Replace your checkForResults function with this enhanced version

async function checkForResults(page) {
    try {
        console.log('🔍 Enhanced results checking with comprehensive debugging...');
        
        await page.waitForTimeout(5000);
        
        const currentUrl = page.url();
        console.log(`[results] Current URL: ${currentUrl}`);
        
        // COMPREHENSIVE DEBUGGING
        const initialDebug = await debugResultsPage(page);
        
        // Check if we're seeing CSS/HTML head content instead of body
        if (initialDebug && (initialDebug.fullBodyText.includes('<link') || 
                            initialDebug.fullBodyText.includes('stylesheet') ||
                            !initialDebug.hasBody)) {
            console.log('⚠️ Detected incomplete page load - CSS/head content visible');
            
            // Try to force page completion
            console.log('🔄 Attempting to complete page load...');
            
            // Wait much longer for JavaScript
            await page.waitForTimeout(20000);
            
            // Try to trigger content load
            await page.evaluate(() => {
                // Scroll to trigger any lazy loading
                window.scrollTo(0, document.body.scrollHeight);
                
                // Try to trigger any form results
                const forms = document.querySelectorAll('form');
                forms.forEach(form => {
                    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                    if (submitBtn && !submitBtn.disabled) {
                        try {
                            submitBtn.click();
                        } catch (e) {}
                    }
                });
                
                // Wait for any async operations
                if (window.jQuery) {
                    jQuery(document).ready(function() {
                        console.log('jQuery ready triggered');
                    });
                }
                
                return true;
            });
            
            await page.waitForTimeout(15000);
            
            // Re-debug after fixes
            console.log('🔍 Re-debugging after page completion attempts...');
            await debugResultsPage(page);
        }
        
        // If still showing head content, try navigation refresh
        const finalCheck = await page.evaluate(() => {
            const bodyText = document.body ? document.body.textContent : '';
            return {
                stillShowingCSS: bodyText.includes('<link') || bodyText.includes('stylesheet'),
                hasActualContent: bodyText.length > 500 && !bodyText.includes('<link'),
                bodyTextSample: bodyText.substring(0, 500)
            };
        });
        
        if (finalCheck.stillShowingCSS && !finalCheck.hasActualContent) {
            console.log('❌ Page still showing CSS content - likely form submission failed');
            console.log('🔄 Attempting page refresh...');
            
            try {
                await page.reload({ waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 60000 });
                await page.waitForTimeout(10000);
                
                console.log('🔍 Post-refresh debugging...');
                await debugResultsPage(page);
            } catch (refreshError) {
                console.log('⚠️ Page refresh failed:', refreshError.message);
            }
        }
        
        // Enhanced content analysis
        const pageAnalysis = await page.evaluate(() => {
            const bodyText = document.body ? document.body.textContent.toLowerCase() : '';
            const tables = document.querySelectorAll('table');
            
            // Enhanced error detection
            const errorPatterns = [
                'no record found',
                'no records found', 
                'case not found',
                'invalid case number',
                'incorrect captcha',
                'captcha verification failed',
                'no data available',
                'wrong captcha',
                'captcha mismatch',
                'please enter correct captcha',
                'verification failed'
            ];
            
            // Enhanced success indicators
            const successPatterns = [
                'filing number',
                'filing no',
                'case details',
                'party name',
                'petitioner',
                'respondent',
                'listing date',
                'order',
                'judgment',
                'case no',
                'status',
                'c.p.',
                'cp(',
                'case number',
                'diary number',
                'serial number'
            ];
            
            const hasError = errorPatterns.some(pattern => bodyText.includes(pattern));
            const hasSuccess = successPatterns.some(pattern => bodyText.includes(pattern));
            
            // Check for case-specific tables
            let hasCaseTable = false;
            let caseTableInfo = [];
            
            tables.forEach((table, index) => {
                const tableText = table.textContent.toLowerCase();
                const tableInfo = {
                    index,
                    rows: table.querySelectorAll('tr').length,
                    hasFilingHeader: tableText.includes('filing'),
                    hasCaseHeader: tableText.includes('case'),
                    hasPetitionerHeader: tableText.includes('petitioner'),
                    hasStatusHeader: tableText.includes('status'),
                    hasSerialHeader: tableText.includes('s.no') || tableText.includes('serial'),
                    textSample: table.textContent.trim().substring(0, 300)
                };
                
                if (tableInfo.hasFilingHeader || tableInfo.hasCaseHeader || 
                    tableInfo.hasPetitionerHeader || tableInfo.hasStatusHeader ||
                    tableInfo.hasSerialHeader) {
                    hasCaseTable = true;
                    caseTableInfo.push(tableInfo);
                }
            });
            
            return {
                url: window.location.href,
                title: document.title,
                hasTable: tables.length > 0,
                tableCount: tables.length,
                hasCaseTable: hasCaseTable,
                caseTableInfo: caseTableInfo,
                bodyLength: bodyText.length,
                hasError: hasError,
                hasSuccess: hasSuccess,
                errorType: hasError ? errorPatterns.find(p => bodyText.includes(p)) : null,
                successType: hasSuccess ? successPatterns.find(p => bodyText.includes(p)) : null,
                hasResultsContent: hasSuccess || hasCaseTable || (bodyText.includes('case') && bodyText.length > 2000),
                captchaRelatedError: hasError && (bodyText.includes('captcha') || bodyText.includes('wrong') || bodyText.includes('incorrect') || bodyText.includes('verification')),
                showingCSSContent: bodyText.includes('<link') || bodyText.includes('stylesheet'),
                actualContentLength: bodyText.replace(/\s+/g, ' ').length
            };
        });
        
        console.log('📊 Final Enhanced Analysis:', {
            hasTable: pageAnalysis.hasTable,
            tableCount: pageAnalysis.tableCount,
            hasCaseTable: pageAnalysis.hasCaseTable,
            hasResultsContent: pageAnalysis.hasResultsContent,
            hasErrorMessage: pageAnalysis.hasError,
            captchaError: pageAnalysis.captchaRelatedError,
            showingCSS: pageAnalysis.showingCSSContent,
            contentLength: pageAnalysis.actualContentLength
        });
        
        if (pageAnalysis.caseTableInfo && pageAnalysis.caseTableInfo.length > 0) {
            console.log('📋 Case table details:');
            pageAnalysis.caseTableInfo.forEach(table => {
                console.log(`  Table ${table.index}: ${table.rows} rows`);
                console.log(`    Sample: "${table.textSample}"`);
            });
        }
        
        // Check for CSS/incomplete page
        if (pageAnalysis.showingCSSContent || pageAnalysis.actualContentLength < 100) {
            console.log('❌ Page showing CSS content or very short - form submission likely failed');
            return { 
                success: true, 
                hasResults: false, 
                error: 'Page showing CSS content instead of results - likely captcha failure',
                errorType: 'FORM_SUBMISSION_FAILED' 
            };
        }
        
        // Check for captcha-related errors
        if (pageAnalysis.captchaRelatedError) {
            console.log('❌ Captcha-related error detected - form submission failed');
            return { 
                success: true, 
                hasResults: false, 
                error: `Captcha error: ${pageAnalysis.errorType}`,
                errorType: 'CAPTCHA_FAILED' 
            };
        }
        
        // Enhanced result determination
        if (pageAnalysis.hasError && !pageAnalysis.hasSuccess && !pageAnalysis.hasCaseTable) {
            if (pageAnalysis.hasTable && pageAnalysis.tableCount > 0) {
                console.log('✅ Tables found despite error message, proceeding with extraction');
                return { success: true, hasResults: true, warning: 'Error detected but tables available' };
            } else {
                console.log('[result] No NCLT records found - case does not exist or form submission failed');
                return { 
                    success: true, 
                    hasResults: false, 
                    error: `Error detected: ${pageAnalysis.errorType}`,
                    errorType: pageAnalysis.captchaRelatedError ? 'CAPTCHA_FAILED' : 'NO_CASE_FOUND' 
                };
            }
        }
        
        if (pageAnalysis.hasCaseTable || pageAnalysis.hasSuccess || pageAnalysis.hasResultsContent) {
            console.log('✅ Case-specific results found');
            return { success: true, hasResults: true };
        }
        
        if (pageAnalysis.hasTable && pageAnalysis.bodyLength > 2000) {
            console.log('⚠️ General tables found with substantial content');
            return { success: true, hasResults: true, warning: 'General results detected' };
        }
        
        console.log('[result] No NCLT records found - likely form submission failed or case does not exist');
        return { 
            success: true, 
            hasResults: false, 
            errorType: 'NO_CASE_FOUND',
            message: 'No case records found - check form submission or case parameters'
        };
        
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
 // Replace the extractComprehensiveCaseDetails function with this FIXED version:

async function extractComprehensiveCaseDetails(page) {
    console.log('      📊 Extracting comprehensive case details with ENHANCED HTML parsing...');
    
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
            
            console.log('🔍 Starting HTML parsing for case details...');
            
            // ENHANCED: Look for the specific HTML table structure you showed
            const allTables = document.querySelectorAll('table');
            console.log(`Found ${allTables.length} tables on page`);
            
            allTables.forEach((table, tableIndex) => {
                console.log(`Processing table ${tableIndex + 1}...`);
                const rows = table.querySelectorAll('tr');
                
                // SPECIFIC PARSING for your HTML structure
                rows.forEach((row, rowIndex) => {
                    const cells = row.querySelectorAll('td');
                    
                    // Handle 2-cell rows (key-value pairs)
                    if (cells.length === 2) {
                        const key = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        
                        if (key && value && key.length < 200) {
                            const cleanKey = key.replace(/[:\s]+$/, '').trim();
                            details.basicCaseInfo[cleanKey] = value.trim();
                            console.log(`Extracted: "${cleanKey}" = "${value}"`);
                        }
                    }
                    
                    // Handle 4-cell rows (your specific structure)
                    else if (cells.length === 4) {
                        // First pair: cells[0] and cells[1]
                        const key1 = cells[0].textContent.trim();
                        const value1 = cells[1].textContent.trim();
                        
                        if (key1 && value1 && key1.length < 200) {
                            const cleanKey1 = key1.replace(/[:\s]+$/, '').trim();
                            details.basicCaseInfo[cleanKey1] = value1.trim();
                            console.log(`Extracted (4-cell): "${cleanKey1}" = "${value1}"`);
                        }
                        
                        // Second pair: cells[2] and cells[3]
                        const key2 = cells[2].textContent.trim();
                        const value2 = cells[3].textContent.trim();
                        
                        if (key2 && value2 && key2.length < 200) {
                            const cleanKey2 = key2.replace(/[:\s]+$/, '').trim();
                            details.basicCaseInfo[cleanKey2] = value2.trim();
                            console.log(`Extracted (4-cell): "${cleanKey2}" = "${value2}"`);
                        }
                    }
                    
                    // Handle rows with colspan (like Party Name row)
                    else if (cells.length === 3) {
                        const key = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim(); // This might have colspan="3"
                        
                        if (key && value && key.length < 200) {
                            const cleanKey = key.replace(/[:\s]+$/, '').trim();
                            details.basicCaseInfo[cleanKey] = value.trim();
                            console.log(`Extracted (3-cell): "${cleanKey}" = "${value}"`);
                        }
                    }
                });
                
                // Enhanced listing history processing
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
                                                url: linkHref,
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
            
            // Enhanced debug logging
            console.log('📊 Extraction Results:');
            console.log(`Basic Info Keys: ${Object.keys(details.basicCaseInfo).length}`);
            Object.keys(details.basicCaseInfo).forEach(key => {
                console.log(`  "${key}": "${details.basicCaseInfo[key]}"`);
            });
            console.log(`Listing History: ${details.listingHistory.length} entries`);
            console.log(`PDF Links: ${details.pdfLinks.length} links`);
            
            return details;
        });
        
        console.log(`      ✅ ENHANCED extraction completed: ${Object.keys(caseDetails.basicCaseInfo).length} basic fields, ${caseDetails.listingHistory.length} listing entries, ${caseDetails.pdfLinks.length} PDF links`);
        
        // Debug the extracted fields
        console.log('      🔍 Extracted Basic Case Info:');
        Object.keys(caseDetails.basicCaseInfo).forEach(key => {
            console.log(`      📋 "${key}": "${caseDetails.basicCaseInfo[key]}"`);
        });
        
        return caseDetails;
        
    } catch (error) {
        console.log(`      ❌ Failed to extract comprehensive details: ${error.message}`);
        return null;
    }
}
// Add this new function after your existing extractTableData function

// Comprehensive data extraction based on testform.js success patterns
async function extractCompleteNCLTData(page) {
    console.log('📊 Extracting Complete NCLT Data (testform.js pattern)...');
    
    try {
        await page.waitForTimeout(5000);
        
        const completeData = [];
        
        console.log('📋 Step 1: Extracting search results table...');
        const searchResults = await extractSearchResultsTable(page);
        
        if (searchResults && searchResults.length > 0) {
            console.log(`✅ Found ${searchResults.length} search result(s)`);
            
            for (let i = 0; i < searchResults.length; i++) {
                const result = searchResults[i];
                console.log(`🔍 Processing case ${i + 1}/${searchResults.length}...`);
                
                const statusLinks = result.rows[0]?.statusLinks || [];
                
                if (statusLinks.length > 0) {
                    console.log(`📎 Found ${statusLinks.length} status link(s)`);
                    
                    for (const statusLink of statusLinks) {
                        const detailedInfo = await extractDetailedCaseInfo(page, statusLink, result.rows[0]);
                        
                        const completeCase = {
                            searchResult: result,
                            detailedCaseInfo: detailedInfo,
                            extractedAt: new Date().toISOString()
                        };
                        
                        completeData.push(completeCase);
                        console.log(`✅ Complete case data extracted`);
                    }
                } else {
                    const basicCase = {
                        searchResult: result,
                        detailedCaseInfo: null,
                        extractedAt: new Date().toISOString(),
                        note: 'No status links found'
                    };
                    
                    completeData.push(basicCase);
                    console.log(`📋 Added basic search result`);
                }
            }
        } else {
            console.log('❌ No search results found');
        }
        
        return completeData;
        
    } catch (error) {
        console.error('❌ Complete extraction failed:', error.message);
        return null;
    }
}

// Enhanced search results table extraction (from testform.js)
async function extractSearchResultsTable(page) {
    console.log('📊 Extracting search results table (testform.js pattern)...');
    
    const results = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const extractedResults = [];
        
        tables.forEach((table, tableIndex) => {
            const rows = Array.from(table.querySelectorAll('tr'));
            
            if (rows.length > 1) {
                const headers = Array.from(rows[0].querySelectorAll('th, td')).map(cell => 
                    cell.textContent.trim()
                );
                
                // Check for case-related headers
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
                        
                        // Extract links
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
        console.log('✅ Search results extracted successfully');
        
        results.forEach(table => {
            console.log(`📊 Table ${table.tableIndex}: ${table.rowCount} rows, ${table.statusLinkCount} status links`);
        });
        
        return results;
    } else {
        console.log('❌ No search results extracted');
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
    extractCompleteNCLTData,
    extractSearchResults,
    extractDetailedCaseInfo,
    extractComprehensiveCaseDetails,
    debugResultsPage,
    // Legacy function stubs for compatibility
    extractTableDataEnhanced: extractTableData,
    selectBench: () => {},
    selectCaseType: () => {},
    selectYear: () => {},
    fillCPNumber: () => {},
    extractNCLTCaseData: () => {},
    extractSingleCaseDetails: () => {}
};