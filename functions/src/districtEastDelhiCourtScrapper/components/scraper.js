const { wait, filterValidRows, processCourtData, transformRowData, determineSearchType, transformToDatabaseSchema } = require('./utils');
const { solveCaptcha } = require('./captcha');
const { bulkInsertOrders } = require('./database');
const { navigateToOrderDatePage, navigateToCaseNumberPage, selectCourtComplex, setDateFields, setCaseNumberFields } = require('./browser');

// Helper function to decode base64 case data
function decodeBase64CaseData(dataAttr) {
    try {
        const decoded = Buffer.from(dataAttr, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        console.log('[decode] Failed to decode case data:', e.message);
        return null;
    }
}

// Extract case details from the detail page
async function extractCaseDetailPage(page) {
    return await page.evaluate(() => {
        const getTableData = (caption) => {
            const table = Array.from(document.querySelectorAll('.distTableContent table')).find(t => {
                const cap = t.querySelector('caption');
                return cap && cap.innerText.trim().toLowerCase() === caption.toLowerCase();
            });
            if (!table) return null;

            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                const obj = {};
                headers.forEach((header, index) => {
                    const cell = cells[index];
                    if (!cell) return;

                    // Get text content and clean it
                    const content = cell.querySelector('.bt-content');
                    const text = content ? content.textContent.trim() : cell.textContent.trim();
                    
                    // Check for links
                    const link = cell.querySelector('a');
                    if (link) {
                        obj[`${header}`] = text;
                        // Get both href and data attributes
                        if (link.href && !link.href.includes('javascript:void(0)')) {
                            obj[`${header} URL`] = link.href;
                        }
                        // Get case data if available
                        const caseData = link.getAttribute('data-case');
                        if (caseData) {
                            try {
                                const decodedData = JSON.parse(atob(caseData));
                                obj[`${header} Data`] = decodedData;
                            } catch (e) {
                                obj[`${header} Data`] = caseData;
                            }
                        }
                    } else {
                        obj[header] = text;
                    }
                });
                return obj;
            });
            return rows;
        };

        // Extract all sections
        const caseDetails = getTableData('Case Details')?.[0] || {};
        const caseStatus = getTableData('Case Status')?.[0] || {};
        const acts = getTableData('Acts') || [];
        const history = getTableData('Case History') || [];
        const orders = getTableData('Orders') || [];
        const finalOrders = getTableData('Final Order') || [];

        // Extract party information with advocates
        const parties = {
            petitioners: Array.from(document.querySelectorAll('.Petitioner ul li'))
                .map(li => {
                    const partyName = li.querySelector('p')?.textContent.trim();
                    const advocateName = Array.from(li.childNodes)
                        .filter(node => node.nodeType === 3) // Text nodes
                        .map(node => node.textContent.trim())
                        .filter(Boolean)
                        .join(' ');
                    return {
                        name: partyName,
                        advocate: advocateName
                    };
                })
                .filter(p => p.name),
            respondents: Array.from(document.querySelectorAll('.respondent ul li'))
                .map(li => {
                    const partyName = li.querySelector('p')?.textContent.trim();
                    const advocateName = Array.from(li.childNodes)
                        .filter(node => node.nodeType === 3)
                        .map(node => node.textContent.trim())
                        .filter(Boolean)
                        .join(' ');
                    return {
                        name: partyName,
                        advocate: advocateName
                    };
                })
                .filter(p => p.name)
        };

        // Get CNR number and other metadata from div attribute
        const cnrDiv = document.querySelector('#cnrResultsDetails');
        const cnrNumber = cnrDiv ? cnrDiv.getAttribute('data-cno') : '';

        // Get court name
        const courtNameEl = document.querySelector('#cnrResultsDetails h2');
        const courtName = courtNameEl ? courtNameEl.textContent.trim() : '';

        // Process all orders (both interim and final)
        const allOrders = [...orders, ...finalOrders].map(order => {
            const orderDetails = {
                order_number: order['Order Number'],
                order_date: order['Order Date'],
                order_type: order['Order Details']
            };

            // Add URL if available
            if (order['Order Details URL'] || order['Order Details']?.includes('href')) {
                const url = order['Order Details URL'] || 
                          (new DOMParser().parseFromString(order['Order Details'], 'text/html'))
                          .querySelector('a')?.href;
                if (url) {
                    orderDetails.order_url = url;
                }
            }

            return orderDetails;
        }).filter(o => o.order_number);

        // Format case details into a structured object
        console.log('\n[debug] Raw Case Details:', caseDetails);
        console.log('[debug] Raw Case Status:', caseStatus);
        console.log('[debug] Raw Acts:', acts);
        console.log('[debug] Raw Case History:', history);
        console.log('[debug] Raw Orders:', orders);
        console.log('[debug] Raw Final Orders:', finalOrders);
        
        const formattedCaseDetails = {
            court_name: courtName,
            cnr_number: cnrNumber,
            filing_info: {
                case_type: caseDetails['Case Type'],
                filing_number: caseDetails['Filing Number'],
                filing_date: caseDetails['Filing Date'],
                registration_number: caseDetails['Registration Number'],
                registration_date: caseDetails['Registration Date'],
                cnr_number: caseDetails['CNR Number']
            },
            status_info: {
                first_hearing_date: caseStatus['First Hearing Date'],
                decision_date: caseStatus['Decision Date'],
                case_status: caseStatus['Case Status'],
                nature_of_disposal: caseStatus['Nature of Disposal'],
                court_number_and_judge: caseStatus['Court Number and Judge']
            },
            orders_info: {
                interim_orders: orders?.map(order => ({
                    number: order['Order Number'],
                    date: order['Order Date'],
                    details: order['Order Details'],
                    pdf_url: order['Order Details_URL']
                })) || [],
                final_orders: finalOrders?.map(order => ({
                    number: order['Order Number'],
                    date: order['Order Date'],
                    details: order['Order Details'],
                    pdf_url: order['Order Details_URL']
                })) || []
            },
            acts_sections: acts.map(act => ({
                act: act['Under Act(s)'],
                section: act['Under Section(s)']
            })),
            case_history: history.map(event => ({
                registration_number: event['Registration Number'],
                judge: event['Judge'],
                business_on_date: event['Business On Date'],
                hearing_date: event['Hearing Date'],
                purpose: event['Purpose of hearing'],
                business_data: event['Business On Date Data']
            })),
            parties: {
                petitioners: parties.petitioners,
                respondents: parties.respondents
            },
            orders: {
                interim_orders: orders,
                final_orders: finalOrders,
                all_orders: allOrders
            }
        };

        return formattedCaseDetails;
    });
}

 

async function scrapeData(page, date, diaryNumber, caseTypeValue, courtComplex, courtName, responseInterceptor, dbClient = null) {
    console.log(`[start] [scrapeData] Starting data scraping for ${courtName}`);
    
    try {
        // Determine search type and prepare search data
        const searchInfo = determineSearchType(date, diaryNumber, caseTypeValue, courtComplex, courtName);
        console.log(`[info] Search type: ${searchInfo.searchType}`, searchInfo.searchData);

        // Navigate and fill form based on search type
        if (searchInfo.searchType === 'case_number') {
            await navigateToCaseNumberPage(page, courtName);
            await selectCourtComplex(page, searchInfo.searchData.courtComplex);
            await setCaseNumberFields(
                page, 
                searchInfo.searchData.caseNumber, 
                searchInfo.searchData.caseYear, 
                searchInfo.searchData.caseType
            );
        } else {
            await navigateToOrderDatePage(page);
            await setDateFields(page, searchInfo.searchData.date, searchInfo.searchData.date);
        }

        // Handle captcha and submit
        await handleCaptcha(page, 20);  // Increased to 20 retries
        
        // Wait for results and check for errors
        await page.waitForSelector('table', { timeout: 30000 });
        
        // Get initial search results
        console.log('[extract] Getting search results...');
        const courtResults = await extractSearchResults(page);
        
        console.log('[debug] Raw court results:', JSON.stringify(courtResults, null, 2));
        
        if (!Array.isArray(courtResults) || courtResults.length === 0 || 
            !courtResults[0].cases || courtResults[0].cases.length === 0) {
            console.log('[extract] No results found');
            return {
                success: true,
                message: 'No results found',
                total_cases: 0,
                cases: []
            };
        }

        console.log(`[extract] Found ${courtResults.length} courts with cases`);
        
        // Process each court's cases
        const fullResults = [];
        
        for (const court of courtResults) {
            console.log(`[database] 🏛 Processing court: ${court.court_name}`);
            console.log(`[debug] Court data:`, JSON.stringify(court, null, 2));
            
            if (!Array.isArray(court.cases)) {
                console.log(`[warning] Invalid cases array for court: ${court.court_name}`);
                continue;
            }
            
        console.log(`[info] Found ${court.cases.length} cases in ${court.court_name}`);
            
            for (const result of court.cases) {
                try {
                    console.log('[debug] Processing case:', JSON.stringify(result, null, 2));
                    
                    if (result.case_type_number_year) {
                        try {
                            console.log(`[extract] Getting details for case: ${result.case_type_number_year}`);
                            
                            // Wait for results to stabilize
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            
                            // Get the view button with matching case number
                            const viewButton = await page.evaluateHandle(caseNumber => {
                                const rows = document.querySelectorAll('tr');
                                for (const row of rows) {
                                    const caseCell = row.querySelector('td[data-th="Case Type/Case Number/Case Year"] span.bt-content');
                                    if (caseCell && caseCell.textContent.trim() === caseNumber) {
                                        return row.querySelector('a.viewCnrDetails');
                                    }
                                }
                                return null;
                            }, result.case_type_number_year);
                            
                            if (!viewButton) {
                                throw new Error(`Could not find view button for case ${result.case_type_number_year}`);
                            }
                            
                            // Get data-cno attribute
                            const dataCno = await page.evaluate(btn => btn.getAttribute('data-cno'), viewButton);
                            console.log(`[debug] Found view button with data-cno:`, dataCno);
                            
                            // Prepare for navigation
                            const navigationPromise = Promise.race([
                                page.waitForResponse(
                                    response => response.url().includes('getCaseDetails') || 
                                              response.url().includes('getDistCaseDetails'),
                                    { timeout: 30000 }
                                ),
                                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
                            ]);

                            // Click the button with proper event handling
                            await page.evaluate(btn => {
                                // Remove any existing click handlers
                                const clone = btn.cloneNode(true);
                                btn.parentNode.replaceChild(clone, btn);
                                
                                // Trigger click events
                                clone.click();
                                clone.dispatchEvent(new MouseEvent('click', {
                                    view: window,
                                    bubbles: true,
                                    cancelable: true,
                                    buttons: 1
                                }));
                            }, viewButton);

                            // Wait for navigation to complete
                            try {
                                await navigationPromise;
                            } catch (error) {
                                console.log('[debug] Navigation timeout, proceeding with content check...');
                            }

                            console.log('[debug] Waiting for case details response...');
                            try {
                                await responsePromise;
                                console.log('[debug] Case details response received');
                            } catch (error) {
                                console.error('[error] Failed to get case details response:', error.message);
                                // Don't throw error yet, try to proceed with content check
                            }

                            console.log('[debug] Starting view button click sequence...');

                            try {
                                // Click the view button
                                await page.evaluate(btn => {
                                    btn.click();
                                    btn.dispatchEvent(new MouseEvent('click', {
                                        bubbles: true,
                                        cancelable: true,
                                        view: window
                                    }));
                                }, viewButton);

                                // Wait for any initial AJAX response
                                await Promise.race([
                                    page.waitForResponse(response => 
                                        response.url().includes('get_case_details') || 
                                        response.url().includes('getCaseDetails'),
                                        { timeout: 10000 }
                                    ),
                                    page.waitForSelector('#cnrResultsDetails', { visible: true, timeout: 10000 })
                                ]);

                                // Wait for content with retries
                                console.log('[debug] Waiting for content to load...');
                                let retryCount = 0;
                                const maxRetries = 5;

                                let contentLoaded = false;
                                
                                while (retryCount < maxRetries && !contentLoaded) {
                                    try {
                                        console.log(`[debug] Content check attempt ${retryCount + 1}/${maxRetries}`);
                                        
                                        // First wait for the outer container
                                        await page.waitForSelector('#cnrResultsDetails', { visible: true, timeout: 5000 });
                                        
                                        // Now wait for tables to be present
                                        await page.waitForFunction(() => {
                                            const tables = document.querySelectorAll('.distTableContent table');
                                            return tables.length > 0;
                                        }, { timeout: 5000 });
                                        
                                        // Additional wait for dynamic content
                                        await new Promise(resolve => setTimeout(resolve, 2000));
                                        
                                        // Verify content
                                        const contentCheck = await page.evaluate(() => {
                                            const tables = Array.from(document.querySelectorAll('.distTableContent table'));
                                            const tableCaptions = tables.map(t => t.querySelector('caption')?.textContent.trim());
                                            
                                            return {
                                                hasCaseDetails: tableCaptions.includes('Case Details'),
                                                hasCaseStatus: tableCaptions.includes('Case Status'),
                                                hasPartyInfo: !!document.querySelector('.border.box.bg-white'),
                                                tableCount: tables.length,
                                                foundTables: tableCaptions
                                            };
                                        });
                                        
                                        console.log('[debug] Content verification:', contentCheck);
                                        
                                        if (contentCheck.hasCaseDetails && contentCheck.hasCaseStatus) {
                                            contentLoaded = true;
                                            console.log('[debug] Required content found');
                                            await new Promise(resolve => setTimeout(resolve, 2000));
                                            
                                            // Extract and log table contents
                                            const tableData = await page.evaluate(() => {
                                                const extractTableData = (table) => {
                                                    const caption = table.querySelector('caption')?.textContent.trim();
                                                    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
                                                    const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
                                                        const rowData = {};
                                                        headers.forEach((header, index) => {
                                                            const cell = row.querySelectorAll('td')[index];
                                                            if (!cell) return;
                                                            
                                                            const content = cell.querySelector('.bt-content');
                                                            const link = content?.querySelector('a');
                                                            
                                                            if (link) {
                                                                rowData[header] = content.textContent.trim();
                                                                rowData[`${header}_URL`] = link.href;
                                                            } else {
                                                                rowData[header] = content?.textContent.trim() || cell.textContent.trim();
                                                            }
                                                        });
                                                        return rowData;
                                                    });
                                                    return { caption, rows };
                                                };

                                                const tables = Array.from(document.querySelectorAll('.distTableContent table'));
                                                return tables.map(extractTableData);
                                            });

                                            console.log('\n[data] Extracted Case Information:');
                                            tableData.forEach(({ caption, rows }) => {
                                                console.log(`\n[${caption}]`);
                                                rows.forEach((row, index) => {
                                                    console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2));
                                                });
                                            });
                                            
                                            break;
                                        }
                                        
                                    } catch (error) {
                                        console.log(`[debug] Attempt ${retryCount + 1} failed:`, error.message);
                                    }
                                    
                                    retryCount++;
                                    if (retryCount < maxRetries) {
                                        await new Promise(resolve => setTimeout(resolve, 2000));
                                    }
                                }
                                
                                if (!contentLoaded) {
                                    throw new Error('Failed to find required case details content');
                                }
                                
                                console.log('[debug] Proceeding with data extraction...');
                                
                                console.log('[debug] Content loaded successfully');
                                
                                // Additional wait for any animations/transitions
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                            } catch (error) {
                                console.error('[error] Failed to load content:', error.message);
                                throw new Error('Failed to load case details: Content not found');
                            }
                            
                            console.log('[debug] Content already loaded and verified, proceeding with extraction...');
                            
                            // Extract case details
                            // Give extra time for dynamic content to load
                            await new Promise(resolve => setTimeout(resolve, 3000));

                            // Verify that the content is loaded and get initial structure
                            const contentCheck = await page.evaluate(() => {
                                const tables = Array.from(document.querySelectorAll('.distTableContent table'));
                                const partyBox = document.querySelector('.border.box.bg-white');
                                const resultDetails = document.querySelector('#cnrResultsDetails');
                                
                                // Log what we found for debugging
                                console.log('[page] Found elements:', {
                                    tables: tables.length,
                                    hasPartyBox: !!partyBox,
                                    hasResultDetails: !!resultDetails,
                                    tableTypes: tables.map(t => t.querySelector('caption')?.textContent.trim())
                                });
                                
                                return {
                                    tablesCount: tables.length,
                                    hasPartyBox: !!partyBox,
                                    hasResultDetails: !!resultDetails,
                                    tableTypes: tables.map(t => t.querySelector('caption')?.textContent.trim())
                                };
                            });
                            
                            console.log('[debug] Content check:', contentCheck);
                            
                            // Verify we have the minimum required content
                            if (!contentCheck.tablesCount && !contentCheck.hasPartyBox) {
                                console.error('[error] Missing critical content elements:', contentCheck);
                                throw new Error('Failed to load case details: Required content not found');
                            }
                            
                            // Extract case details with robust error handling
                            const caseDetails = await page.evaluate(() => {
                                console.log('[page] Starting detailed extraction');
                                
                                const result = {
                                    judgment_url: [],      // Array to store all order URLs
                                    all_parties: [],       // Array to store party information
                                    listing_history: [],   // Array to store listing history
                                    order_details: [],     // Array to store order details
                                    court: '',            // Will be set from court name
                                    court_type: 'District Court',
                                    city: 'Delhi',
                                    district: "East District Court, Delhi",
                                    court_complex: 'Karkardooma Court Complex'
                                };
                                
                                // Get court name from header
                                const courtHeader = document.querySelector('#cnrResultsDetails h2');
                                if (courtHeader) {
                                    result.court = courtHeader.textContent.trim();
                                }
                                
                                // Helper function to get text content safely
                                const getTextContent = (element) => {
                                    if (!element) return '';
                                    const span = element.querySelector('span.bt-content');
                                    return span ? span.textContent.trim() : element.textContent.trim();
                                };

                                // Helper function to find table by caption text
                                const findTableByCaption = (captionText) => {
                                    const tables = Array.from(document.querySelectorAll('.distTableContent table'));
                                    return tables.find(table => {
                                        const caption = table.querySelector('caption');
                                        return caption && caption.textContent.trim() === captionText;
                                    });
                                };

                                // Extract Case Details table
                                const caseDetailsTable = findTableByCaption('Case Details');
                                if (caseDetailsTable) {
                                    const cells = caseDetailsTable.querySelectorAll('tbody tr td');
                                    result.case_type = getTextContent(cells[0]);        // MACT - M.A.C.T.
                                    result.filing_number = getTextContent(cells[1]);    // 10/2025
                                    result.filing_date = getTextContent(cells[2]);      // 03-01-2025
                                    result.case_number = getTextContent(cells[3]);      // 4/2025
                                    result.registered_on = getTextContent(cells[4]);    // 03-01-2025
                                }

                                // Extract Case Status table
                                const caseStatusTable = findTableByCaption('Case Status');
                                if (caseStatusTable) {
                                    const cells = caseStatusTable.querySelectorAll('tbody tr td');
                                    result.first_hearing_date = getTextContent(cells[0]); // 03-January-2025
                                    result.judgment_date = getTextContent(cells[1]);      // 06-March-2025
                                    result.case_status = getTextContent(cells[2]);        // Case Disposed
                                    result.judgment_type = getTextContent(cells[3]);      // Uncontested - DISMISSED
                                    result.judgment_by = getTextContent(cells[4]);        // 4-Presiding Off.-MACT
                                }

                                // Extract Party Information
                                const partySection = document.querySelector('.border.box.bg-white');
                                if (partySection) {
                                    // Process Petitioner
                                    const petitioners = Array.from(partySection.querySelectorAll('.Petitioner ul li p'))
                                        .map(p => p.textContent.trim().replace(/^\d+\)\s*/, ''))
                                        .filter(Boolean);
                                    
                                    petitioners.forEach(name => {
                                        result.all_parties.push({
                                            type: 'petitioner',
                                            name: name
                                        });
                                    });
                                    
                                    // Process Respondent
                                    const respondents = Array.from(partySection.querySelectorAll('.respondent ul li p'))
                                        .map(p => p.textContent.trim().replace(/^\d+\)\s*/, ''))
                                        .filter(Boolean);
                                    
                                    respondents.forEach(name => {
                                        result.all_parties.push({
                                            type: 'respondent',
                                            name: name
                                        });
                                    });
                                    
                                    // Set primary fields
                                    if (petitioners.length > 0 && respondents.length > 0) {
                                        result.parties = `${petitioners[0]} Versus ${respondents[0]}`;
                                        result.party_name = petitioners[0];
                                    }
                                }
                                
                                // Extract Case History
                                const historyTable = findTableByCaption('Case History');
                                if (historyTable) {
                                    const rows = historyTable.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td');
                                        const entry = {
                                            registration_number: getTextContent(cells[0]),
                                            judge: getTextContent(cells[1]),
                                            business_date: getTextContent(cells[2]),
                                            hearing_date: getTextContent(cells[3]),
                                            purpose: getTextContent(cells[4])
                                        };
                                        result.listing_history.push(entry);
                                        
                                        // Update last_listed with most recent date
                                        if (entry.business_date && (!result.last_listed || new Date(entry.business_date) > new Date(result.last_listed))) {
                                            result.last_listed = entry.business_date;
                                        }
                                    });
                                }
                                
                                // Extract Orders
                                const extractOrders = (table, isFinal = false) => {
                                    if (!table) return;
                                    const rows = table.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td');
                                        const link = cells[2]?.querySelector('a');
                                        if (link) {
                                            // Add to judgment_url array
                                            result.judgment_url.push(link.href);
                                            
                                            // Add to order_details array
                                            result.order_details.push({
                                                order_number: getTextContent(cells[0]),
                                                order_date: getTextContent(cells[1]),
                                                order_details: getTextContent(cells[2]),
                                                order_url: link.href,
                                                is_final: isFinal
                                            });
                                        }
                                    });
                                };
                                
                                // Process both regular and final orders
                                extractOrders(findTableByCaption('Orders'));
                                extractOrders(findTableByCaption('Final Order'), true);

                                // Log the extracted data for debugging
                                console.log('[page] Extracted case details:', {
                                    caseNumber: result.case_number,
                                    parties: result.parties,
                                    totalParties: result.all_parties.length,
                                    totalOrders: result.order_details.length,
                                    totalJudgmentUrls: result.judgment_url.length
                                });

                                // return result;
                                
                                // Helper function to extract row-based table data
                                const extractRowData = (table) => {
                                    if (!table) return {};
                                    const headerRow = table.querySelector('thead tr');
                                    const dataRow = table.querySelector('tbody tr');
                                    if (!headerRow || !dataRow) return {};
                                    
                                    const headers = Array.from(headerRow.querySelectorAll('th')).map(th => 
                                        th.textContent.trim()
                                            .toLowerCase()
                                            .replace(/[()]/g, '')
                                            .replace(/\s+/g, '_')
                                    );
                                    
                                    const values = Array.from(dataRow.querySelectorAll('td')).map(td => {
                                        const span = td.querySelector('span.bt-content');
                                        const link = span?.querySelector('a');
                                        if (link) {
                                            // If it's an order URL, add it to judgment_url array
                                            if (link.href && !link.href.includes('javascript:void(0)')) {
                                                result.judgment_url.push(link.href);
                                            }
                                            return {
                                                text: span.textContent.trim(),
                                                url: link.href
                                            };
                                        }
                                        return span ? span.textContent.trim() : td.textContent.trim();
                                    });
                                    
                                    const data = {};
                                    headers.forEach((header, index) => {
                                        if (values[index]) {
                                            data[header] = values[index];
                                        }
                                    });
                                    return data;
                                };
                                
                                // Find all sections by their headers
                                // Find all table sections
                                const tables = document.querySelectorAll('.distTableContent table');
                                
                                tables.forEach(table => {
                                    const caption = table.querySelector('caption');
                                    if (!caption) return;
                                    
                                    const title = caption.textContent.trim();
                                    
                                // Process each section based on its caption
                                if (title === 'Case Details') {
                                    result.case_details = extractRowData(table);
                                }
                                else if (title === 'Case Status') {
                                    result.case_status = extractRowData(table);
                                }
                                else if (title === 'Acts') {
                                    const acts = [];
                                    const rows = table.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td span.bt-content');
                                        if (cells.length >= 2) {
                                            acts.push({
                                                act: cells[0].textContent.trim(),
                                                section: cells[1].textContent.trim()
                                            });
                                        }
                                    });
                                    result.acts = acts;
                                }
                                else if (title === 'Case History') {
                                    const rows = table.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td span.bt-content');
                                        const dateLink = cells[2]?.querySelector('a');
                                        if (cells.length >= 5) {
                                            result.listing_history.push({
                                                registration_number: cells[0].textContent.trim(),
                                                judge: cells[1].textContent.trim(),
                                                business_date: cells[2].textContent.trim(),
                                                hearing_date: cells[3].textContent.trim() || null,
                                                purpose: cells[4].textContent.trim()
                                            });
                                            
                                            // Update last_listed with the most recent date
                                            const businessDate = cells[2].textContent.trim();
                                            if (!result.last_listed || new Date(businessDate) > new Date(result.last_listed)) {
                                                result.last_listed = businessDate;
                                            }
                                        }
                                    });
                                }
                                else if (title === 'Orders') {
                                    const rows = table.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td span.bt-content');
                                        const link = cells[2]?.querySelector('a');
                                        if (cells.length >= 3) {
                                            // Add to order_details array
                                            result.order_details.push({
                                                order_number: cells[0].textContent.trim(),
                                                order_date: cells[1].textContent.trim(),
                                                order_details: cells[2].textContent.trim(),
                                                order_url: link ? link.href : null
                                            });
                                            // Add order URL to judgment_url array if exists
                                            if (link && link.href) {
                                                result.judgment_url.push(link.href);
                                            }
                                        }
                                    });
                                }
                                else if (title === 'Final Order') {
                                    const finalOrders = [];
                                    const rows = table.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const cells = row.querySelectorAll('td span.bt-content');
                                        const link = cells[2]?.querySelector('a');
                                        if (cells.length >= 3) {
                                            finalOrders.push({
                                                order_number: cells[0].textContent.trim(),
                                                order_date: cells[1].textContent.trim(),
                                                order_details: cells[2].textContent.trim(),
                                                order_url: link ? link.href : null
                                            });
                                        }
                                    });
                                    result.final_orders = finalOrders;
                                }
                                });
                                
                                // Extract party details from the box
                                const partyBox = document.querySelector('.border.box.bg-white');
                                if (partyBox) {
                                    // Get petitioner details
                                    const petitionerSection = partyBox.querySelector('.Petitioner');
                                    if (petitionerSection) {
                                        const petitioners = Array.from(petitionerSection.querySelectorAll('li p'))
                                            .map(p => p.textContent.trim())
                                            .filter(text => text);
                                        
                                        petitioners.forEach(petitioner => {
                                            result.all_parties.push({
                                                type: 'petitioner',
                                                name: petitioner
                                            });
                                        });
                                        
                                        // Set first petitioner as party_name
                                        if (petitioners.length > 0) {
                                            result.party_name = petitioners[0];
                                        }
                                    }
                                    
                                    // Get respondent details
                                    const respondentSection = partyBox.querySelector('.respondent');
                                    if (respondentSection) {
                                        const respondents = Array.from(respondentSection.querySelectorAll('li p'))
                                            .map(p => p.textContent.trim())
                                            .filter(text => text);
                                            
                                        respondents.forEach(respondent => {
                                            result.all_parties.push({
                                                type: 'respondent',
                                                name: respondent
                                            });
                                        });
                                    }
                                    
                                    // Store complete parties string
                                    result.parties = [...(result.all_parties.map(p => p.name))].join(' vs ');
                                }
                                
                                // Get petitioner and respondent details
                                // Use simpler selectors that work with standard DOM API
                                const petitionerSection = document.querySelector('.Petitioner');
                                const respondentSection = document.querySelector('.respondent');
                                
                                if (petitionerSection) {
                                    result.petitioner_details = Array.from(petitionerSection.querySelectorAll('li, p'))
                                        .map(el => el.textContent.trim())
                                        .filter(text => text);
                                }
                                
                                if (respondentSection) {
                                    result.respondent_details = Array.from(respondentSection.querySelectorAll('li, p'))
                                        .map(el => el.textContent.trim())
                                        .filter(text => text);
                                }
                                
                                return result;
                            });
                            
                            console.log('[extract] Case details extracted:', JSON.stringify(caseDetails, null, 2));
                            
                            // Log key extracted fields for debugging
                            console.log('[extract] Key fields:', {
                                case_number: caseDetails.case_number,
                                parties: caseDetails.parties,
                                judgment_by: caseDetails.judgment_by,
                                judgment_date: caseDetails.judgment_date,
                                case_status: caseDetails.case_status,
                                judgment_url_count: caseDetails.judgment_url?.length || 0,
                                all_parties_count: caseDetails.all_parties?.length || 0,
                                order_details_count: caseDetails.order_details?.length || 0
                            });
                            
                            // Merge search result with extracted details
                            fullResults.push({
                                ...result,
                                ...caseDetails,
                                searchType: searchInfo.searchType,
                                courtComplex: court.court_name,
                                establishment_code: court.establishment_code
                            });
                        
                        } catch (detailError) {
                            console.error(`[error] Failed to extract details for case ${result.case_type_number_year}:`, detailError.message);
                            // Still add basic result even if detail extraction fails
                            fullResults.push({
                                ...result,
                                searchType: searchInfo.searchType,
                                courtComplex: court.court_name,
                                establishment_code: court.establishment_code,
                                error: detailError.message
                            });
                        }
                    }
                } catch (error) {
                    console.error('[error] Error processing case:', error.message);
                }
            }
        }


        // Store in database if client provided
        if (dbClient && fullResults.length > 0) {
            try {
                console.log('[database] Preparing records for storage...');
                console.log(`[debug] Processing ${fullResults.length} full results for database`);
                const dbRecords = [];
                
                for (const result of fullResults) {
                    try {
                        console.log('[debug] Transforming case data:', JSON.stringify(result, null, 2));
                        
                        const transformedRecord = transformToDatabaseSchema(
                            result, 
                            { 
                                court_name: result.courtComplex || 'District Court East Delhi',
                                establishment_code: result.establishmentCode || 'DLET01'
                            }, 
                            searchInfo.searchData
                        );
                        
                        console.log('[debug] Transformed database record:', JSON.stringify(transformedRecord, null, 2));
                        
                        if (transformedRecord) {
                            dbRecords.push(transformedRecord);
                            console.log('[debug] Added record to database batch');
                        }
                    } catch (transformError) {
                        console.error('[database] Error transforming record:', transformError.message);
                    }
                }
                
                if (dbRecords.length > 0) {
                    console.log(`[database] Inserting ${dbRecords.length} records...`);
                    try {
                        const insertResult = await bulkInsertOrders(dbClient, dbRecords);
                        console.log(`[database] Inserted ${insertResult.inserted} records (${insertResult.errors} errors)`);
                    } catch (insertError) {
                        console.error('[database] Error during bulk insert:', insertError.message);
                    }
                } else {
                    console.log('[database] No valid records to insert');
                }
            } catch (dbError) {
                console.error('[database] Error in database operations:', dbError.message);
            }
        }

        return {
            success: true,
            search_parameters: {
                search_type: searchInfo.searchType,
                search_data: searchInfo.searchData,
                search_timestamp: new Date().toISOString(),
                court_name: 'East District Court, Delhi'
            },
            total_cases: fullResults.length,
            cases: fullResults
        };
    }
    catch (error) {
        console.error('[error] scrapeData failed:', error.message);
        return {
            success: false,
            message: error.message
        };
    }     
}

module.exports = { scrapeData };
async function handleCaptcha(page, captchaRetries = 20) {
    let success = false;
    
    console.log(`[captcha] Starting CAPTCHA solving with ${captchaRetries} max attempts`);
    
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);
        
        try {
            // On retry, refresh the captcha image
            if (attempt > 1) {
                try {
                    // Click the captcha image to refresh it
                    await page.click('#siwp_captcha_image_0');
                    await wait(2000); // Wait for new image to load
                    console.log('[captcha] Refreshed CAPTCHA image');
                } catch (e) {
                    console.log('[captcha] Could not refresh CAPTCHA image:', e.message);
                }
            }

            // Wait for captcha image to be present
            await page.waitForSelector('#siwp_captcha_image_0', { timeout: 10000 });
            await wait(1000);

            // Get captcha image
            const captchaElement = await page.$('#siwp_captcha_image_0');
            if (!captchaElement) {
                throw new Error('Captcha image element not found');
            }

            const captchaBuffer = await captchaElement.screenshot();
            console.log(`[captcha] Captured captcha image for attempt ${attempt}`);

            // Solve captcha
            const captchaAnswer = await solveCaptcha(captchaBuffer);
            console.log(`[captcha] Entering answer: ${captchaAnswer}`);

            // Clear previous input if retry
            if (attempt > 1) {
                await page.click('#siwp_captcha_value_0', { clickCount: 3 });
                await page.keyboard.press('Delete');
                await wait(500);
            }

            // Enter captcha answer
            await page.type('#siwp_captcha_value_0', captchaAnswer);
            await wait(1000);

            // Submit the form
            console.log('[form] Submitting search form...');
            await page.click('input[type="submit"][value="Search"]');
            
            // Wait for response - results take at least 20 seconds to load
            console.log('[wait] Waiting for search results (this takes 20+ seconds)...');
            await wait(5000); // Initial wait
            
            // Quick check for immediate errors only
            let hasError = await page.$('.error, .alert-danger, .notfound');
            if (hasError) {
                const errorText = await page.evaluate(() => {
                    const errorEl = document.querySelector('.error, .alert-danger, .notfound');
                    return errorEl ? errorEl.textContent.trim() : '';
                });
                console.log(`[captcha] Immediate error detected: ${errorText}`);
                
                if (errorText.toLowerCase().includes('captcha') || 
                    errorText.toLowerCase().includes('incorrect') || 
                    errorText.toLowerCase().includes('invalid') ||
                    errorText.includes('The captcha code entered was incorrect')) {
                    console.log('[captcha] Captcha was incorrect, retrying...');
                    continue;
                } else {
                    throw new Error(`Form error: ${errorText}`);
                }
            }
            
            // Wait for results to load (minimum 20 seconds total)
            console.log('[wait] No immediate errors, waiting for results to load...');
            await wait(15000); // Wait 15 more seconds (20 total so far)
            
            // Final check for errors after full wait
            hasError = await page.$('.error, .alert-danger, .notfound');
            if (hasError) {
                const errorText = await page.evaluate(() => {
                    const errorEl = document.querySelector('.error, .alert-danger, .notfound');
                    return errorEl ? errorEl.textContent.trim() : '';
                });
                console.log(`[captcha] Error after full wait: ${errorText}`);
                
                if (errorText.toLowerCase().includes('captcha') || 
                    errorText.toLowerCase().includes('incorrect') || 
                    errorText.toLowerCase().includes('invalid') ||
                    errorText.includes('The captcha code entered was incorrect')) {
                    console.log('[captcha] Captcha was incorrect, retrying...');
                    continue;
                } else {
                    throw new Error(`Form error: ${errorText}`);
                }
            }
            
            console.log('✅ Form submitted successfully - proceeding to scrape data!');
            success = true;
            break;
            
        } catch (error) {
            console.log(`[captcha] Attempt ${attempt} failed:`, error.message);
            if (attempt === captchaRetries) {
                throw error;
            }
        }
    }

    if (!success) {
        throw new Error('Failed to submit form after all captcha attempts');
    }
}


 // Extract data from search results table
async function extractSearchResults(page) {
    try {
        // First check if we have a "No Records Found" message
        const hasNoRecords = await page.evaluate(() => {
            const noRecordCell = Array.from(document.querySelectorAll('td')).find(td => 
                td.textContent.trim().toLowerCase().includes('no record') || 
                td.textContent.trim().toLowerCase().includes('not found')
            );
            return !!noRecordCell;
        });

        if (hasNoRecords) {
            console.log('[extract] Found "No Records" message on page');
            return [{
                court_name: 'District and Sessions Judge, East, KKD',
                establishment_code: 'DLET01',
                total_cases_available: 0,
                cases_in_current_page: 0,
                cases: []
            }];
        }

        // Extract results from the page
        const results = await page.evaluate(() => {
            console.log('[page] Starting results extraction...');
            
            const courts = [];
            const tables = document.querySelectorAll('table');
            console.log(`[page] Found ${tables.length} tables`);

            tables.forEach((table, tableIndex) => {
                // Get court name from preceding header or caption
                let courtName = 'District and Sessions Judge, East, KKD';
                const caption = table.querySelector('caption');
                const tableHeader = table.closest('div').querySelector('h3, h4');
                if (caption) courtName = caption.textContent.trim();
                else if (tableHeader) courtName = tableHeader.textContent.trim();

                // Get all rows excluding header
                const rows = Array.from(table.querySelectorAll('tr')).filter(row => {
                    const firstCell = row.querySelector('td');
                    return firstCell && !firstCell.textContent.trim().toLowerCase().includes('sr');
                });

                const cases = rows.map(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    console.log('[page] Processing row with cells:', cells.map(c => c.textContent.trim()));

                    // Extract basic case data
                    const caseData = {
                        serial_number: cells[0]?.querySelector('.bt-content')?.textContent.trim() || '',
                        case_type_number_year: cells[1]?.querySelector('.bt-content')?.textContent.trim() || '',
                        parties: cells[2]?.querySelector('.bt-content')?.textContent.trim() || '',
                        next_hearing: cells[3]?.querySelector('.bt-content')?.textContent.trim() || '',
                        stage: cells[4]?.querySelector('.bt-content')?.textContent.trim() || '',
                        order_date: '',
                        order_type: '',
                        copy_of_order_url: null,
                        details_url: null
                    };

                    // Extract URLs from cells
                    cells.forEach(cell => {
                        const links = Array.from(cell.querySelectorAll('a'));
                        links.forEach(link => {
                            const href = link.href;
                            const dataCase = link.getAttribute('data-case');
                            const text = link.textContent.trim();

                            if (href && href.includes('get_order_pdf')) {
                                caseData.copy_of_order_url = href;
                                caseData.order_type = text;
                            }

                            if (dataCase) {
                                try {
                                    const decodedData = JSON.parse(atob(dataCase));
                                    Object.assign(caseData, {
                                        cino: decodedData.cino,
                                        business_date: decodedData.business_date,
                                        business_status: decodedData.business_status,
                                        case_data: decodedData
                                    });
                                } catch (e) {
                                    console.log('[page] Failed to decode case data:', e.message);
                                }
                            }
                        });
                    });

                    // Build case detail URL
                    const [caseType, caseNo, caseYear] = (caseData.case_type_number_year || '').split('/');
                    if (caseType && caseNo && caseYear) {
                        caseData.details_url = `https://eastdelhi.dcourts.gov.in/case-status-search-by-case-number?case_type=${encodeURIComponent(caseType)}&case_no=${encodeURIComponent(caseNo)}&case_year=${encodeURIComponent(caseYear)}`;
                    }

                    return caseData;
                }).filter(caseData => caseData.serial_number && caseData.case_type_number_year);

                if (cases.length > 0) {
                    courts.push({
                        court_name: courtName,
                        establishment_code: 'DLET01',
                        total_cases_available: cases.length,
                        cases_in_current_page: cases.length,
                        cases: cases
                    });
                }
            });

            console.log('[page] Extracted courts:', courts);
            return courts;
        });

        console.log('[extract] Raw extraction results:', JSON.stringify(results, null, 2));
        
        if (!Array.isArray(results) || results.length === 0) {
            console.log('[extract] No courts array found, returning empty structure');
            return [{
                court_name: 'District and Sessions Judge, East, KKD',
                establishment_code: 'DLET01',
                total_cases_available: 0,
                cases_in_current_page: 0,
                cases: []
            }];
        }

        return results;

    } catch (error) {
        console.error('[extract] Error extracting search results:', error.message);
        throw error;
    }
}


 
module.exports = {
    scrapeData,
    extractSearchResults,
    extractCaseDetailPage,
    decodeBase64CaseData
};