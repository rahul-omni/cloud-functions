const functions = require('firebase-functions');
const puppeteer = require('puppeteer-core');
const axios = require('axios');
const chromium = require('chrome-aws-lambda');
const { downloadPDFToGCS } = require('./uploadpdf');

const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey;

if (!KEY) { 
    console.error('🔴  OPENAI_API_KEY missing'); 
    process.exit(1); 
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// Solve captcha using OpenAI Vision
async function solveCaptcha(buf) {
    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is a CAPTCHA image with exactly 6 alphanumeric characters (letters and numbers). The text may be distorted, rotated, or have noise. Look carefully at each character and provide ONLY the 6-character code. Ignore any background noise or lines. Focus on the main text characters. Reply with exactly 6 characters, no spaces or punctuation.'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 10,
            temperature: 0.1
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    const ans = r.data.choices[0].message.content.trim();
    
    if (!/^[a-zA-Z0-9]{6}$/.test(ans)) {
        console.log(`[captcha] Warning: GPT response "${ans}" doesn't match expected 6-character format`);
        const cleaned = ans.replace(/[^a-zA-Z0-9]/g, '');
        if (cleaned.length >= 5 && cleaned.length <= 7) {
            console.log(`[captcha] Using cleaned response: "${cleaned.substring(0, 6)}"`);
            return cleaned.substring(0, 6);
        }
        throw new Error('Non-alphanumeric answer or wrong length');
    }
    return ans;
}

// Function to destructure diary number
function destructureDiaryNumber(diaryNumber) {
    if (!diaryNumber || typeof diaryNumber !== 'string') {
        return {
            case_type: null,
            diary_number: null
        };
    }
    
    // Find the first occurrence of '/' to separate case type from diary number
    const firstSlashIndex = diaryNumber.indexOf('/');
    
    if (firstSlashIndex === -1) {
        // No slash found, treat entire string as diary number
        return {
            case_type: null,
            diary_number: diaryNumber
        };
    }
    
    const case_type = diaryNumber.substring(0, firstSlashIndex);
    const diary_number = diaryNumber.substring(firstSlashIndex + 1);
    
    return {
        case_type,
        diary_number
    };
}

// Main high court scraper function
const fetchHighCourtJudgments = async (date) => {
    console.log(`[start] [fetchHighCourtJudgments] Scraping high court judgments for: ${date}`);

    const browser = await puppeteer.launch({ 
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless
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

    // Dialog handler
    let modalHandled = false;
    page.on('dialog', async dialog => {
        console.log(`[modal] JS Alert says: ${dialog.message()}`);
        await wait(2000);
        await dialog.accept();
        modalHandled = true;
        console.log('[modal] JS Alert accepted');
    });

    try {
        console.log('[nav] Going to main page...');
        await page.goto('https://hcservices.ecourts.gov.in/hcservices/main.php', { waitUntil: 'networkidle2' });
        await wait(3000);

        console.log('[click] About to click Court Orders...');
        await page.click('#leftPaneMenuCO');
        console.log('[click] Clicked Court Orders. Waiting for modal...');
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

        // Wait for the element to appear
        console.log('[wait] Waiting for High Court dropdown...');
        await page.waitForSelector('#sess_state_code', { timeout: 30000 });
        await wait(3000);

        // Wait until 'High Court of Delhi' is present in the dropdown
        await page.waitForFunction(() => {
            const el = document.querySelector('#sess_state_code');
            if (!el) return false;
            return Array.from(el.options).some(o => o.textContent.includes('High Court of Delhi'));
        }, { timeout: 20000 });
        console.log('[debug] High Court of Delhi is now present in the dropdown.');

        // Print all available options for debugging
        const options = await page.$$eval('#sess_state_code option', opts => opts.map(o => ({value: o.value, text: o.textContent})));
        console.log('[debug] High Court dropdown options:', options);

        // Wait for the dropdown to be enabled
        await page.waitForFunction(() => {
            const el = document.querySelector('#sess_state_code');
            return el && !el.disabled;
        });
        console.log('[debug] High Court dropdown is enabled.');

        console.log('[select] Selecting High Court of Delhi...');
        let retries = 5;
        let selectedHighCourt;
        for (let i = 0; i < retries; i++) {
            await page.select('#sess_state_code', '26');
            await wait(1000);
            selectedHighCourt = await page.$eval('#sess_state_code', el => ({
                value: el.value,
                text: el.options[el.selectedIndex].textContent
            }));
            console.log(`[debug] Attempt ${i+1}: High Court selected value:`, selectedHighCourt.value, 'text:', selectedHighCourt.text);
            if (selectedHighCourt.value === '26') {
                break;
            }
        }
        if (selectedHighCourt.value !== '26') {
            console.error('[error] High Court of Delhi could NOT be selected after retries. Exiting.');
            throw new Error('High Court of Delhi could NOT be selected after retries');
        }
        await wait(3000);

        console.log('[wait] Waiting for Principal Bench at Delhi dropdown...');
        await page.waitForSelector('#court_complex_code option[value]');
        await wait(3000);

        // Print all available options for debugging
        const benchOptions = await page.$$eval('#court_complex_code option', opts => opts.map(o => ({value: o.value, text: o.textContent})));
        console.log('[debug] Principal Bench dropdown options:', benchOptions);

        // Find the value for 'Principal Bench at Delhi'
        const principalBench = benchOptions.find(o => o.text.toLowerCase().includes('principal bench at delhi'));
        if (!principalBench) {
            console.error('[error] Principal Bench at Delhi not found in dropdown options. Exiting.');
            throw new Error('Principal Bench at Delhi not found in dropdown options');
        }

        // Retry loop for selecting Principal Bench at Delhi
        let benchRetries = 5;
        let selectedBench;
        for (let i = 0; i < benchRetries; i++) {
            await page.select('#court_complex_code', principalBench.value);
            await wait(1000);
            selectedBench = await page.$eval('#court_complex_code', el => ({
                value: el.value,
                text: el.options[el.selectedIndex].textContent
            }));
            console.log(`[debug] Attempt ${i+1}: Principal Bench selected value:`, selectedBench.value, 'text:', selectedBench.text);
            if (selectedBench.value === principalBench.value) {
                break;
            }
        }
        if (selectedBench.value !== principalBench.value) {
            console.error('[error] Principal Bench at Delhi could NOT be selected after retries. Exiting.');
            throw new Error('Principal Bench at Delhi could NOT be selected after retries');
        }
        await wait(3000);

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

        // Retry captcha up to 3 times if invalid
        let captchaRetries = 3;
        let success = false;
        
        for (let attempt = 1; attempt <= captchaRetries; attempt++) {
            console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);
            
            // Wait for the captcha input to be visible
            await page.waitForSelector('input#captcha.captchaClass[name="captcha"]', { visible: true });

            // Clear the captcha field first (for retry attempts)
            if (attempt > 1) {
                await page.click('input#captcha.captchaClass[name="captcha"]', { clickCount: 3 });
                await page.keyboard.press('Delete');
                await wait(500);
            }

            // Get the captcha image directly from the page
            await wait(500);
            console.log('[captcha] Capturing captcha image from page...');
            
            const captchaImg = await page.$('img[alt="CAPTCHA Image"]');
            if (!captchaImg) {
                throw new Error('Captcha image not found');
            }
            
            // Take a screenshot of just the captcha element
            const captchaBuffer = await captchaImg.screenshot();
            
            const answer = await solveCaptcha(captchaBuffer);
            console.log('[captcha] GPT says:', answer);

            // Click and type the answer
            await page.click('input#captcha.captchaClass[name="captcha"]');
            await wait(500);
            await page.type('input#captcha.captchaClass[name="captcha"]', answer);
            console.log('[captcha] Typed captcha into the unique input#captcha.captchaClass[name="captcha"]');
            await wait(1000);

            console.log('[click] Clicking Go button...');
            await page.click('input.Gobtn');
            await wait(3000);

            // Check for invalid captcha error
            console.log('[check] Checking for captcha error...');
            try {
                const errorDiv = await page.$('#errSpan');
                if (errorDiv) {
                    const isVisible = await page.evaluate(el => el.style.display !== 'none', errorDiv);
                    if (isVisible) {
                        const errorText = await page.evaluate(el => el.textContent, errorDiv);
                        if (errorText.includes('Invalid Captcha')) {
                            console.log(`[retry] Invalid captcha detected: ${errorText.trim()}`);
                            if (attempt < captchaRetries) {
                                console.log('[retry] Refreshing captcha and trying again...');
                                // Refresh the captcha by clicking on it
                                try {
                                    await captchaImg.click();
                                    await wait(2000);
                                } catch (e) {
                                    console.log('[retry] Could not refresh captcha image, continuing...');
                                }
                                continue; // Go to next attempt
                            } else {
                                console.error('[error] All captcha attempts failed. Exiting.');
                                throw new Error('All captcha attempts failed');
                            }
                        }
                    }
                }
                
                // If we get here, no error was found - captcha was successful
                console.log('[success] Captcha accepted, proceeding...');
                success = true;
                break;
                
            } catch (error) {
                console.log('[check] Error checking for captcha error, assuming success');
                success = true;
                break;
            }
        }

        if (!success) {
            console.error('[error] Failed to solve captcha after 3 attempts. Exiting.');
            throw new Error('Failed to solve captcha after 3 attempts');
        }

        // Check if "Record Not Found" message is displayed
        const noRecordsMessage = await page.$eval('#errSpan', el => {
            if (el && el.style.display !== 'none') {
                return el.textContent.trim();
            }
            return null;
        }).catch(() => null);

        if (noRecordsMessage && noRecordsMessage.includes('Record Not Found')) {
            console.log('ℹ️  No records found for the specified date range');
            return [];
        }

        console.log('[wait] Waiting for results table...');
        
        await page.waitForSelector('#dispTable tbody tr', { timeout: 60000 });
        await wait(3000);

        console.log('[extract] Extracting rows from results table...');
        const allRows = await page.$$eval('#dispTable tbody tr', trs =>
            trs.map(tr => {
                const tds = Array.from(tr.querySelectorAll('td'));
                
                // Define the column mapping based on typical court order table structure
                const fieldNames = [
                    'SerialNumber',
                    'DiaryNumber', 
                    'JudgetmentDate',
                    'Order'
                ];
                
                const rowData = {};
                
                tds.forEach((td, index) => {
                    const fieldName = fieldNames[index] || `column_${index}`;
                    
                    // Check if this cell contains an ORDER link
                    const orderLink = td.querySelector('a[id="orderid"]');
                    if (orderLink) {
                        rowData[fieldName] = {
                            text: td.innerText.trim().replace(/\nopens in new window\s*/gi, ''),
                            href: orderLink.href
                        };
                    } else {
                        rowData[fieldName] = td.innerText.trim();
                    }
                });
                
                return rowData;
            })
        );

        // Filter out header rows (rows that contain "Principal Bench at Delhi" or similar header text)
        const rows = allRows.filter(row => {
            // Skip rows that are clearly headers
            if (row.SerialNumber && (
                row.SerialNumber.includes('Principal Bench at Delhi') ||
                row.SerialNumber.includes('Serial') ||
                row.SerialNumber.includes('S.No') ||
                row.SerialNumber.includes('Sr.') ||
                row.SerialNumber === '' ||
                row.SerialNumber === 'Principal Bench at Delhi'
            )) {
                return false;
            }
            
            // Skip rows that don't have proper order data
            if (!row.DiaryNumber || !row.JudgetmentDate) {
                return false;
            }
            
            return true;
        });

        // Destructure diary numbers and replace with parsed components
        const processedRows = rows.map(row => {
            const { case_type, diary_number } = destructureDiaryNumber(row.DiaryNumber);
            return {
                ...row,
                DiaryNumber: diary_number,  // Replace with parsed diary_number
                case_type: case_type,      // Add case_type as separate field
                parsedDiaryNumber: { case_type, diary_number } // Add parsedDiaryNumber for insertOrder
            };
        });

        console.log(`[filter] Filtered ${allRows.length} total rows to ${processedRows.length} valid orders`);
        
        // Process each row: upload PDFs for JUDGEMENT orders
        console.log('🔄  Processing orders: uploading PDFs...');
        
        const cookies = await page.cookies();
        let uploadedCount = 0;
        const processedResults = [];
        
        for (let i = 0; i < processedRows.length; i++) {
            const row = processedRows[i];
            console.log(`\n📋  Processing order ${i + 1}/${processedRows.length}: ${row.DiaryNumber} (${row.case_type})`);
            
            try {
                // Upload PDF if it's a JUDGEMENT order
                if (row.Order && row.Order.href && row.Order.text === 'JUDGEMENT') {
                    console.log(`📥  Uploading PDF for JUDGEMENT order...`);
                    
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds
                        const filename = `order_${date.replace(/-/g, '')}_${row.DiaryNumber.replace(/\//g, '_')}_${timestamp}.pdf`;
                        const gcsFilename = `high-court-judgement-pdf/${filename}`;
                        
                        const uploadResult = await downloadPDFToGCS(cookies, row.Order.href, gcsFilename);
                        
                        // Store only the filename (not the full GCS path)
                        row.Order.gcsPath = filename;
                        row.Order.signedUrl = uploadResult.signedUrl;
                        row.Order.signedUrlExpiresAt = uploadResult.signedUrlExpiresAt;
                        
                        console.log(`✅  PDF uploaded: ${filename}`);
                        uploadedCount++;
                        
                    } catch (uploadError) {
                        console.error(`❌  PDF upload failed for ${row.DiaryNumber}:`, uploadError.message);
                        // Continue processing even if PDF upload fails
                    }
                    
                } else if (row.Order && row.Order.href && row.Order.text !== 'JUDGEMENT') {
                    console.log(`⏭️  Skipping PDF upload (text: "${row.Order.text}")`);
                }
                
                // Transform the data to match the expected format for database insertion
                const transformedRow = {
                    "Serial Number": row.SerialNumber || '',
                    "Diary Number": row.DiaryNumber || '',
                    "Case Number": row.case_type ? `${row.case_type}/${row.DiaryNumber}` : '',
                    "Petitioner / Respondent": '', // Not available from high court scraping
                    "Petitioner/Respondent Advocate": '', // Not available from high court scraping
                    "Bench": "Principal Bench at Delhi",
                    "Judgment By": '', // Not available from high court scraping
                    "Judgment": row.Order?.text || '',
                    "judgmentLinks": row.Order?.href ? [{ text: row.Order.text, url: row.Order.href }] : [],
                    "file_path": row.Order?.gcsPath || '',
                    "insert_to_chromadb": false,
                    "case_type": row.case_type || '',
                    "city": "Delhi",
                    "district": "",
                    "judgment_type": row.Order?.text || "",
                    "date": new Date().toISOString(), // Required timestamp
                    "created_at": new Date().toISOString(), // Required timestamp
                    "updated_at": new Date().toISOString(), // Required timestamp
                    "court": "High Court", // Required field
                    "judgment_date": row.JudgetmentDate || '', // From scraping
                    "judgment_text": row.Order?.text ? [row.Order.text] : [], // Array type
                    "judgment_url": row.Order?.href ? [row.Order.href] : [] // Array type
                };
                
                processedResults.push(transformedRow);
                
            } catch (error) {
                console.error(`❌  Error processing order ${row.DiaryNumber}:`, error.message);
                // Continue with next row
            }
        }
        
        console.log(`\n📊  Processing Summary:`);
        console.log(`   Total orders processed: ${processedRows.length}`);
        console.log(`   PDFs uploaded: ${uploadedCount}`);
        console.log(`   Results ready for database: ${processedResults.length}`);

        return processedResults;

    } finally {
        await browser.close();
        console.log("[end] [fetchHighCourtJudgments] High Court Scraping completed successfully");
    }
};

module.exports = {
    fetchHighCourtJudgments
}; 