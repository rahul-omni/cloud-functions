const { wait, filterValidRows, processRows, transformRowData } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { uploadPDFToGCS } = require('./uploadpdf');
const { bulkInsertOrders, insertOrder, updateJudgmentUrl } = require('./database');
const { sendNotifications } = require('./notification');

async function handleCaptcha(page, captchaRetries = 3) {
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);

        await page.waitForSelector('#captchacode', { visible: true });

        // Clear input
        await page.evaluate(() => {
            const input = document.querySelector('#captchacode');
            if (input) input.value = '';
        });

        // Wait for captcha canvas
        const canvasHandle = await page.waitForSelector(
            'canvas#captcha_div',
            { visible: true }
        );
        await wait(500);

        // Screenshot captcha (DO NOT use toDataURL)
        const captchaBuffer = await canvasHandle.screenshot({ type: 'png' });

        const rawAnswer = await solveCaptcha(captchaBuffer);
        const answer = (rawAnswer || '').replace(/\D/g, '');

        console.log('[captcha] OCR:', answer);

        if (!answer) {
            await page.click('canvas#captcha_div');
            await wait(1500);
            continue;
        }

        // Flag for this attempt only
        let invalidCaptcha = false;

        // 👇 listen for ONLY ONE dialog
        page.once('dialog', async dialog => {
            console.log('[alert]', dialog.message());
            invalidCaptcha = true;
        });

        // Submit
        await page.type('#captchacode', answer, { delay: 80 });
        await wait(300);
        await page.click('#go_btn');

        // Give time for dialog to appear (if wrong)
        await wait(2500);

        // ✅ No dialog → success
        if (!invalidCaptcha) {
            console.log('[success] Captcha accepted (no dialog)');
            return;
        }

        console.log('[retry] Invalid captcha');

        if (attempt < captchaRetries) {
            await page.click('canvas#captcha_div');
            await wait(2000);
        }
    }

    throw new Error('Captcha solving failed');
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
    // Wait until table rows exist
    await page.waitForFunction(() => {
        const rows = document.querySelectorAll('table.table-info tbody tr');
        return rows.length > 0;
    }, { timeout: 15000 });

    const results = await page.$$eval('table.table-info tbody tr', rows =>
        rows.map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return null;

            const viewLink = cells[4].querySelector('a');

            return {
                serialNo: cells[0].innerText.trim(),

                caseNumber: cells[1].innerText
                    .replace(/\s+/g, ' ')
                    .trim(),

                petitionerVsRespondent: cells[2].innerText.trim(),

                status: cells[3].innerText.trim(),

                viewOnClick: viewLink
                    ? viewLink.getAttribute('onclick')
                    : null
            };
        }).filter(Boolean)
    );
    return results;
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
            // Upload PDF if it has a link
            if (row.Order && row.Order.href) {
                console.log(`📥 [processPDFUploads] Uploading PDF for order (${row.Order.text})...`);
                
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds
                    const filename = `HCDEL_${String(row.DiaryNumber).replace(/[^\w]+/g, '_')}_${String(row.case_type || '').replace(/[^\w]+/g, '_')}_${String(row.JudgetmentDate || date || '').replace(/[^0-9]/g, '')}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.pdf`;
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
                
            } else {
                console.log(`⏭️  Skipping PDF upload (no PDF link available)`);
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
async function processPDFAndInsertToDB(processedRows, cookies, dbClient) {
    console.log('🔄 [processPDFAndInsertToDB] Processing orders: checking DB, uploading PDFs, and inserting...');
    
    let uploadedCount = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    const processedResults = {};
    
    for (let i = 0; i < processedRows.length; i++) {
        const row = processedRows[i];
        console.log(`\n📋 [processPDFAndInsertToDB] Processing order ${i + 1}/${processedRows.length}: ${row.serialNumber}. ${row.DiaryNumber} (${row.judgmentDate})`);
        
        try {
            // Check if entry exists in database
            const existingEntry = await checkIfEntryExists(dbClient, row.DiaryNumber, row.parsedDiaryNumber.case_type);

            // console.log("exists:", existingEntry);
            // console.log("row:", row);

            const sync_site = date == null ? 1 : 0;

            if (!existingEntry) {
                
                // Upload PDF if it has a link
                if (row.Order && row.Order.href) {
                    console.log(`📥 [processPDFAndInsertToDB] Uploading PDF for new order (${row.Order.text})...`);
                    
                    try {
                        const diarySanitized = String(row.DiaryNumber).replace(/[^\w]+/g, '_');
                        const judgmentDateSanitized = String(row.JudgmentDate || date || '').replace(/[^0-9]/g, '');        
                        const caseTypeSanitized = String(row.case_type || '').replace(/[^\w]+/g, '_');
                        const timePart = new Date().toISOString().slice(11, 19).replace(/:/g, '');
                        const filename = `HCDEL_${diarySanitized}_${caseTypeSanitized}_${judgmentDateSanitized}_${timePart}.pdf`;
                        const gcsFilename = `high-court-judgement-pdf/${filename}`;

                        try {
                            const uploadResult = await uploadPDFToGCS(cookies, row.Order.href, gcsFilename);
                            
                            // Store the filename for database
                            const order = {
                                gcsPath: uploadResult.gcsPath,
                                filename: uploadResult.filename,
                                judgmentDate: row.JudgmentDate || date
                            }
                            console.log("caseTypeSanitized:", caseTypeSanitized);
                            console.log(`✅ [processPDFAndInsertToDB] PDF uploaded: ${filename}`);
                            const orderData = {...transformRowData(row, date), Order: order };
    
                            // await insertOrder(dbClient, {...orderData,
                            //     judgment_url: {orders: [order]},
                            // });
                            uploadedCount++;
                        } catch (uploadError) {
                            console.log(`[processPDFAndInsertToDB] PDF upload failed. Continuing...`);
                        }

                    } catch (uploadError) {
                        console.error(`❌ [processPDFAndInsertToDB] PDF upload failed for ${row.DiaryNumber}:`, uploadError.message);
                        console.log(`[processPDFAndInsertToDB] PDF upload failed. Continuing...`);
                        // Continue without PDF path
                    }
                }  
            } else {
                // Entry exists - check if PDF needs to be uploaded                
                // if (row.Order && row.Order.href) {  
                //     try {
                //         const diarySanitized = String(row.DiaryNumber).replace(/[^\w]+/g, '_');
                //         const caseTypeSanitized = String(row.case_type || '').replace(/[^\w]+/g, '_');
                //         const judgmentDateSanitized = String(row.JudgetmentDate || date || '').replace(/[^0-9]/g, '');
                //         const timePart = new Date().toISOString().slice(11, 19).replace(/:/g, '');
                //         const filename = `HCDEL_${diarySanitized}_${caseTypeSanitized}_${judgmentDateSanitized}_${timePart}.pdf`;
                //         const gcsFilename = `high-court-judgement-pdf/${filename}`;
                        
                //         const uploadResult = await uploadPDFToGCS(cookies, row.Order.href, gcsFilename);

                //         console.log("uploadResultPDFUpload", uploadResult);

                //         let updatedOrder = existingEntry.judgment_url || { orders: [] };

                //         let existsInOrders = false;

                //         for (const order of updatedOrder.orders) {
                //             if (order.judgmentDate == row.JudgetmentDate) {
                //                 console.log(`ℹ️  PDF for judgment date ${date} already exists in database. Skipping update.`);
                //                 existsInOrders = true;
                //                 break;
                //             }
                //         }
                //         if (existsInOrders) {
                //             continue;
                //         }
                //         const order = {
                //             gcsPath: uploadResult.gcsPath,
                //             signedUrl: uploadResult.signedUrl,
                //             filename: uploadResult.filename,
                //             judgmentDate: row.JudgetmentDate || date,
                //         }
                //         updatedOrder = { orders: [...updatedOrder.orders, order] };
                //         console.log(`✅ [processPDFAndInsertToDB] PDF uploaded and path updated: ${filename}`);
                //         uploadedCount++;
                //         updatedCount++;
                //         await updateJudgmentUrl(dbClient, existingEntry.id, updatedOrder, sync_site);
                        
                //         // Send notifications after judgment URL is updated
                //         if(date !== null) {
                //             try {
                //                 // Get judgment URL - prefer signedUrl, fallback to original href, then gcsPath
                //                 const judgmentUrl = uploadResult.signedUrl || 'https://portal.vakeelassist.com/cases';
                                
                //                 if (!uploadResult.signedUrl) {
                //                     console.warn(`⚠️  [processPDFAndInsertToDB] Signed URL not available for ${row.DiaryNumber}, using fallback: ${judgmentUrl}`);
                //                 }
                                
                //                 // await sendNotifications(
                //                 //     dbClient,
                //                 //     row.DiaryNumber,
                //                 //     row.case_type,
                //                 //     "High Court",          // court name (matches case_details.court value)
                //                 //     row.city || null,      // city
                //                 //     null,                  // district (not available in scraped data)
                //                 //     row.JudgetmentDate || date,  // judgment date
                //                 //     judgmentUrl            // judgment URL
                //                 // );
                //                 console.log(`✅ [processPDFAndInsertToDB] Notifications sent for diary ${row.DiaryNumber}`);
                //             } catch (notificationError) {
                //                 console.error(`❌ [processPDFAndInsertToDB] Failed to send notifications for ${row.DiaryNumber}:`, notificationError.message);
                //                 // Don't throw - continue processing other entries even if notification fails
                //             }
                //         }
                //     } catch (uploadError) {
                //         console.error(`❌ [processPDFAndInsertToDB] PDF upload failed for existing entry ${row.DiaryNumber}:`, uploadError.message);
                //         console.log(`[processPDFAndInsertToDB] PDF upload failed. Continuing...`);
                //     }
                // } else {
                //     console.log(`⏭️ [processPDFAndInsertToDB] Entry exists, no PDF link to upload`);
                // }
            }
            
        } catch (error) {
            console.error(`❌  Error processing order ${row.DiaryNumber}:`, error.message);
            throw error;
        }
    }
    
    console.log(`\n📊  Processing Summary:`);
    console.log(`   Total orders processed: ${processedRows.length}`);
    console.log(`   New entries inserted: ${insertedCount}`);
    console.log(`   PDFs uploaded: ${uploadedCount}`);
    console.log(`   Existing entries updated: ${updatedCount}`);
    console.log(`   Results ready: ${processedRows.length}`);

    return processedRows;
}

// Check if entry exists in database
async function checkIfEntryExists(dbClient, diaryNumber, caseType) {
    console.log(`Checking if entry exists for Diary Number: ${diaryNumber}, Case Type: ${caseType}`);
    if (!dbClient) return null;
    
    try {
        const query = `
            SELECT id, file_path, judgment_url
            FROM case_details 
            WHERE diary_number = $1 AND case_type = $2 AND court = 'High Court'
            LIMIT 1
        `;
    
        const result = await dbClient.query(query, [diaryNumber, caseType]);
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
async function scrapeData(page, dbClient) {
    // Handle captcha
    await handleCaptcha(page);
    
    // Extract table data
    const allRows = await extractTableData(page);
    
    // console.log(`[filter] Filtered ${allRows.length} total rows to ${processedRows.length} valid orders`);

    await page.evaluate(() => {
        const link = document.querySelector('a.btn.btn-link');
        if (!link) throw new Error('View link not found');
        link.click();
    });

    await page.waitForSelector(
        'button[onclick^="viewOrderSheet"]',
        { visible: true, timeout: 15000 }
    );


    await page.evaluate(() => {
        const btn = document.querySelector(
            'button[onclick^="viewOrderSheet"]'
        );
        if (!btn) throw new Error('View Order Sheet button not found');
        btn.click();
    });

    await page.waitForSelector(
        'table.table-ordr tbody tr',
        { visible: true, timeout: 15000 }
    );

    const orders = await page.$$eval(
        'table.table-ordr tbody tr',
        rows => rows.map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return null;

            const link = cells[2].querySelector('a');

            return {
                judgementDate: cells[1].innerText.trim(),
                gcsPath: link ? link.href : null
            };
        }).filter(Boolean)
    );

    const judgementUrl = { orders: orders };
    const caseNo = allRows[0].caseNumber;
    const parties = allRows[0].petitionerVsRespondent;
    const processedResults = {
        caseNo: caseNo,
        parties: parties,
        judgment_url: judgementUrl
    };

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