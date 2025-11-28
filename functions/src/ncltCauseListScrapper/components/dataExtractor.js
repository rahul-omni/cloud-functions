/**
 * Extract cause list data from NCLT page
 * @param {Object} page - Puppeteer page instance
 * @returns {Array} Extracted cause list entries
 */
async function extractCauseListData(page) {
    try {
        console.log('[extract] Starting cause list data extraction...');
        
        // Wait for results to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const causeListData = await page.evaluate(() => {
            const results = [];
            
            // First, look for the PDF download table (like in the screenshot)
            console.log('Looking for PDF download table...');
            
            const tables = document.querySelectorAll('table');
            console.log(`Found ${tables.length} tables on page`);
            
            if (tables.length === 0) {
                console.log('No tables found on page');
                return results;
            }
            
            // Check each table for PDF links
            tables.forEach((table, tableIndex) => {
                const rows = table.querySelectorAll('tr');
                console.log(`Table ${tableIndex}: Found ${rows.length} rows`);
                
                if (rows.length < 2) return; // Skip tables with no data rows
                
                // Get headers from first row
                const headerRow = rows[0];
                const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => 
                    cell.textContent.trim()
                );
                
                console.log(`Table ${tableIndex} headers:`, headers);
                
                // Check if this table contains PDF files (like in screenshot)
                const hasPdfColumn = headers.some(header => 
                    header.toLowerCase().includes('pdf') || 
                    header.toLowerCase().includes('file') ||
                    header.toLowerCase().includes('title') ||
                    header.toLowerCase().includes('court')
                );
                
                if (hasPdfColumn) {
                    console.log(`Table ${tableIndex} appears to be PDF download table, extracting...`);
                    
                    // Process PDF table rows (starting from row 1 to skip headers)
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const cells = row.querySelectorAll('td');
                        
                        if (cells.length < 3) continue;
                        
                        // Look for PDF link in this row
                        const pdfLink = row.querySelector('a[href*=".pdf"]');
                        
                        if (pdfLink) {
                            const pdfData = {
                                title: cells[0]?.textContent?.trim() || '',
                                court: cells[1]?.textContent?.trim() || '',
                                numberOfEntries: cells[2]?.textContent?.trim() || '',
                                pdfUrl: pdfLink.href || '',
                                pdfFileName: pdfLink.textContent?.trim() || '',
                                fileSize: cells[4]?.textContent?.trim() || '',
                                causeDate: cells[5]?.textContent?.trim() || '',
                                rowIndex: i,
                                tableIndex: tableIndex,
                                extractionMethod: 'PDF_DOWNLOAD_TABLE',
                                rawCells: Array.from(cells).map(cell => cell.textContent.trim())
                            };
                            
                            console.log(`Found PDF: ${pdfData.title} - ${pdfData.pdfFileName}`);
                            results.push(pdfData);
                        }
                    }
                } else {
                    // If not a PDF table, check for traditional cause list data
                    console.log(`Table ${tableIndex} - checking for traditional cause list data...`);
                    
                    // Check if this is a traditional cause list table
                    const isCauseListTable = headers.some(header => 
                        header.toLowerCase().includes('case') || 
                        header.toLowerCase().includes('petitioner') ||
                        header.toLowerCase().includes('applicant') ||
                        header.toLowerCase().includes('respondent') ||
                        header.toLowerCase().includes('s.no')
                    );
                    
                    if (isCauseListTable) {
                        console.log(`Table ${tableIndex} appears to be a traditional cause list table, processing...`);
                        
                        // Process traditional cause list data rows
                        for (let i = 1; i < rows.length; i++) {
                            const row = rows[i];
                            const cells = row.querySelectorAll('td');
                            
                            if (cells.length === 0) continue;
                            
                            const rowData = {
                                rowIndex: i,
                                tableIndex: tableIndex,
                                serialNumber: cells[0]?.textContent?.trim() || '',
                                caseNumber: cells[1]?.textContent?.trim() || '',
                                petitioner: cells[2]?.textContent?.trim() || '',
                                respondent: cells[3]?.textContent?.trim() || '',
                                advocate: cells[4]?.textContent?.trim() || '',
                                stage: cells[5]?.textContent?.trim() || '',
                                courtRoom: cells[6]?.textContent?.trim() || '',
                                time: cells[7]?.textContent?.trim() || '',
                                extractionMethod: 'TRADITIONAL_CAUSE_LIST',
                                rawCells: Array.from(cells).map(cell => cell.textContent.trim())
                            };
                            
                            // Only add rows with meaningful data
                            if (rowData.caseNumber || rowData.petitioner || rowData.serialNumber) {
                                console.log(`Found case: ${rowData.caseNumber} - ${rowData.petitioner}`);
                                results.push(rowData);
                            }
                        }
                    }
                }
            });
            
            console.log(`Extracted ${results.length} entries total`);
            return results;
        });
        
        console.log(`[extract] ✅ Successfully extracted ${causeListData.length} cause list entries`);
        
        if (causeListData.length > 0) {
            console.log('[extract] Sample entry:', {
                extractionMethod: causeListData[0].extractionMethod,
                title: causeListData[0].title || causeListData[0].caseNumber,
                court: causeListData[0].court || causeListData[0].courtRoom,
                pdfUrl: causeListData[0].pdfUrl || 'N/A',
                entries: causeListData[0].numberOfEntries || 'N/A'
            });
        }
        
        return causeListData;
        
    } catch (error) {
        console.error('[extract] ❌ Error extracting cause list data:', error.message);
        return [];
    }
}

module.exports = {
    extractCauseListData
};
