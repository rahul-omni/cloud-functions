const { wait, filterValidRows, processRows, transformRowData } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { uploadPDFToGCS } = require('./uploadpdf');
const { bulkInsertOrders, insertOrder } = require('./database');

// Handle captcha solving with retries
async function handleCaptcha(page, captchaRetries = 3) {
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
}

// Check for no records found
async function checkNoRecords(page) {
    const noRecordsMessage = await page.$eval('#errSpan', el => {
        if (el && el.style.display !== 'none') {
            return el.textContent.trim();
        }
        return null;
    }).catch(() => null);

    if (noRecordsMessage && noRecordsMessage.includes('Record Not Found')) {
        console.log('ℹ️  No records found for the specified date range');
        return true;
    }
    return false;
}

// Extract data from results table
async function extractTableData(page) {
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

    return allRows;
}

// Process PDF uploads for judgments
async function processPDFUploads(processedRows, cookies, date) {
    console.log('🔄 [processPDFUploads] Processing orders: uploading PDFs...');
    
    let uploadedCount = 0;
    const processedResults = [];
    
    for (let i = 0; i < processedRows.length; i++) {
        const row = processedRows[i];
        console.log(`\n📋 [processPDFUploads] Processing order ${i + 1}/${processedRows.length}: ${row.DiaryNumber} (${row.case_type})`);
        
        try {
            // Upload PDF if it's a JUDGEMENT order
            if (row.Order && row.Order.href && row.Order.text === 'JUDGEMENT') {
                console.log(`📥 [processPDFUploads] Uploading PDF for JUDGEMENT order...`);
                
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds
                    const filename = `order_${date.replace(/-/g, '')}_${row.DiaryNumber.replace(/\//g, '_')}_${timestamp}.pdf`;
                    const gcsFilename = `high-court-judgement-pdf/${filename}`;
                    
                    const uploadResult = await uploadPDFToGCS(cookies, row.Order.href, gcsFilename);
                    
                    // Store only the filename (not the full GCS path)
                    row.Order.gcsPath = filename;
                    row.Order.signedUrl = uploadResult.signedUrl;
                    row.Order.signedUrlExpiresAt = uploadResult.signedUrlExpiresAt;
                    
                    console.log(`✅  PDF uploaded: ${filename}`);
                    uploadedCount++;
                    
                } catch (uploadError) {
                    console.error(`❌  PDF upload failed for ${row.DiaryNumber}:`, uploadError.message);
                    console.log(`[processPDFUploads] PDF upload failed. Continuing...`);
                    // Continue processing even if PDF upload fails
                }
                
            } else if (row.Order && row.Order.href && row.Order.text !== 'JUDGEMENT') {
                console.log(`⏭️  Skipping PDF upload (text: "${row.Order.text}")`);
            }
            
            // Transform the data to match the expected format for database insertion
            const transformedRow = transformRowData(row, date);
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
}

// Process PDF uploads and database insertions with proper checks
async function processPDFAndInsertToDB(processedRows, cookies, date, dbClient) {
    console.log('🔄 [processPDFAndInsertToDB] Processing orders: checking DB, uploading PDFs, and inserting...');
    
    let uploadedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    const processedResults = [];
    
    for (let i = 0; i < processedRows.length; i++) {
        const row = processedRows[i];
        console.log(`\n📋 [processPDFAndInsertToDB] Processing order ${i + 1}/${processedRows.length}: ${row.serialNumber}. ${row.DiaryNumber} (${row.judgmentDate})`);
        
        try {
            // Check if entry exists in database
            const existingEntry = await checkIfEntryExists(dbClient, row.DiaryNumber, row.case_type, row.JudgetmentDate);
            
            if (!existingEntry) {
                // Entry doesn't exist - insert new entry
                console.log(`📥 [processPDFAndInsertToDB] New entry - inserting to database...`);
                
                // Upload PDF if it's a JUDGEMENT order
                if (row.Order && row.Order.href && row.Order.text === 'JUDGEMENT') {
                    console.log(`📥 [processPDFAndInsertToDB] Uploading PDF for new JUDGEMENT order...`);
                    
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                        const filename = `order_${date.replace(/-/g, '')}_${row.DiaryNumber.replace(/\//g, '_')}_${timestamp}.pdf`;
                        const gcsFilename = `high-court-judgement-pdf/${filename}`;
                        
                        const uploadResult = await uploadPDFToGCS(cookies, row.Order.href, gcsFilename);
                        
                        // Store the filename for database
                        row.Order.gcsPath = filename;
                        row.Order.signedUrl = uploadResult.signedUrl;
                        row.Order.signedUrlExpiresAt = uploadResult.signedUrlExpiresAt;
                        
                        console.log(`✅ [processPDFAndInsertToDB] PDF uploaded: ${filename}`);
                        uploadedCount++;
                        
                    } catch (uploadError) {
                        console.error(`❌ [processPDFAndInsertToDB] PDF upload failed for ${row.DiaryNumber}:`, uploadError.message);
                        console.log(`[processPDFAndInsertToDB] PDF upload failed. Continuing...`);
                        // Continue without PDF path
                    }
                }
                
                // Insert new entry to database
                try {
                    const orderId = await insertOrder(dbClient, row);
                    console.log(`✅ [processPDFAndInsertToDB] New entry inserted: ${row.DiaryNumber} (ID: ${orderId})`);
                    insertedCount++;
                } catch (insertError) {
                    console.error(`❌ [processPDFAndInsertToDB] Database insert failed for ${row.DiaryNumber}:`, insertError.message);
                    console.log(`[processPDFAndInsertToDB] Database insert failed. Continuing...`);
                }
                
            } else {
                // Entry exists - check if PDF needs to be uploaded
                console.log(`📋 [processPDFAndInsertToDB] Entry exists in database (ID: ${existingEntry.id})`);
                
                if (row.Order && row.Order.href && row.Order.text === 'JUDGEMENT') {
                    // Check if PDF path exists in database
                    if (!existingEntry.file_path) {
                        console.log(`📥 [processPDFAndInsertToDB] Entry exists but no PDF path - uploading PDF...`);
                        
                        try {
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                            const filename = `order_${date.replace(/-/g, '')}_${row.DiaryNumber.replace(/\//g, '_')}_${timestamp}.pdf`;
                            const gcsFilename = `high-court-judgement-pdf/${filename}`;
                            
                            const uploadResult = await uploadPDFToGCS(cookies, row.Order.href, gcsFilename);
                            
                            // Update database with file path
                            await updateFilePath(dbClient, existingEntry.id, filename);
                            
                            console.log(`✅ [processPDFAndInsertToDB] PDF uploaded and path updated: ${filename}`);
                            uploadedCount++;
                            updatedCount++;
                            
                        } catch (uploadError) {
                            console.error(`❌ [processPDFAndInsertToDB] PDF upload failed for existing entry ${row.DiaryNumber}:`, uploadError.message);
                            console.log(`[processPDFAndInsertToDB] PDF upload failed. Continuing...`);
                        }
                    } else {
                        console.log(`⏭️ [processPDFAndInsertToDB] Entry exists with PDF path: ${existingEntry.file_path}`);
                    }
                } else {
                    console.log(`⏭️ [processPDFAndInsertToDB] Entry exists, no JUDGEMENT to upload`);
                }
            }
            
            // Transform the data for results
            const transformedRow = transformRowData(row, date);
            processedResults.push(transformedRow);
            
        } catch (error) {
            console.error(`❌  Error processing order ${row.DiaryNumber}:`, error.message);
            throw error;
            // Continue with next row
        }
    }
    
    console.log(`\n📊  Processing Summary:`);
    console.log(`   Total orders processed: ${processedRows.length}`);
    console.log(`   New entries inserted: ${insertedCount}`);
    console.log(`   PDFs uploaded: ${uploadedCount}`);
    console.log(`   Existing entries updated: ${updatedCount}`);
    console.log(`   Results ready: ${processedResults.length}`);

    return processedResults;
}

// Check if entry exists in database
async function checkIfEntryExists(dbClient, diaryNumber, caseType, judgmentDate) {
    if (!dbClient) return null;
    
    try {
        const query = `
            SELECT id, file_path 
            FROM case_management 
            WHERE diary_number = $1 AND case_type = $2 AND judgment_date = $3
            LIMIT 1
        `;
        
        const result = await dbClient.query(query, [diaryNumber, caseType, judgmentDate]);
        return result.rows.length > 0 ? result.rows[0] : null;
        
    } catch (error) {
        console.error('❌  Error checking if entry exists:', error.message);
        return null;
    }
}

// Update file path in database
async function updateFilePath(dbClient, entryId, filename) {
    if (!dbClient) return;
    
    try {
        const query = `
            UPDATE case_management 
            SET file_path = $1, updated_at = NOW()
            WHERE id = $2
        `;
        
        await dbClient.query(query, [filename, entryId]);
        console.log(`✅  File path updated for entry ID: ${entryId}`);
        
    } catch (error) {
        console.error('❌  Error updating file path:', error.message);
    }
}

// Main scraping function
async function scrapeData(page, date, dbClient) {
    // Handle captcha
    await handleCaptcha(page);
    
    // Check for no records
    const noRecords = await checkNoRecords(page);
    if (noRecords) {
        return [];
    }
    
    // Extract table data
    const allRows = await extractTableData(page);
    
    // Filter and process rows
    const rows = filterValidRows(allRows);
    const processedRows = processRows(rows);
    
    console.log(`[filter] Filtered ${allRows.length} total rows to ${processedRows.length} valid orders`);
    
    // Get cookies for PDF uploads
    const cookies = await page.cookies();

    console.log(`[processedRows]: ${JSON.stringify(processedRows)}`);
    
    // Process PDF uploads
    const processedResults = await processPDFAndInsertToDB(processedRows, cookies, date, dbClient);
    
    
    return {
        processedResults: processedResults
    };
}

module.exports = {
    handleCaptcha,
    checkNoRecords,
    extractTableData,
    processPDFUploads,
    scrapeData,
    processPDFAndInsertToDB,
    checkIfEntryExists,
    updateFilePath
}; 