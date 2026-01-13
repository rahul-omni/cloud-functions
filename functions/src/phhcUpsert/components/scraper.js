const { wait, transformRowData } = require('./utils');
const { insertOrder, updateJudgmentUrl, checkIfEntryExists, updateCaseDetails } = require('./database');
const { getCaseTypeCode } = require('./mapping');

// Extract case details from case detail page
async function extractCaseDetails(page, caseUrl) {
    console.log(`[extractCaseDetails] Navigating to case detail page: ${caseUrl}`);
    
    await page.goto(caseUrl, { waitUntil: 'networkidle2' });
    await wait(3000);
    
    const caseData = await page.evaluate(() => {
        const data = {};
        const table = document.querySelector('#table1');
        
        if (!table) {
            return null;
        }
        
        // Extract all table rows
        const rows = table.querySelectorAll('tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                const header = cells[0]?.textContent.trim();
                const value = cells[1]?.textContent.trim();
                
                if (header && value) {
                    // Map headers to data fields
                    if (header.includes('Diary Number')) {
                        data.DiaryNumber = value;
                    } else if (header.includes('Registration Date')) {
                        data.RegistrationDate = value;
                    } else if (header.includes('Category')) {
                        data.Category = value;
                    } else if (header.includes('Party Detail')) {
                        data.PartyDetail = value;
                    } else if (header.includes('District')) {
                        data.District = value;
                    } else if (header.includes('Advocate Name')) {
                        data.AdvocateName = value;
                    } else if (header.includes('Respondent Advocate Name')) {
                        data.RespondentAdvocateName = value;
                    } else if (header.includes('Status')) {
                        data.Status = value;
                    } else if (header.includes('Final Order Uploaded On')) {
                        data.FinalOrderUploadedOn = value;
                    }
                }
            }
        });
        
        // Extract case number from title
        const titleRow = table.querySelector('tr th.case_header');
        if (titleRow) {
            const titleText = titleRow.textContent.trim();
            const caseMatch = titleText.match(/Case\s+Details\s+For\s+Case\s+(.+)/i);
            if (caseMatch) {
                data.CaseNumber = caseMatch[1].trim();
            }
        }
        
        // Extract judgment links from "Judgment Details" table
        data.Judgments = [];
        
        // Find the "Judgment Details" section - look for the header row
        const allRows = table.querySelectorAll('tr');
        let inJudgmentSection = false;
        let foundHeaderRow = false;
        
        allRows.forEach(row => {
            // Check if this is the "Judgment Details" header row
            const headerCell = row.querySelector('th[colspan="4"]');
            if (headerCell && headerCell.textContent.includes('Judgment Details')) {
                inJudgmentSection = true;
                foundHeaderRow = true;
                return; // Skip header row
            }
            
            // If we're in the judgment section and this is a data row (class="alt")
            if (inJudgmentSection && row.classList.contains('alt')) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const orderDate = cells[0]?.textContent.trim();
                    const orderType = cells[1]?.textContent.trim(); // "Order and Case-ID" column
                    const bench = cells[2]?.textContent.trim();
                    const linkCell = cells[3]?.querySelector('a');
                    
                    if (linkCell) {
                        const onclick = linkCell.getAttribute('onclick');
                        if (onclick) {
                            // Extract URL from onclick: window.open('download_file.php?method=ENCODED&auth=...')
                            const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]\)/);
                            if (urlMatch) {
                                const relativeUrl = urlMatch[1];
                                const fullUrl = relativeUrl.startsWith('http') 
                                    ? relativeUrl 
                                    : `https://phhc.gov.in/${relativeUrl}`;
                                
                                data.Judgments.push({
                                    orderDate: orderDate,
                                    orderType: orderType,
                                    bench: bench,
                                    url: fullUrl,
                                    text: orderType || 'View Order'
                                });
                            }
                        }
                    }
                }
            }
            
            // Stop if we hit another section (like end_header)
            if (inJudgmentSection && row.querySelector('td.end_header')) {
                inJudgmentSection = false;
            }
        });
        
        // Also extract "View Judgement" link from top of page (if it exists and not already in judgments)
        const viewJudgmentLinks = table.querySelectorAll('a[onclick*="download_file.php"]');
        viewJudgmentLinks.forEach(viewJudgmentLink => {
            const onclick = viewJudgmentLink.getAttribute('onclick');
            if (onclick) {
                const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]\)/);
                if (urlMatch) {
                    const relativeUrl = urlMatch[1];
                    const fullUrl = relativeUrl.startsWith('http') 
                        ? relativeUrl 
                        : `https://phhc.gov.in/${relativeUrl}`;
                    
                    // Check if this URL is already in judgments
                    const alreadyExists = data.Judgments.some(j => j.url === fullUrl);
                    
                    // Add if not already in the judgment table (usually the top banner link)
                    if (!alreadyExists && !foundHeaderRow) {
                        data.Judgments.push({
                            orderDate: data.FinalOrderUploadedOn || '',
                            orderType: 'Final Order',
                            bench: data.Status?.match(/by\s+(.+)/i)?.[1] || '',
                            url: fullUrl,
                            text: 'View Judgement'
                        });
                    }
                }
            }
        });
        
        return data;
    });
    
    if (!caseData) {
        console.log(`[extractCaseDetails] No case data found for ${caseUrl}`);
        return null;
    }
    
    console.log(`[extractCaseDetails] Extracted case data:`, {
        caseNumber: caseData.CaseNumber,
        diaryNumber: caseData.DiaryNumber,
        judgmentsCount: caseData.Judgments?.length || 0
    });
    
    return caseData;
}

// Process case and insert to database
// originalCaseId: The database ID to update (if provided, we'll always update this record)
// originalDiaryNumber: Original diary number format (e.g., "4112/2025") to construct case number
// originalCaseType: Original case type (e.g., "CWP-:(CIVIL WRIT PETITION)") to construct case number
async function processCaseAndInsertToDB(caseData, cookies, dbClient, originalCaseId = null, originalDiaryNumber = null, originalCaseType = null) {
    if (!caseData || !caseData.DiaryNumber) {
        console.log('[processCaseAndInsertToDB] Invalid case data, skipping');
        return null;
    }
    
    // Use scraped case type, or fallback to original
    const caseType = caseData.CaseNumber?.split('-')[0] || (originalCaseType ? getCaseTypeCode(originalCaseType) : null);
    
    // Use scraped diary number for diary_number field
    // But use original diary number format to construct case number
    const scrapedDiaryNumber = caseData.DiaryNumber; // e.g., "10403443" from website
    const caseNumber = originalDiaryNumber && caseType 
        ? `${caseType}/${originalDiaryNumber}` // e.g., "CWP/4112/2025"
        : (caseType ? `${caseType}/${scrapedDiaryNumber}` : null);
    
    // Collect ALL judgments in the requested format
    const allOrders = [];
    if (caseData.Judgments && caseData.Judgments.length > 0) {
        console.log(`[processCaseAndInsertToDB] Found ${caseData.Judgments.length} judgment(s) to process`);
        
        for (const judgment of caseData.Judgments) {
            allOrders.push({
                gcsPath: judgment.url,
                judgmentDate: judgment.orderDate || '',
                bench: judgment.bench || '',
                Order_text: judgment.orderType || judgment.text || 'View Order'
            });
        }
    }
    
    console.log(`[processCaseAndInsertToDB] Collected ${allOrders.length} order(s)`);
    
    // Prepare order data with all judgment links
    let orderData = {
        SerialNumber: '',
        DiaryNumber: scrapedDiaryNumber,
        CaseNumber: caseNumber,
        JudgmentDate: caseData.Judgments?.[0]?.orderDate || caseData.FinalOrderUploadedOn || null,
        Bench: caseData.Judgments?.[0]?.bench || '',
        Order: {
            text: caseData.Judgments?.[0]?.text || 'View Order',
            href: caseData.Judgments?.[0]?.url || ''
        },
        PartyDetail: caseData.PartyDetail,
        AdvocateName: caseData.AdvocateName,
        District: caseData.District,
        case_type: caseType
    };
    
    // Transform data
    const transformedData = transformRowData(orderData, orderData.JudgmentDate);
    
    // Update judgment_url to use the new format with all orders (same as highCourtCasesUpsert)
    transformedData.judgment_url = { orders: allOrders };
    
    if (dbClient) {
        // If originalCaseId is provided, always use that ID to update
        if (originalCaseId) {
            console.log(`[processCaseAndInsertToDB] Using original case ID: ${originalCaseId} to update record`);
            
            // Get existing record by ID
            const existingEntry = await dbClient.query(
                'SELECT id, judgment_url FROM case_details WHERE id = $1',
                [originalCaseId]
            );
            
            if (existingEntry.rows.length > 0) {
                const existing = existingEntry.rows[0];
                console.log(`[processCaseAndInsertToDB] Found existing record (id: ${existing.id}), merging with new data...`);
                
                // Get existing URLs - handle both JSON string and array formats
                let existingUrls = existing.judgment_url || [];
                if (!Array.isArray(existingUrls)) {
                    try {
                        if (typeof existingUrls === 'string') {
                            existingUrls = JSON.parse(existingUrls);
                        } else if (existingUrls && typeof existingUrls === 'object') {
                            // If it's already an object with orders array
                            existingUrls = existingUrls.orders || existingUrls.urls || [];
                        } else {
                            existingUrls = [];
                        }
                    } catch (e) {
                        console.log(`[processCaseAndInsertToDB] Error parsing existing URLs, using empty array: ${e.message}`);
                        existingUrls = [];
                    }
                }
                
                // Merge new orders with existing ones (avoid duplicates by URL)
                const existingUrlsMap = new Map();
                existingUrls.forEach(url => {
                    const urlKey = typeof url === 'string' ? url : (url.gcsPath || url.url || '');
                    if (urlKey) {
                        existingUrlsMap.set(urlKey, url);
                    }
                });
                
                // Add new orders that don't exist
                allOrders.forEach(order => {
                    if (!existingUrlsMap.has(order.gcsPath)) {
                        existingUrlsMap.set(order.gcsPath, order);
                    }
                });
                
                // Convert back to array and wrap in { orders: [...] } format
                const mergedOrders = Array.from(existingUrlsMap.values());
                const mergedJudgmentUrl = { orders: mergedOrders };
                
                console.log(`[processCaseAndInsertToDB] Merged ${mergedOrders.length} order(s) (${allOrders.length} new, ${existingUrls.length} existing)`);
                
                // Update with merged orders in { orders: [...] } format
                await updateJudgmentUrl(dbClient, originalCaseId, mergedJudgmentUrl, 1);
                // Also update other case details (preserve original diary_number)
                await updateCaseDetails(dbClient, originalCaseId, transformedData, true);
                
                return [{ id: originalCaseId, caseData: { ...transformedData, judgment_url: mergedJudgmentUrl }, updated: true }];
            } else {
                console.log(`[processCaseAndInsertToDB] Original case ID not found, inserting new record...`);
                const insertedId = await insertOrder(dbClient, transformedData);
                console.log(`✅ [processCaseAndInsertToDB] Inserted case with id: ${insertedId}`);
                return [{ id: insertedId, caseData: transformedData, updated: false }];
            }
        } else {
            // No original ID - check if entry exists by diary number and case type
            const existingEntry = await checkIfEntryExists(
                dbClient,
                scrapedDiaryNumber,
                caseType,
                'High Court',
                'Chandigarh'
            );
            
            if (existingEntry) {
                // Entry exists - merge new orders with existing ones
                console.log(`[processCaseAndInsertToDB] Entry exists (id: ${existingEntry.id}), merging with new data...`);
                
                let existingUrls = existingEntry.judgment_url || [];
                if (!Array.isArray(existingUrls)) {
                    try {
                        if (typeof existingUrls === 'string') {
                            existingUrls = JSON.parse(existingUrls);
                        } else if (existingUrls && typeof existingUrls === 'object') {
                            existingUrls = existingUrls.orders || existingUrls.urls || [];
                        } else {
                            existingUrls = [];
                        }
                    } catch {
                        existingUrls = [];
                    }
                }
                
                // Merge new orders with existing ones (avoid duplicates by URL)
                const existingUrlsMap = new Map();
                existingUrls.forEach(url => {
                    const urlKey = typeof url === 'string' ? url : (url.gcsPath || url.url || '');
                    if (urlKey) {
                        existingUrlsMap.set(urlKey, url);
                    }
                });
                
                // Add new orders that don't exist
                allOrders.forEach(order => {
                    if (!existingUrlsMap.has(order.gcsPath)) {
                        existingUrlsMap.set(order.gcsPath, order);
                    }
                });
                
                // Convert back to array and wrap in { orders: [...] } format
                const mergedOrders = Array.from(existingUrlsMap.values());
                const mergedJudgmentUrl = { orders: mergedOrders };
                
                console.log(`[processCaseAndInsertToDB] Merged ${mergedOrders.length} order(s) (${allOrders.length} new, ${existingUrls.length} existing)`);
                
                // Update with merged orders in { orders: [...] } format
                await updateJudgmentUrl(dbClient, existingEntry.id, mergedJudgmentUrl, 1);
                
                return [{ id: existingEntry.id, caseData: { ...transformedData, judgment_url: mergedJudgmentUrl }, updated: true }];
            } else {
                // Entry doesn't exist - insert new record with all orders
                console.log(`[processCaseAndInsertToDB] New entry - inserting to database with ${allOrders.length} order(s)...`);
                const insertedId = await insertOrder(dbClient, transformedData);
                console.log(`✅ [processCaseAndInsertToDB] Inserted case with id: ${insertedId}`);
                return [{ id: insertedId, caseData: transformedData, updated: false }];
            }
        }
    } else {
        // No database connection - just return transformed data
        return [{ id: null, caseData: transformedData, updated: false }];
    }
}

module.exports = {
    extractCaseDetails,
    processCaseAndInsertToDB
};

