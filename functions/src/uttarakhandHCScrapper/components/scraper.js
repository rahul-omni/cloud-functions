const { wait, filterValidRows, processRows, transformRowData } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { uploadPDFToGCS } = require('./uploadpdf');
const { bulkInsertOrders, insertOrder, updateJudgmentUrl } = require('./database');
const { sendNotifications } = require('./notification');
const axios = require("axios");
const pdfParse = require("pdf-parse");

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
        await page.click('input[value="Go"]');
        await wait(3000);

        // Check for invalid captcha error
        console.log('[check] Checking for captcha error...');
        try {
            const errorDiv = await page.$('#errSpan');
            if (errorDiv) {
                const isVisible = await page.evaluate(el => el.style.display !== 'none', errorDiv);
                if (isVisible) {
                    continue;
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
    await page.waitForFunction(() => {
        return document.querySelectorAll(
            'table.order_table a[href*="display_pdf.php"]'
        ).length > 0;
    }, { timeout: 15000 });

    await wait(2000); // Extra wait to ensure table is fully loaded

    const results = await page.$$eval(
        'table.order_table tbody tr',
        rows => rows
            .slice(1) // skip header
            .map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 4) return null;

                const linkEl = row.querySelector(
                    'a[href*="display_pdf.php"]'
                );

                return {
                    orderNumber: cells[0]?.textContent.replace(/\s+/g, ' ').trim() || null,

                    orderOn: cells[1]?.textContent.replace(/\s+/g, ' ').trim() || null,

                    judge: cells[2]?.textContent.replace(/\s+/g, ' ').trim() || null,

                    orderDate: cells[3]?.textContent.replace(/\s+/g, ' ').trim() || null,

                    orderLink: linkEl?.getAttribute('href') || null
                };
            })
            .filter(Boolean)
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

    await page.waitForSelector(
    'a[onclick^="viewHistory("]',
    { visible: true }
    );

    await page.click('a[onclick^="viewHistory("]');

    // Extract table data
    const allRows = await extractTableData(page);
    
    console.log(`[filter] Filtered ${allRows.length}`, allRows);

    return
}

async function getCasesFromPDF(link) {
  try {
    console.log("[getCasesFromPDF] Downloading PDF:", link);

    const res = await axios.get(link, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const pdfBuffer = Buffer.from(res.data);

    console.log(
      "[getCasesFromPDF] PDF size (MB):",
      (pdfBuffer.length / 1024 / 1024).toFixed(2)
    );

    const pdfData = await pdfParse(pdfBuffer);
    const text = pdfData.text || "";

    // ✅ One regex for both formats
    const regex = /\b([A-Z]{2,15})\s*([\/-])\s*(\d{1,8})\s*\2\s*(\d{4})\b/g;

    const found = new Set();
    let match;

    while ((match = regex.exec(text)) !== null) {
      const caseType = match[1];
      const delimiter = match[2]; // "/" or "-"
      const caseNo = match[3];
      const year = match[4];

      found.add(`${caseType}${delimiter}${caseNo}${delimiter}${year}`);
    }

    const cases = [...found];
    console.log("[getCasesFromPDF] Total unique cases found:", cases.length);

    return cases;
  } catch (err) {
    console.error("[getCasesFromPDF] Error:", err.message);
    return [];
  }
}

module.exports = {
    handleCaptcha,
    checkNoRecords,
    extractTableData,
    processPDFUploads,
    scrapeData,
    processPDFAndInsertToDB,
    checkIfEntryExists,
    updateFilePath,
    getCasesFromPDF
}; 