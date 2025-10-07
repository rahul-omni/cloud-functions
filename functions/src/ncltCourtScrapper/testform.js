const puppeteer = require('puppeteer');
const browserModule = require('./components/browser');
const { navigateToNCLTPage, fillNCLTForm } = browserModule;

// Helper function to replace waitForTimeout
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Case type mapping - text to value
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

// Function to get available case types
function getAvailableCaseTypes() {
  const caseTypes = {};
  Object.keys(CASE_TYPE_MAPPING).forEach(key => {
    if (key === key.toLowerCase()) return; // Skip lowercase duplicates for display
    caseTypes[key] = CASE_TYPE_MAPPING[key];
  });
  return caseTypes;
}

// Function to get available benches
function getAvailableBenches() {
  const benches = {};
  Object.keys(BENCH_MAPPING).forEach(key => {
    if (key === key.toLowerCase()) return; // Skip lowercase duplicates for display
    benches[key] = BENCH_MAPPING[key];
  });
  return benches;
}

async function testRobustSubmissionWithStatusHandling(payload = null) {
  console.log('🔧 NCLT Robust Submission Test with Status Handling');
  console.log('==================================================');
  
  // Default payload if none provided (using text format)
  const defaultPayload = {
    bench: 'Mumbai',
    case_type: 'Company Petition IB (IBC)', 
    cp_no: '90',
    year: '2021'
  };
  
  // Use provided payload or default
  const inputPayload = payload || defaultPayload;
  
  console.log('📝 Input payload (text format):', inputPayload);
  
  // Convert text-based payload to value-based payload
  let searchParams;
  try {
    searchParams = convertPayloadTextToValues(inputPayload);
    console.log('🔄 Converted payload (value format):', searchParams);
  } catch (conversionError) {
    console.error('❌ Payload conversion failed:', conversionError.message);
    throw conversionError;
  }
  
  let browser = null;
  let page = null;
  
  try {
    browser = await puppeteer.launch({
      headless: false,
      slowMo: 500, // Reduced from 1000 for faster operation
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
        '--disable-images', // Faster loading
        '--no-zygote',
        '--single-process'
      ],
      defaultViewport: { width: 1366, height: 768 } // Set default viewport to prevent 0 width
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    // Increased timeouts and updated user agent
    await page.setDefaultNavigationTimeout(300000); // 5 minutes
    await page.setDefaultTimeout(300000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    console.log('✅ Browser created with enhanced settings and resource blocking');
    
    // Navigate with enhanced retry logic
    let navigationSuccess = false;
    for (let attempt = 1; attempt <= 5; attempt++) { // Increased attempts
      try {
        console.log(`\n🌐 Navigation attempt ${attempt}/5...`);
        
        // Clear any previous navigation state
        if (attempt > 1) {
          await page.goto('about:blank');
          await delay(3000);
        }
        
        // Navigate with multiple wait conditions
        const response = await page.goto('https://nclt.gov.in/order-cp-wise', {
          waitUntil: ['domcontentloaded', 'networkidle0'], // Wait for network to be idle
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
          const waitTime = Math.min(attempt * 15000, 60000); // Progressive delay up to 60s
          console.log(`🔄 Waiting ${waitTime/1000} seconds before retry...`);
          await delay(waitTime);
        }
      }
    }
    
    if (!navigationSuccess) {
      throw new Error('Failed to navigate to NCLT website after 5 attempts');
    }
    
    // Fill form with dynamic parameters
    console.log('\n📝 Filling form with converted parameters...');
    try {
      await fillNCLTForm(page, searchParams.bench, searchParams.case_type, searchParams.cp_no, searchParams.year);
      console.log('✅ Form filled successfully');
    } catch (fillError) {
      console.log('⚠️ Form filling failed, but continuing:', fillError.message);
      
      // Try manual form filling as fallback
      try {
        await page.select('select[name="bench"]', searchParams.bench);
        await page.select('select[name="case_type"]', searchParams.case_type);
        await page.type('input[name="cp_no"]', searchParams.cp_no);
        await page.type('input[name="year"]', searchParams.year);
        console.log('✅ Manual form filling completed');
      } catch (manualFillError) {
        console.log('❌ Manual form filling also failed:', manualFillError.message);
      }
    }
    
    console.log('\n🎯 Please fill the captcha manually and press ENTER...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
    
    console.log('\n🚀 Submitting form with improved error handling...');
    
    // Submit form with improved handling
    const navigationResult = await submitFormWithImprovedErrorHandling(page);
    
    if (navigationResult.success) {
      console.log('✅ Successfully submitted form and detected results page');
      
      // Extract data with comprehensive handling
      console.log('\n📊 Extracting complete case data with all PDF links...');
      const extractionResult = await extractCompleteNCLTData(navigationResult.page || page);
      
      if (extractionResult && extractionResult.length > 0) {
        console.log('🎉 SUCCESS! Complete data extracted successfully');
        
        // Save comprehensive data with search params in filename
        const fs = require('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `nclt-data-${searchParams.bench}-${searchParams.case_type}-${searchParams.cp_no}-${searchParams.year}-${timestamp}.json`;
        
        const result = {
          inputPayload: inputPayload, // Original text-based payload
          searchParameters: searchParams, // Converted value-based payload
          extractedAt: new Date().toISOString(),
          totalCases: extractionResult.length,
          data: extractionResult
        };
        
        fs.writeFileSync(filename, JSON.stringify(result, null, 2));
        console.log(`💾 Complete data saved to: ${filename}`);
        
        // Print summary
        printDataSummary(extractionResult);
        
        return result;
      } else {
        console.log('❌ No data extracted');
        return null;
      }
    } else {
      console.log('❌ Failed to reach results page:', navigationResult.error);
      return null;
    }
    
    // Keep browser open for inspection
    console.log('\n⏸️ Browser staying open for 60 seconds for inspection...');
    await delay(60000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Safe screenshot with comprehensive error handling
    if (page) {
      try {
        const viewport = await page.viewport();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
          await page.screenshot({ 
            path: 'test-error.png', 
            fullPage: true,
            captureBeyondViewport: false
          });
          console.log('📸 Error screenshot saved');
        } else {
          console.log('⚠️ Cannot take screenshot: invalid viewport');
        }
      } catch (screenshotError) {
        console.log('⚠️ Could not take error screenshot:', screenshotError.message);
      }
    }
    
    throw error; // Re-throw for caller to handle
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('✅ Browser closed');
      } catch (closeError) {
        console.log('⚠️ Error closing browser:', closeError.message);
      }
    }
  }
}

// Keep all the existing functions (submitFormWithImprovedErrorHandling, extractCompleteNCLTData, etc.)
// ... [Previous functions remain unchanged] ...

async function submitFormWithImprovedErrorHandling(page) {
  try {
    // Safe screenshot before submission
    try {
      const viewport = await page.viewport();
      if (viewport && viewport.width > 0 && viewport.height > 0) {
        await page.screenshot({ 
          path: 'before-submit.png', 
          fullPage: true,
          captureBeyondViewport: false
        });
        console.log('📸 Before-submit screenshot saved');
      }
    } catch (screenshotError) {
      console.log('⚠️ Could not take before-submit screenshot:', screenshotError.message);
    }
    
    console.log('🔄 Form submission with improved error handling...');
    
    // Store original URL
    const originalUrl = page.url();
    console.log(`📍 Original URL: ${originalUrl}`);
    
    // Set up navigation promise BEFORE clicking with increased timeout
    const navigationPromise = page.waitForNavigation({
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 120000 // 2 minutes for form submission
    }).catch(navError => {
      console.log('⚠️ Navigation promise failed (this might be normal):', navError.message);
      return null;
    });
    
    // Enhanced submit button detection and clicking
    console.log('🖱️ Finding and clicking submit button...');
    const submitResult = await page.evaluate(() => {
      const selectors = [
        '#search-case-number-form button[type="submit"]',
        '#search-case-number-form input[type="submit"]',
        'input[name="edit-submit"]',
        'button[type="submit"]',
        'input[type="submit"]',
        '.btn-primary',
        '[onclick*="submit"]'
      ];
      
      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button) {
          try {
            button.click();
            return { success: true, selector: selector };
          } catch (clickError) {
            console.log(`Failed to click ${selector}:`, clickError.message);
          }
        }
      }
      
      return { success: false, error: 'No submit button found' };
    });
    
    if (!submitResult.success) {
      console.log('❌ Could not find or click submit button');
      return { success: false, error: submitResult.error || 'Submit button not found or not clickable' };
    }
    
    console.log(`✅ Submit button clicked successfully (${submitResult.selector})`);
    
    // Wait for navigation with timeout handling
    console.log('⏳ Waiting for navigation to complete...');
    
    try {
      const navResult = await navigationPromise;
      if (navResult) {
        console.log('✅ Navigation promise resolved');
      } else {
        console.log('⚠️ Navigation promise returned null, but continuing...');
      }
    } catch (navError) {
      console.log('⚠️ Navigation wait failed, but continuing...');
    }
    
    // Extended wait for page to settle
    await delay(15000); // Increased from 8000
    
    // Enhanced page state analysis
    let currentUrl;
    let pageAnalysis;
    
    try {
      currentUrl = page.url();
      console.log(`📍 Current URL after submission: ${currentUrl}`);
      
      pageAnalysis = await page.evaluate(() => {
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
      
      console.log('📊 Page analysis after submission:', {
        url: pageAnalysis.url,
        title: pageAnalysis.title,
        hasTable: pageAnalysis.hasTable,
        tableCount: pageAnalysis.tableCount,
        bodyLength: pageAnalysis.bodyLength,
        hasResultsContent: pageAnalysis.hasResultsContent,
        hasErrorMessage: pageAnalysis.hasErrorMessage
      });
      
    } catch (analysisError) {
      console.log('❌ Page analysis failed:', analysisError.message);
      
      // Enhanced recovery with multiple attempts
      for (let recoveryAttempt = 1; recoveryAttempt <= 3; recoveryAttempt++) {
        try {
          console.log(`🔄 Recovery attempt ${recoveryAttempt}/3...`);
          await delay(10000);
          
          currentUrl = page.url();
          pageAnalysis = { 
            recovered: true, 
            url: currentUrl,
            recoveryAttempt: recoveryAttempt
          };
          
          console.log(`✅ Recovered page analysis - URL: ${currentUrl}`);
          break;
          
        } catch (recoveryError) {
          console.log(`❌ Recovery attempt ${recoveryAttempt} failed:`, recoveryError.message);
          
          if (recoveryAttempt === 3) {
            return { success: false, error: 'Page became unresponsive after submission' };
          }
        }
      }
    }
    
    // Safe screenshot after submission
    try {
      const viewport = await page.viewport();
      if (viewport && viewport.width > 0 && viewport.height > 0) {
        await page.screenshot({ 
          path: 'after-submit.png', 
          fullPage: true,
          captureBeyondViewport: false
        });
        console.log('📸 After-submit screenshot saved');
      }
    } catch (screenshotError) {
      console.log('⚠️ Could not take after-submit screenshot:', screenshotError.message);
    }
    
    // Enhanced success determination
    const urlChanged = currentUrl && currentUrl !== originalUrl;
    const isOnResultsPage = currentUrl && (
      currentUrl.includes('order-cp-wise-search') ||
      currentUrl.includes('search') ||
      currentUrl.includes('results') ||
      urlChanged
    );
    
    const hasResults = pageAnalysis && (
      pageAnalysis.hasTable ||
      pageAnalysis.hasResultsContent ||
      pageAnalysis.bodyLength > 2000
    );
    
    const hasError = pageAnalysis && pageAnalysis.hasErrorMessage;
    
    console.log('🔍 Enhanced success criteria check:');
    console.log(`  📍 URL changed: ${urlChanged}`);
    console.log(`  🔗 On results page: ${isOnResultsPage}`);
    console.log(`  📊 Has results content: ${hasResults}`);
    console.log(`  ❌ Has error: ${hasError}`);
    
    if (hasError) {
      console.log('⚠️ Error detected on page, but checking if results are still available...');
      console.log('Error context:', pageAnalysis.snippet ? pageAnalysis.snippet.substring(0, 300) : 'No snippet');
      
      if (pageAnalysis.hasTable && pageAnalysis.tableCount > 0) {
        console.log('✅ Tables found despite error message, proceeding with extraction');
        return { 
          success: true, 
          page: page, 
          url: currentUrl,
          analysis: pageAnalysis,
          warning: 'Error message detected but results available'
        };
      } else {
        return { success: false, error: 'Error message detected with no results' };
      }
    }
    
    if (isOnResultsPage || hasResults) {
      console.log('✅ Form submission appears successful');
      
      if (pageAnalysis && pageAnalysis.snippet) {
        console.log('📄 Page content preview:');
        console.log(pageAnalysis.snippet.substring(0, 500));
      }
      
      return { 
        success: true, 
        page: page, 
        url: currentUrl,
        analysis: pageAnalysis
      };
    } else {
      console.log('⚠️ Unclear submission status, attempting fallback navigation...');
      
      const fallbackResult = await attemptDirectResultsNavigation(page);
      
      if (fallbackResult.success) {
        return fallbackResult;
      }
      
      return { 
        success: true, 
        page: page, 
        url: currentUrl,
        warning: 'Uncertain success state - proceeding with extraction attempt',
        analysis: pageAnalysis
      };
    }
    
  } catch (error) {
    console.error('❌ Form submission failed with error:', error.message);
    
    try {
      const currentUrl = page.url();
      console.log(`📍 Error occurred, but page is still accessible at: ${currentUrl}`);
      
      await delay(10000);
      
      const pageContent = await page.evaluate(() => ({
        url: window.location.href,
        hasContent: document.body && document.body.textContent.length > 100,
        bodyLength: document.body ? document.body.textContent.length : 0
      }));
      
      if (pageContent.hasContent) {
        console.log('✅ Page still has content, treating as potentially successful');
        return { 
          success: true, 
          page: page, 
          url: pageContent.url,
          recovery: true,
          error: error.message
        };
      }
      
    } catch (recoveryError) {
      console.log('❌ Could not recover from error:', recoveryError.message);
    }
    
    return { success: false, error: error.message };
  }
}

async function extractCompleteNCLTData(page) {
  console.log('\n📊 Extracting Complete NCLT Data with All PDF Links...');
  
  try {
    await delay(5000);
    
    // Safe screenshot
    try {
      const viewport = await page.viewport();
      if (viewport && viewport.width > 0 && viewport.height > 0) {
        await page.screenshot({ 
          path: 'complete-extraction.png', 
          fullPage: true,
          captureBeyondViewport: false
        });
        console.log('📸 Complete extraction screenshot saved');
      }
    } catch (screenshotError) {
      console.log('⚠️ Could not take extraction screenshot:', screenshotError.message);
    }
    
    const completeData = [];
    
    console.log('📋 Step 1: Extracting search results table...');
    const searchResults = await extractSearchResultsTable(page);
    
    if (searchResults && searchResults.length > 0) {
      console.log(`✅ Found ${searchResults.length} search result(s)`);
      
      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i];
        console.log(`\n🔍 Processing case ${i + 1}/${searchResults.length}...`);
        
        const statusLinks = result.rows[0]?.statusLinks || [];
        
        if (statusLinks.length > 0) {
          console.log(`   📎 Found ${statusLinks.length} status link(s), extracting detailed information...`);
          
          for (const statusLink of statusLinks) {
            const detailedInfo = await extractDetailedCaseInfo(page, statusLink, result.rows[0]);
            
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
      
    } else {
      console.log('❌ No search results found');
    }
    
    return completeData;
    
  } catch (error) {
    console.error('❌ Complete extraction failed:', error.message);
    return null;
  }
}

async function extractSearchResultsTable(page) {
  console.log('📊 Extracting search results table...');
  
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
    console.log('\n🎉 SUCCESS! Extracted search results:');
    
    results.forEach(table => {
      console.log(`\n📊 Table ${table.tableIndex} (${table.rowCount} rows):`);
      console.log(`  📋 Headers: ${table.headers.join(' | ')}`);
      console.log(`  🔗 Status Links: ${table.statusLinkCount}`);
      console.log(`  🌐 Total Links: ${table.totalLinkCount}`);
      
      table.rows.slice(0, 3).forEach((row, index) => {
        const basicData = Object.entries(row.data).slice(0, 4);
        console.log(`  📄 Row ${index + 1}: ${basicData.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        
        if (row.statusLinks.length > 0) {
          console.log(`    🔗 Status Links: ${row.statusLinks.map(link => link.text).join(', ')}`);
        }
      });
    });
    
    return results;
    
  } else {
    console.log('❌ No search results extracted');
    return null;
  }
}

async function extractDetailedCaseInfo(page, statusLink, rowData) {
  try {
    console.log(`      🔧 Extracting detailed info via: ${statusLink.text}`);
    
    const originalUrl = page.url();
    
    if (statusLink.href && statusLink.href !== '#' && !statusLink.href.includes('javascript:')) {
      console.log(`      🌐 Navigating to: ${statusLink.href}`);
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`        🔄 Navigation attempt ${attempt}/2...`);
          
          await page.goto(statusLink.href, { 
            waitUntil: ['domcontentloaded', 'networkidle2'], 
            timeout: 300000 // 5 minutes
          });
          
          console.log(`        ✅ Navigation successful!`);
          break;
          
        } catch (navError) {
          console.log(`        ❌ Navigation attempt ${attempt} failed: ${navError.message}`);
          
          if (attempt < 2) {
            await delay(10000);
          } else {
            return null;
          }
        }
      }
      
      await delay(5000);
      
      const caseDetails = await extractComprehensiveCaseDetails(page);
      
      // Safe screenshot
      try {
        const viewport = await page.viewport();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
          await page.screenshot({ 
            path: `case-details-${rowData.rowIndex}.png`, 
            fullPage: true,
            captureBeyondViewport: false
          });
          console.log(`      📸 Case details screenshot saved`);
        }
      } catch (screenshotError) {
        console.log(`      ⚠️ Could not take screenshot: ${screenshotError.message}`);
      }
      
      try {
        await page.goto(originalUrl, { 
          waitUntil: ['domcontentloaded', 'networkidle2'], 
          timeout: 300000 
        });
        await delay(3000);
        console.log(`      ✅ Successfully navigated back`);
      } catch (backError) {
        console.log(`      ❌ Back navigation failed: ${backError.message}`);
      }
      
      return caseDetails;
      
    } else {
      console.log(`      🔧 Attempting to construct case details URL...`);
      
      const constructedUrl = await page.evaluate((currentUrl) => {
        const params = new URLSearchParams(window.location.search);
        const bench = params.get('bench');
        
        const filingNoCell = document.querySelector('td:nth-child(2)');
        if (bench && filingNoCell) {
          const filingNo = filingNoCell.textContent.trim();
          const encodedFilingNo = btoa(filingNo);
          return `https://nclt.gov.in/case-details?bench=${bench}&filing_no=${encodedFilingNo}`;
        }
        
        return null;
      }, page.url());
      
      if (constructedUrl) {
        console.log(`      🌐 Constructed URL: ${constructedUrl}`);
        
        try {
          await page.goto(constructedUrl, { 
            waitUntil: ['domcontentloaded', 'networkidle2'], 
            timeout: 300000 
          });
          
          await delay(5000);
          
          const caseDetails = await extractComprehensiveCaseDetails(page);
          
          try {
            const viewport = await page.viewport();
            if (viewport && viewport.width > 0 && viewport.height > 0) {
              await page.screenshot({ 
                path: `case-details-constructed-${rowData.rowIndex}.png`, 
                fullPage: true,
                captureBeyondViewport: false
              });
            }
          } catch (screenshotError) {
            console.log(`      ⚠️ Could not take constructed screenshot: ${screenshotError.message}`);
          }
          
          await page.goto(originalUrl, { 
            waitUntil: ['domcontentloaded', 'networkidle2'], 
            timeout: 300000 
          });
          await delay(3000);
          
          return caseDetails;
          
        } catch (constructedError) {
          console.log(`      ❌ Constructed URL failed: ${constructedError.message}`);
          return null;
        }
      }
    }
    
    return null;
    
  } catch (error) {
    console.log(`      ❌ Failed to extract detailed info: ${error.message}`);
    return null;
  }
}

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
        allSections: [],
        expandableSections: []
      };
      
      console.log('Expanding all collapsible sections...');
      const expandButtons = document.querySelectorAll('button[data-toggle="collapse"], .btn[data-toggle="collapse"], [aria-expanded="false"]');
      expandButtons.forEach(button => {
        try {
          if (button.getAttribute('aria-expanded') === 'false') {
            button.click();
          }
        } catch (e) {
          console.log('Could not click expand button:', e);
        }
      });
      
      setTimeout(() => {}, 1000);
      
      console.log('Extracting basic case information...');
      const allTables = document.querySelectorAll('table');
      
      allTables.forEach((table, tableIndex) => {
        const rows = table.querySelectorAll('tr');
        
        const firstRow = rows[0];
        if (firstRow && firstRow.querySelectorAll('td, th').length === 2) {
          console.log(`Processing key-value table ${tableIndex + 1}...`);
          
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
              const key = cells[0].textContent.trim();
              const value = cells[1].textContent.trim();
              
              if (key && value && key.length < 200) {
                const cleanKey = key.replace(/[:\s]+$/, '').trim();
                const cleanValue = value.trim();
                
                details.basicCaseInfo[cleanKey] = cleanValue;
                console.log(`Extracted: ${cleanKey} = ${cleanValue}`);
              }
            }
          });
        }
        
        const tableInfo = {
          tableIndex: tableIndex + 1,
          headers: [],
          rows: [],
          sectionTitle: 'Unknown Section',
          containsPDFLinks: false,
          tableType: 'unknown'
        };
        
        let sectionTitle = 'Unknown Section';
        
        let prevElement = table.previousElementSibling;
        let searchDepth = 0;
        
        while (prevElement && searchDepth < 5) {
          const prevText = prevElement.textContent.trim();
          
          if (prevText && prevText.length > 0 && prevText.length < 200) {
            if (prevElement.tagName && prevElement.tagName.match(/H[1-6]/) || 
                prevElement.classList.contains('section-title') ||
                prevElement.classList.contains('panel-title') ||
                prevText.toLowerCase().includes('parties') ||
                prevText.toLowerCase().includes('listing') ||
                prevText.toLowerCase().includes('history') ||
                prevText.toLowerCase().includes('orders') ||
                prevText.toLowerCase().includes('ia/ma')) {
              sectionTitle = prevText;
              break;
            }
          }
          
          prevElement = prevElement.previousElementSibling;
          searchDepth++;
        }
        
        const parentPanel = table.closest('.panel, .card, .collapse');
        if (parentPanel) {
          const panelTitle = parentPanel.querySelector('.panel-title, .card-title, .panel-heading');
          if (panelTitle) {
            sectionTitle = panelTitle.textContent.trim();
          }
        }
        
        tableInfo.sectionTitle = sectionTitle;
        
        const headerRow = table.querySelector('tr');
        if (headerRow) {
          tableInfo.headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => 
            cell.textContent.trim()
          );
        }
        
        if (tableInfo.headers.length === 2 && tableInfo.headers.some(h => 
          h.toLowerCase().includes('filing') || 
          h.toLowerCase().includes('case') || 
          h.toLowerCase().includes('party'))) {
          tableInfo.tableType = 'basic_info';
        } else if (tableInfo.headers.some(h => 
          h.toLowerCase().includes('party') || 
          h.toLowerCase().includes('name') || 
          h.toLowerCase().includes('type'))) {
          tableInfo.tableType = 'parties';
        } else if (tableInfo.headers.some(h => 
          h.toLowerCase().includes('date') || 
          h.toLowerCase().includes('listing') || 
          h.toLowerCase().includes('order') ||
          h.toLowerCase().includes('judgment'))) {
          tableInfo.tableType = 'listing_history';
        }
        
        const dataStartIndex = tableInfo.tableType === 'basic_info' ? 0 : 1;
        const dataRows = Array.from(table.querySelectorAll('tr')).slice(dataStartIndex);
        
        tableInfo.rows = dataRows.map((row, rowIndex) => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          const rowData = { 
            rowIndex: rowIndex + 1, 
            data: {},
            pdfLinks: [],
            allLinks: []
          };
          
          cells.forEach((cell, cellIndex) => {
            const header = tableInfo.headers[cellIndex] || `Column_${cellIndex + 1}`;
            const cellText = cell.textContent.trim();
            rowData.data[header] = cellText;
            
            const links = cell.querySelectorAll('a');
            if (links.length > 0) {
              links.forEach(link => {
                const linkText = link.textContent.trim();
                const linkHref = link.href;
                
                const linkInfo = {
                  text: linkText,
                  href: linkHref,
                  cellHeader: header,
                  rowIndex: rowData.rowIndex,
                  isPDF: linkText.toLowerCase().includes('pdf') || 
                         linkText.toLowerCase().includes('view') ||
                         linkHref.toLowerCase().includes('pdf') ||
                         linkHref.toLowerCase().includes('gen_pdf'),
                  dateContext: cellText
                };
                
                rowData.allLinks.push(linkInfo);
                
                if (linkInfo.isPDF) {
                  rowData.pdfLinks.push(linkInfo);
                  details.pdfLinks.push({
                    ...linkInfo,
                    section: tableInfo.sectionTitle,
                    tableType: tableInfo.tableType,
                    rowData: rowData.data
                  });
                  tableInfo.containsPDFLinks = true;
                }
              });
            }
          });
          
          return rowData;
        }).filter(row => Object.keys(row.data).length > 1);
        
        if (tableInfo.rows.length > 0 || tableInfo.tableType === 'basic_info') {
          details.allSections.push(tableInfo);
          
          if (tableInfo.tableType === 'parties' || 
              tableInfo.sectionTitle.toLowerCase().includes('parties')) {
            details.allParties = tableInfo.rows;
          } else if (tableInfo.tableType === 'listing_history' || 
                     tableInfo.sectionTitle.toLowerCase().includes('listing') || 
                     tableInfo.sectionTitle.toLowerCase().includes('history') ||
                     tableInfo.sectionTitle.toLowerCase().includes('orders')) {
            details.listingHistory = tableInfo.rows;
          }
        }
      });
      
      console.log('Enhanced basic case info extraction...');
      
      const caseInfoPatterns = [
        { key: 'Filing Number', selectors: ['td:contains("Filing Number")', 'th:contains("Filing Number")'] },
        { key: 'Filing Date', selectors: ['td:contains("Filing Date")', 'th:contains("Filing Date")'] },
        { key: 'Case Number', selectors: ['td:contains("Case Number")', 'th:contains("Case Number")'] },
        { key: 'Case Status', selectors: ['td:contains("Case Status")', 'th:contains("Case Status")'] },
        { key: 'Party Name', selectors: ['td:contains("Party Name")', 'th:contains("Party Name")'] },
        { key: 'Petitioner Advocate(s)', selectors: ['td:contains("Petitioner Advocate")', 'th:contains("Petitioner Advocate")'] },
        { key: 'Respondent Advocate(s)', selectors: ['td:contains("Respondent Advocate")', 'th:contains("Respondent Advocate")'] },
        { key: 'Registered On', selectors: ['td:contains("Registered On")', 'th:contains("Registered On")'] },
        { key: 'Last Listed', selectors: ['td:contains("Last Listed")', 'th:contains("Last Listed")'] },
        { key: 'Next Listing Date', selectors: ['td:contains("Next Listing Date")', 'th:contains("Next Listing Date")'] }
      ];
      
      caseInfoPatterns.forEach(pattern => {
        if (!details.basicCaseInfo[pattern.key]) {
          const allCells = document.querySelectorAll('td, th');
          
          for (const cell of allCells) {
            const cellText = cell.textContent.trim();
            
            if (cellText.toLowerCase().includes(pattern.key.toLowerCase())) {
              let valueCell = cell.nextElementSibling;
              
              if (valueCell) {
                const value = valueCell.textContent.trim();
                if (value && value !== pattern.key) {
                  details.basicCaseInfo[pattern.key] = value;
                  console.log(`Pattern match: ${pattern.key} = ${value}`);
                  break;
                }
              }
              
              const row = cell.closest('tr');
              if (row) {
                const cells = row.querySelectorAll('td, th');
                if (cells.length === 2 && cells[0] === cell) {
                  const value = cells[1].textContent.trim();
                  if (value && value !== pattern.key) {
                    details.basicCaseInfo[pattern.key] = value;
                    console.log(`Row match: ${pattern.key} = ${value}`);
                    break;
                  }
                }
              }
            }
          }
        }
      });
      
      return details;
    });
    
    console.log('      ✅ Comprehensive extraction completed:');
    console.log(`        📋 Basic Info Fields: ${Object.keys(caseDetails.basicCaseInfo).length}`);
    console.log(`        👥 All Parties: ${caseDetails.allParties.length} entries`);
    console.log(`        📅 Listing History: ${caseDetails.listingHistory.length} entries`);
    console.log(`        📄 PDF Links: ${caseDetails.pdfLinks.length} found`);
    console.log(`        📊 Total Sections: ${caseDetails.allSections.length}`);
    
    console.log('        📝 Basic Case Information:');
    Object.entries(caseDetails.basicCaseInfo).forEach(([key, value]) => {
      console.log(`           ${key}: ${value}`);
    });
    
    if (caseDetails.pdfLinks.length > 0) {
      console.log(`        📄 PDF Documents with context:`);
      caseDetails.pdfLinks.slice(0, 10).forEach((pdf, index) => {
        const context = pdf.dateContext || pdf.rowData?.['Date of Listing'] || 'No date';
        console.log(`           ${index + 1}. ${pdf.text} (${context}) - ${pdf.section}`);
      });
    }
    
    return caseDetails;
    
  } catch (error) {
    console.log(`      ❌ Failed to extract comprehensive details: ${error.message}`);
    return null;
  }
}

function printDataSummary(completeData) {
  console.log('\n📊 COMPREHENSIVE EXTRACTION SUMMARY');
  console.log('===================================');
  
  completeData.forEach((caseData, index) => {
    console.log(`\n📁 Case ${index + 1}:`);
    
    if (caseData.searchResult && caseData.searchResult.rows.length > 0) {
      const searchRow = caseData.searchResult.rows[0].data;
      console.log(`   📄 Search Result - Filing No: ${searchRow['Filing No.'] || 'N/A'}`);
      console.log(`   🏛️ Search Result - Case No: ${searchRow['Case No'] || 'N/A'}`);
      console.log(`   ⚖️ Search Result - Status: ${searchRow['Status'] || 'N/A'}`);
    }
    
    if (caseData.detailedCaseInfo) {
      const details = caseData.detailedCaseInfo;
      
      console.log(`\n   📋 DETAILED CASE INFORMATION:`);
      console.log(`   ============================`);
      
      if (Object.keys(details.basicCaseInfo).length > 0) {
        console.log(`   📝 Basic Case Details:`);
        Object.entries(details.basicCaseInfo).forEach(([key, value]) => {
          console.log(`      • ${key}: ${value}`);
        });
      }
      
      console.log(`\n   📊 Section Summary:`);
      console.log(`      • All Parties: ${details.allParties.length} entries`);
      console.log(`      • Listing History: ${details.listingHistory.length} entries`);
      console.log(`      • PDF Documents: ${details.pdfLinks.length} files`);
      console.log(`      • Total Sections: ${details.allSections.length}`);
      
      if (details.allSections.length > 0) {
        console.log(`\n   📑 Section Details:`);
        details.allSections.forEach((section, sIndex) => {
          console.log(`      ${sIndex + 1}. ${section.sectionTitle} (${section.tableType})`);
          console.log(`         • Headers: ${section.headers.join(', ')}`);
          console.log(`         • Rows: ${section.rows.length}`);
          console.log(`         • PDF Links: ${section.containsPDFLinks ? 'Yes' : 'No'}`);
        });
      }
      
      if (details.pdfLinks.length > 0) {
        console.log(`\n   📄 PDF Documents (showing first 15):`);
        details.pdfLinks.slice(0, 15).forEach((pdf, pdfIndex) => {
          const dateInfo = pdf.dateContext || pdf.rowData?.['Date of Listing'] || 'No date';
          console.log(`      ${pdfIndex + 1}. ${dateInfo} - ${pdf.text}`);
          console.log(`         URL: ${pdf.href}`);
        });
        
        if (details.pdfLinks.length > 15) {
          console.log(`      ... and ${details.pdfLinks.length - 15} more PDF documents`);
        }
      }
    } else {
      console.log(`   ⚠️ ${caseData.note || 'No detailed information available'}`);
    }
  });
}

async function attemptDirectResultsNavigation(page) {
  console.log('\n🔄 Attempting direct navigation to results URL...');
  
  try {
    const encodeValue = (value) => Buffer.from(value.toString()).toString('base64');
    
    const params = new URLSearchParams();
    params.append('bench', encodeValue('mumbai'));
    params.append('case_type', encodeValue('16'));
    params.append('cp_no', encodeValue('90'));
    params.append('year', encodeValue('2021'));
    
    const resultsUrl = `https://nclt.gov.in/order-cp-wise-search?${params.toString()}`;
    console.log(`🌐 Constructed URL: ${resultsUrl}`);
    
    await page.goto(resultsUrl, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 300000
    });
    
    await delay(5000);
    
    const directNavAnalysis = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasTable: document.querySelectorAll('table').length > 0,
        tableCount: document.querySelectorAll('table').length,
        bodyLength: document.body ? document.body.textContent.length : 0,
        hasContent: document.body && document.body.textContent.length > 1000,
        snippet: document.body ? document.body.textContent.substring(0, 500) : 'No body'
      };
    });
    
    console.log('📊 Direct navigation result:', directNavAnalysis);
    
    if (directNavAnalysis.hasTable || directNavAnalysis.hasContent) {
      console.log('✅ Direct navigation successful');
      
      try {
        const viewport = await page.viewport();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
          await page.screenshot({ 
            path: 'direct-navigation-results.png', 
            fullPage: true,
            captureBeyondViewport: false
          });
        }
      } catch (screenshotError) {
        console.log('⚠️ Could not take direct navigation screenshot:', screenshotError.message);
      }
      
      return { success: true, page: page, url: page.url(), method: 'direct_navigation' };
    } else {
      console.log('❌ Direct navigation did not yield results');
      return { success: false, error: 'Direct navigation unsuccessful' };
    }
    
  } catch (directError) {
    console.log('❌ Direct navigation failed:', directError.message);
    return { success: false, error: directError.message };
  }
}

// Usage: Run with custom payload using text format
if (require.main === module) {
  // Example payloads using text format (user-friendly)
  const payload1 = {
    bench: 'Mumbai',  // Use text instead of value
    case_type: 'Company Petition IB (IBC)',  // Use text instead of value
    cp_no: '90',
    year: '2021'
  };
  const payload = {
    bench: 'Mumbai',  // Use text instead of value
    case_type:  'CP(AA) Merger and Amalgamation(Companies Act)',  // Use text instead of value
    cp_no: '146',
    year: '2022'
  };
  
  
  // Show available options
  console.log('\n📋 Available Case Types:');
  Object.entries(getAvailableCaseTypes()).forEach(([text, value]) => {
    console.log(`   • "${text}" → ${value}`);
  });
  
  console.log('\n🏛️ Available Benches:');
  Object.entries(getAvailableBenches()).forEach(([text, value]) => {
    console.log(`   • "${text}" → ${value}`);
  });
  
  testRobustSubmissionWithStatusHandling(payload)
    .then((result) => {
      if (result) {
        console.log('\n✅ Enhanced test completed successfully');
        console.log(`📊 Total cases extracted: ${result.totalCases}`);
      } else {
        console.log('\n⚠️ Test completed but no data was extracted');
      }
    })
    .catch(error => {
      console.error('\n❌ Enhanced test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { 
  testRobustSubmissionWithStatusHandling, 
  extractCompleteNCLTData,
  extractComprehensiveCaseDetails,
  convertPayloadTextToValues,
  getAvailableCaseTypes,
  getAvailableBenches,
  CASE_TYPE_MAPPING,
  BENCH_MAPPING
};
