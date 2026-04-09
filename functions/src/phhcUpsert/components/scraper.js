const { wait, transformRowData } = require('./utils');
const { insertOrder, updateJudgmentUrl, checkIfEntryExists, updateCaseDetails } = require('./database');
const { getCaseTypeCode } = require('./mapping');

// Extract case details from case detail page or current search result page
async function extractCaseDetails(page, caseUrl, options = {}) {
    const skipNavigation = options.skipNavigation === true;

    if (!skipNavigation) {
        console.log(`[extractCaseDetails] Navigating to case detail page: ${caseUrl}`);
        await page.goto(caseUrl, { waitUntil: 'networkidle2', timeout: 120000 });
        await wait(3000);
    } else {
        console.log('[extractCaseDetails] Using current page (search result / SPA)');
        await wait(500);
    }

    const caseData = await page.evaluate(() => {
        const NEW_ORIGIN = 'https://new.phhc.gov.in';

        function parseCaseStatusDom() {
            const data = { Judgments: [] };

            const detailsHeading = Array.from(
                document.querySelectorAll('h6.topbar, h6.text-center.text-white')
            ).find((h) => /Case Details For Case/i.test(h.textContent || ''));

            if (!detailsHeading) return null;

            const titleMatch = detailsHeading.textContent.match(/Case Details For Case\s+(.+)/i);
            if (titleMatch) data.CaseNumber = titleMatch[1].trim();

            const section =
                detailsHeading.closest('.bg-white.rounded') ||
                detailsHeading.parentElement?.parentElement;
            const firstTable =
                section &&
                (section.querySelector('table.table.table-bordered') ||
                    section.querySelector('table.table-bordered'));
            if (firstTable) {
                firstTable.querySelectorAll('tbody tr').forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    for (let i = 0; i + 1 < cells.length; ) {
                        const strong = cells[i].querySelector('strong');
                        if (!strong) {
                            i++;
                            continue;
                        }
                        const label = strong.textContent.replace(/\s+/g, ' ').trim();
                        const value = (cells[i + 1].textContent || '').replace(/\s+/g, ' ').trim();
                        if (label.includes('Diary Number')) data.DiaryNumber = value;
                        else if (label.includes('Registration Date')) data.RegistrationDate = value;
                        else if (label.includes('Category')) data.Category = value;
                        else if (label.includes('Party Detail')) data.PartyDetail = value;
                        else if (label.includes('Respondent Advocate Name')) data.RespondentAdvocateName = value;
                        else if (label.includes('Advocate Name') && !label.includes('Respondent')) data.AdvocateName = value;
                        else if (label.includes('District')) data.District = value;
                        else if (label.includes('List Type')) data.ListType = value;
                        else if (label.includes('Status')) data.Status = value;
                        else if (label.includes('Final Order Uploaded On')) data.FinalOrderUploadedOn = value;
                        else if (label.includes('Next Date')) data.NextDate = value;
                        else if (label.includes('CNR')) data.CNR = value;
                        i += 2;
                    }
                });
            }

            const judgmentHeading = Array.from(
                document.querySelectorAll('h6.topbar, h6.text-center.text-white')
            ).find((h) => /Judgment Details/i.test(h.textContent || ''));

            if (judgmentHeading) {
                const parent = judgmentHeading.parentElement;
                const judgmentTable = parent && parent.querySelector('table.table-bordered');
                if (judgmentTable) {
                    judgmentTable.querySelectorAll('tbody tr').forEach((row) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 4) return;
                        const orderDate = cells[0].textContent.trim();
                        const orderType = cells[1].textContent.trim();
                        const bench = cells[2].textContent.trim();
                        const linkEl = cells[3].querySelector('a');
                        let url = '';
                        if (linkEl) {
                            const href = linkEl.getAttribute('href') || '';
                            const onclick = linkEl.getAttribute('onclick') || '';
                            if (href && href !== '#' && href !== '#!' && !href.startsWith('javascript:')) {
                                url = href.startsWith('http')
                                    ? href
                                    : NEW_ORIGIN + (href.startsWith('/') ? '' : '/') + href.replace(/^\//, '');
                            }
                            if (!url && onclick) {
                                const urlMatch =
                                    onclick.match(/window\.open\(['"]([^'"]+)['"]\)/) ||
                                    onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/) ||
                                    onclick.match(/https?:\/\/[^\s'")]+/);
                                if (urlMatch) url = urlMatch[1];
                            }
                        }
                        data.Judgments.push({
                            orderDate,
                            orderType,
                            bench,
                            url: url || '',
                            text: (linkEl && linkEl.textContent.trim()) || 'View Order'
                        });
                    });
                }
            }

            return data.DiaryNumber || data.CaseNumber || data.Judgments.length ? data : null;
        }

        function parseLegacyTable1() {
            const data = { Judgments: [] };
            const table = document.querySelector('#table1');
            if (!table) return null;

            table.querySelectorAll('tr').forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const header = cells[0] && cells[0].textContent.trim();
                    const value = cells[1] && cells[1].textContent.trim();
                    if (header && value) {
                        if (header.includes('Diary Number')) data.DiaryNumber = value;
                        else if (header.includes('Registration Date')) data.RegistrationDate = value;
                        else if (header.includes('Category')) data.Category = value;
                        else if (header.includes('Party Detail')) data.PartyDetail = value;
                        else if (header.includes('District')) data.District = value;
                        else if (header.includes('Advocate Name')) data.AdvocateName = value;
                        else if (header.includes('Respondent Advocate Name')) data.RespondentAdvocateName = value;
                        else if (header.includes('Status')) data.Status = value;
                        else if (header.includes('Final Order Uploaded On')) data.FinalOrderUploadedOn = value;
                    }
                }
            });

            const titleRow = table.querySelector('tr th.case_header');
            if (titleRow) {
                const titleText = titleRow.textContent.trim();
                const caseMatch = titleText.match(/Case\s+Details\s+For\s+Case\s+(.+)/i);
                if (caseMatch) data.CaseNumber = caseMatch[1].trim();
            }

            let inJudgmentSection = false;
            table.querySelectorAll('tr').forEach((row) => {
                const headerCell = row.querySelector('th[colspan="4"]');
                if (headerCell && headerCell.textContent.indexOf('Judgment Details') !== -1) {
                    inJudgmentSection = true;
                    return;
                }
                if (inJudgmentSection && row.classList.contains('alt')) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 4) {
                        const orderDate = cells[0].textContent.trim();
                        const orderType = cells[1].textContent.trim();
                        const bench = cells[2].textContent.trim();
                        const linkCell = cells[3].querySelector('a');
                        if (linkCell) {
                            const onclick = linkCell.getAttribute('onclick');
                            if (onclick) {
                                const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]\)/);
                                if (urlMatch) {
                                    const relativeUrl = urlMatch[1];
                                    const fullUrl = relativeUrl.startsWith('http')
                                        ? relativeUrl
                                        : 'https://phhc.gov.in/' + relativeUrl.replace(/^\//, '');
                                    data.Judgments.push({
                                        orderDate,
                                        orderType,
                                        bench,
                                        url: fullUrl,
                                        text: orderType || 'View Order'
                                    });
                                }
                            }
                        }
                    }
                }
                if (inJudgmentSection && row.querySelector('td.end_header')) {
                    inJudgmentSection = false;
                }
            });

            table.querySelectorAll('a[onclick*="download_file.php"]').forEach((viewJudgmentLink) => {
                const onclick = viewJudgmentLink.getAttribute('onclick');
                if (!onclick) return;
                const urlMatch = onclick.match(/window\.open\(['"]([^'"]+)['"]\)/);
                if (!urlMatch) return;
                const relativeUrl = urlMatch[1];
                const fullUrl = relativeUrl.startsWith('http')
                    ? relativeUrl
                    : 'https://phhc.gov.in/' + relativeUrl.replace(/^\//, '');
                const alreadyExists = data.Judgments.some(function (j) { return j.url === fullUrl; });
                if (!alreadyExists) {
                    var statusMatch = data.Status && data.Status.match(/by\s+(.+)/i);
                    data.Judgments.push({
                        orderDate: data.FinalOrderUploadedOn || '',
                        orderType: 'Final Order',
                        bench: statusMatch ? statusMatch[1] : '',
                        url: fullUrl,
                        text: 'View Judgement'
                    });
                }
            });

            return data.DiaryNumber || data.CaseNumber ? data : null;
        }

        return parseCaseStatusDom() || parseLegacyTable1();
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
async function processCaseAndInsertToDB(caseData, cookies, dbClient, originalCaseId = null, originalDiaryNumber = null, originalCaseType = null) {
    if (!caseData || !caseData.DiaryNumber) {
        console.log('[processCaseAndInsertToDB] Invalid case data, skipping');
        return null;
    }

    const caseType = caseData.CaseNumber?.split('-')[0] || (originalCaseType ? getCaseTypeCode(originalCaseType) : null);

    const scrapedDiaryNumber = caseData.DiaryNumber;
    const caseNumber = originalDiaryNumber && caseType
        ? `${caseType}/${originalDiaryNumber}`
        : (caseType ? `${caseType}/${scrapedDiaryNumber}` : null);

    const allOrders = [];
    if (caseData.Judgments && caseData.Judgments.length > 0) {
        console.log(`[processCaseAndInsertToDB] Found ${caseData.Judgments.length} judgment(s) to process`);

        for (const judgment of caseData.Judgments) {
            allOrders.push({
                gcsPath: judgment.url || '',
                judgmentDate: judgment.orderDate || '',
                bench: judgment.bench || '',
                Order_text: judgment.orderType || judgment.text || 'View Order'
            });
        }
    }

    console.log(`[processCaseAndInsertToDB] Collected ${allOrders.length} order(s)`);

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

    const transformedData = transformRowData(orderData, orderData.JudgmentDate);

    transformedData.judgment_url = { orders: allOrders };

    if (dbClient) {
        if (originalCaseId) {
            console.log(`[processCaseAndInsertToDB] Using original case ID: ${originalCaseId} to update record`);

            const existingEntry = await dbClient.query(
                'SELECT id, judgment_url FROM case_details WHERE id = $1',
                [originalCaseId]
            );

            if (existingEntry.rows.length > 0) {
                const existing = existingEntry.rows[0];
                console.log(`[processCaseAndInsertToDB] Found existing record (id: ${existing.id}), merging with new data...`);

                let existingUrls = existing.judgment_url || [];
                if (!Array.isArray(existingUrls)) {
                    try {
                        if (typeof existingUrls === 'string') {
                            existingUrls = JSON.parse(existingUrls);
                        } else if (existingUrls && typeof existingUrls === 'object') {
                            existingUrls = existingUrls.orders || existingUrls.urls || [];
                        } else {
                            existingUrls = [];
                        }
                    } catch (e) {
                        console.log(`[processCaseAndInsertToDB] Error parsing existing URLs, using empty array: ${e.message}`);
                        existingUrls = [];
                    }
                }

                const existingUrlsMap = new Map();
                existingUrls.forEach((url) => {
                    const urlKey = typeof url === 'string' ? url : (url.gcsPath || url.url || '');
                    if (urlKey) {
                        existingUrlsMap.set(urlKey, url);
                    }
                });

                allOrders.forEach((order) => {
                    if (order.gcsPath && !existingUrlsMap.has(order.gcsPath)) {
                        existingUrlsMap.set(order.gcsPath, order);
                    }
                });

                const mergedOrders = Array.from(existingUrlsMap.values());
                const mergedJudgmentUrl = { orders: mergedOrders };

                console.log(`[processCaseAndInsertToDB] Merged ${mergedOrders.length} order(s) (${allOrders.length} new, ${existingUrls.length} existing)`);

                await updateJudgmentUrl(dbClient, originalCaseId, mergedJudgmentUrl, 1);
                await updateCaseDetails(dbClient, originalCaseId, transformedData, true);

                return [{ id: originalCaseId, caseData: { ...transformedData, judgment_url: mergedJudgmentUrl }, updated: true }];
            } else {
                console.log(`[processCaseAndInsertToDB] Original case ID not found, inserting new record...`);
                const insertedId = await insertOrder(dbClient, transformedData);
                console.log(`✅ [processCaseAndInsertToDB] Inserted case with id: ${insertedId}`);
                return [{ id: insertedId, caseData: transformedData, updated: false }];
            }
        } else {
            const existingEntry = await checkIfEntryExists(
                dbClient,
                scrapedDiaryNumber,
                caseType,
                'High Court',
                'Chandigarh'
            );

            if (existingEntry) {
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

                const existingUrlsMap = new Map();
                existingUrls.forEach((url) => {
                    const urlKey = typeof url === 'string' ? url : (url.gcsPath || url.url || '');
                    if (urlKey) {
                        existingUrlsMap.set(urlKey, url);
                    }
                });

                allOrders.forEach((order) => {
                    if (order.gcsPath && !existingUrlsMap.has(order.gcsPath)) {
                        existingUrlsMap.set(order.gcsPath, order);
                    }
                });

                const mergedOrders = Array.from(existingUrlsMap.values());
                const mergedJudgmentUrl = { orders: mergedOrders };

                console.log(`[processCaseAndInsertToDB] Merged ${mergedOrders.length} order(s) (${allOrders.length} new, ${existingUrls.length} existing)`);

                await updateJudgmentUrl(dbClient, existingEntry.id, mergedJudgmentUrl, 1);

                return [{ id: existingEntry.id, caseData: { ...transformedData, judgment_url: mergedJudgmentUrl }, updated: true }];
            } else {
                console.log(`[processCaseAndInsertToDB] New entry - inserting to database with ${allOrders.length} order(s)...`);
                const insertedId = await insertOrder(dbClient, transformedData);
                console.log(`✅ [processCaseAndInsertToDB] Inserted case with id: ${insertedId}`);
                return [{ id: insertedId, caseData: transformedData, updated: false }];
            }
        }
    } else {
        return [{ id: null, caseData: transformedData, updated: false }];
    }
}

module.exports = {
    extractCaseDetails,
    processCaseAndInsertToDB
};
