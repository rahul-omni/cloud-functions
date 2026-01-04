const { wait } = require('./utils');

/**
 * Wait for results table to load after clicking View CL button
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const waitForResults = async (page) => {
  console.log('[debug] [waitForResults] ========== Starting wait for results ==========');
  const currentUrl = page.url();
  console.log(`[debug] [waitForResults] Current page URL: ${currentUrl}`);
  
  try {
    // The form uses AJAX - results are loaded into #show_causeList div
    // Wait for #show_causeList to be visible and populated
    console.log('[debug] [waitForResults] Waiting for #show_causeList div to appear (AJAX response)...');
    
    // Wait for the div to appear and have content
    await page.waitForFunction(
      () => {
        const div = document.querySelector('#show_causeList');
        return div && div.offsetParent !== null && div.innerHTML.trim().length > 100;
      },
      { timeout: 300000 } // 5 minutes timeout for AJAX response
    );
    console.log('[debug] [waitForResults] ✅ Found #show_causeList div with content');
    
    // Wait longer for content to fully render
    console.log('[debug] [waitForResults] Waiting 3 seconds for content to fully render...');
    await wait(3000);
    
    // Wait for the table inside #show_causeList (this is the actual results table)
    console.log('[debug] [waitForResults] Waiting for table#tables11 inside #show_causeList...');
    await page.waitForSelector('#show_causeList table#tables11', { visible: true, timeout: 300000 }); // 5 minutes timeout
    console.log('[debug] [waitForResults] ✅ Found table#tables11 inside #show_causeList');
    
    // Wait longer for table content to render
    console.log('[debug] [waitForResults] Waiting 3 seconds for table content to render...');
    await wait(3000);
    
    // Get detailed table information from the table inside #show_causeList
    const tableInfo = await page.evaluate(() => {
      // Look for table inside #show_causeList (the results table)
      const showCauseListDiv = document.querySelector('#show_causeList');
      if (!showCauseListDiv) {
        return { exists: false, reason: 'show_causeList div not found' };
      }
      
      const table = showCauseListDiv.querySelector('table#tables11');
      if (!table) {
        // Check if there's any table in the div
        const anyTable = showCauseListDiv.querySelector('table');
        return { 
          exists: false, 
          reason: 'table#tables11 not found in #show_causeList',
          hasAnyTable: !!anyTable,
          divContent: showCauseListDiv.innerHTML.substring(0, 200)
        };
      }
      
      const rows = table.querySelectorAll('tbody tr, tr');
      const rowDetails = [];
      
      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td, th');
        const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
        rowDetails.push({
          index: index,
          cellCount: cells.length,
          cellTexts: cellTexts,
          hasLink: row.querySelector('a') !== null
        });
      });
      
      return {
        exists: true,
        rowCount: rows.length,
        rowDetails: rowDetails
      };
    });
    
    console.log('[debug] [waitForResults] Table structure:', JSON.stringify(tableInfo, null, 2));
    
    if (!tableInfo.exists) {
      console.log('[error] [waitForResults] ❌ Table#tables11 does not exist');
    } else if (tableInfo.rowCount < 3) {
      console.log(`[warning] [waitForResults] ⚠️ Table found but only has ${tableInfo.rowCount} rows (expected at least 3)`);
    } else {
      console.log(`[debug] [waitForResults] ✅ Table has ${tableInfo.rowCount} rows - looks good!`);
    }
    
  } catch (error) {
    console.log(`[warning] [waitForResults] ⚠️ Timeout waiting for table#tables11: ${error.message}`);
    console.log('[debug] [waitForResults] Checking for any table on the page...');
    
    // Fallback: check if any table exists
    try {
      const allTables = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        return Array.from(tables).map((table, index) => ({
          index: index,
          id: table.id || 'no-id',
          className: table.className || 'no-class',
          rowCount: table.querySelectorAll('tr').length
        }));
      });
      
      console.log(`[debug] [waitForResults] Found ${allTables.length} table(s) on page:`, JSON.stringify(allTables, null, 2));
      
      if (allTables.length > 0) {
        await page.waitForSelector('table', { visible: true, timeout: 60000 }); // 1 minute timeout
        console.log('[debug] [waitForResults] Found a table (not #tables11)');
      }
    } catch (e) {
      console.log(`[warning] [waitForResults] ❌ No table found at all: ${e.message}`);
    }
  }
  
  console.log('[debug] [waitForResults] ========== Finished waiting for results ==========');
};

/**
 * Extract PDF links from the results table with associated metadata
 * @param {Object} page - Page instance
 * @param {string} searchDate - The date that was searched (for fallback)
 * @param {string} searchListType - The list type that was searched (for fallback)
 * @returns {Promise<Array>} - Array of PDF link objects with metadata
 */
const extractPdfLinks = async (page, searchDate = null, searchListType = null) => {
  console.log('[debug] [extractPdfLinks] ========== Starting PDF link extraction ==========');
  console.log(`[debug] [extractPdfLinks] Search parameters - Date: ${searchDate}, ListType: ${searchListType}`);
  const currentUrl = page.url();
  console.log(`[debug] [extractPdfLinks] Current page URL: ${currentUrl}`);
  
  try {
    // Check for error messages first
    console.log('[debug] [extractPdfLinks] Checking for error messages on page...');
    const hasError = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.error, .alert-danger, .no-results, .alert');
      const errors = [];
      for (const el of errorElements) {
        if (el.offsetParent !== null) {
          const text = el.textContent.toLowerCase();
          if (text.includes('no result') || text.includes('not found') || text.includes('no data')) {
            errors.push(el.textContent.trim());
          }
        }
      }
      return { hasError: errors.length > 0, errorMessages: errors };
    });
    
    if (hasError.hasError) {
      console.log(`[warning] [extractPdfLinks] ❌ Error message detected: ${hasError.errorMessages.join(', ')}`);
      return [];
    }
    console.log('[debug] [extractPdfLinks] ✅ No error messages found');
    
    // Extract PDF links with table metadata from the specific table structure
    console.log('[debug] [extractPdfLinks] Extracting links from table#tables11...');
    const pdfLinks = await page.evaluate(() => {
      const links = [];
      const baseUrl = window.location.origin;
      const currentUrl = window.location.href;
      
      console.log(`[debug] [page] Base URL: ${baseUrl}`);
      console.log(`[debug] [page] Current URL: ${currentUrl}`);
      
      // Find the table with id="tables11" INSIDE #show_causeList div
      // This is the actual results table, not the menu table
      const showCauseListDiv = document.querySelector('#show_causeList');
      
      if (!showCauseListDiv) {
        console.log('[debug] [page] ❌ #show_causeList div not found - AJAX may not have completed');
        return links;
      }
      
      console.log('[debug] [page] ✅ Found #show_causeList div');
      
      // Look for table inside #show_causeList
      const table = showCauseListDiv.querySelector('table#tables11');
      
      if (!table) {
        console.log('[debug] [page] ❌ table#tables11 not found inside #show_causeList');
        // Check if there's any table in the div
        const anyTable = showCauseListDiv.querySelector('table');
        if (anyTable) {
          console.log(`[debug] [page] ⚠️ Found a table but not #tables11. Table ID: ${anyTable.id || 'no-id'}`);
        } else {
          console.log('[debug] [page] ❌ No table found inside #show_causeList div');
          console.log(`[debug] [page] Div content preview: ${showCauseListDiv.innerHTML.substring(0, 300)}...`);
        }
        return links;
      }
      
      console.log('[debug] [page] ✅ Found table#tables11 inside #show_causeList');
      
      // Get all rows - try both with and without tbody
      const rows = table.querySelectorAll('tbody tr, tr');
      console.log(`[debug] [page] Found ${rows.length} total rows in table`);
      
      // Debug: Log first few rows to understand structure
      if (rows.length > 0) {
        console.log(`[debug] [page] First row HTML preview: ${rows[0].outerHTML.substring(0, 200)}...`);
        if (rows.length > 1) {
          console.log(`[debug] [page] Second row HTML preview: ${rows[1].outerHTML.substring(0, 200)}...`);
        }
        if (rows.length > 2) {
          console.log(`[debug] [page] Third row HTML preview: ${rows[2].outerHTML.substring(0, 200)}...`);
        }
      } else {
        console.log(`[debug] [page] ⚠️ WARNING: No rows found in table!`);
        console.log(`[debug] [page] Table HTML preview: ${table.outerHTML.substring(0, 500)}...`);
      }
      
      let processedRows = 0;
      let skippedRows = 0;
      let errorRows = 0;
      
      rows.forEach((row, rowIndex) => {
        console.log(`[debug] [page] ========== Processing row ${rowIndex} ==========`);
        const rowHtml = row.outerHTML.substring(0, 200);
        console.log(`[debug] [page] Row ${rowIndex} HTML preview: ${rowHtml}...`);
        
        // Skip first row (title row with "Click on Date to see Complete Cause List")
        // Skip second row (header row with "List Date", "List Type", "Main/Sup")
        if (rowIndex < 2) {
          const rowText = row.textContent.trim().substring(0, 50);
          console.log(`[debug] [page] ⏭️ Skipping row ${rowIndex} (header row): "${rowText}..."`);
          skippedRows++;
          return;
        }
        
        // Get all td cells in this row
        const cells = row.querySelectorAll('td');
        console.log(`[debug] [page] Row ${rowIndex} has ${cells.length} <td> cells`);
        
        // Should have exactly 3 cells: List Date, List Type, Main/Sup
        if (cells.length !== 3) {
          console.log(`[debug] [page] ⚠️ Row ${rowIndex} has ${cells.length} cells (expected 3), skipping`);
          errorRows++;
          return;
        }
        
        // First cell: Contains the date link with onclick handler
        const dateCell = cells[0];
        console.log(`[debug] [page] Row ${rowIndex} - First cell HTML: ${dateCell.innerHTML.substring(0, 150)}...`);
        
        // Find the <a> tag inside first cell (might be inside <b> tag)
        const dateLink = dateCell.querySelector('a');
        
        if (!dateLink) {
          console.log(`[debug] [page] ⚠️ Row ${rowIndex} - No <a> tag found in first cell`);
          errorRows++;
          return;
        }
        
        console.log(`[debug] [page] Row ${rowIndex} - Found <a> tag`);
        
        // Extract date from link text (should be like "24/12/2025")
        const listDate = dateLink.textContent.trim();
        console.log(`[debug] [page] Row ${rowIndex} - List Date extracted: "${listDate}"`);
        
        // Extract onclick handler - this is the key part
        const onclickAttr = dateLink.getAttribute('onclick');
        console.log(`[debug] [page] Row ${rowIndex} - onclick attribute exists: ${!!onclickAttr}`);
        
        if (onclickAttr) {
          console.log(`[debug] [page] Row ${rowIndex} - Full onclick: ${onclickAttr}`);
        } else {
          console.log(`[debug] [page] Row ${rowIndex} - ⚠️ No onclick attribute found!`);
        }
        
        let filename = null;
        let fullUrl = null;
        
        if (onclickAttr) {
          // Extract filename from onclick: window.open('./show_cause_list.php?filename=...')
          // The onclick format is: window.open('./show_cause_list.php?filename=ENCODED_STRING')
          // We need to extract the filename parameter value
          console.log(`[debug] [page] Row ${rowIndex} - Parsing onclick: ${onclickAttr.substring(0, 150)}...`);
          
          // Try multiple regex patterns to be robust
          let match = null;
          
          // Pattern 1: Match show_cause_list.php?filename=... (handles ./ prefix)
          match = onclickAttr.match(/show_cause_list\.php\?filename=([^')]+)/);
          
          // Pattern 2: If pattern 1 fails, try matching filename= directly
          if (!match || !match[1]) {
            match = onclickAttr.match(/filename=([^')]+)/);
          }
          
          // Pattern 3: If still no match, try matching until closing quote
          if (!match || !match[1]) {
            match = onclickAttr.match(/filename=([^'"]+)/);
          }
          
          if (match && match[1]) {
            filename = match[1].trim();
            console.log(`[debug] [page] Row ${rowIndex} - ✅ Extracted filename: ${filename.substring(0, 50)}...`);
            console.log(`[debug] [page] Row ${rowIndex} - Full filename length: ${filename.length} characters`);
            
            // Construct the full URL
            // Current URL might be: https://highcourtchd.gov.in/?mod=causelist
            // Target URL should be: https://highcourtchd.gov.in/show_cause_list.php?filename=...
            // Note: filename is already URL-encoded in the onclick, so use it as-is
            const urlObj = new URL(currentUrl);
            fullUrl = `${urlObj.protocol}//${urlObj.host}/show_cause_list.php?filename=${filename}`;
            console.log(`[debug] [page] Row ${rowIndex} - ✅ Constructed full URL: ${fullUrl.substring(0, 120)}...`);
          } else {
            console.log(`[debug] [page] Row ${rowIndex} - ❌ Could not extract filename from onclick`);
            console.log(`[debug] [page] Row ${rowIndex} - Full onclick value: ${onclickAttr}`);
            console.log(`[debug] [page] Row ${rowIndex} - onclick length: ${onclickAttr.length}`);
          }
        }
        
        // If still no URL, try href as fallback
        if (!fullUrl) {
          const href = dateLink.getAttribute('href');
          console.log(`[debug] [page] Row ${rowIndex} - href attribute: ${href || 'none'}`);
          
          if (href && href !== 'javascript:;') {
            if (href.startsWith('http')) {
              fullUrl = href;
            } else if (href.startsWith('/')) {
              fullUrl = baseUrl + href;
            } else {
              const urlObj = new URL(currentUrl);
              const path = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
              fullUrl = baseUrl + path + href;
            }
            console.log(`[debug] [page] Row ${rowIndex} - Constructed URL from href: ${fullUrl}`);
          }
        }
        
        // Second cell: List Type (e.g., "Mediation Drive List", "Urgent", "Ordinary", etc.)
        const listTypeCell = cells[1];
        const listType = listTypeCell ? listTypeCell.textContent.trim() : '';
        console.log(`[debug] [page] Row ${rowIndex} - List Type cell HTML: ${listTypeCell ? listTypeCell.innerHTML.substring(0, 100) : 'N/A'}...`);
        console.log(`[debug] [page] Row ${rowIndex} - List Type extracted: "${listType}"`);
        
        // Third cell: Main/Sup (e.g., "Main List" or "Supplementary List")
        const mainSupCell = cells[2];
        const mainSup = mainSupCell ? mainSupCell.textContent.trim() : '';
        console.log(`[debug] [page] Row ${rowIndex} - Main/Sup cell HTML: ${mainSupCell ? mainSupCell.innerHTML.substring(0, 100) : 'N/A'}...`);
        console.log(`[debug] [page] Row ${rowIndex} - Main/Sup extracted: "${mainSup}"`);
        
        // Validate that we have all required data
        const hasAllData = listDate && listType && mainSup;
        console.log(`[debug] [page] Row ${rowIndex} - Data validation:`);
        console.log(`[debug] [page]   - Has List Date: ${!!listDate} ("${listDate}")`);
        console.log(`[debug] [page]   - Has List Type: ${!!listType} ("${listType}")`);
        console.log(`[debug] [page]   - Has Main/Sup: ${!!mainSup} ("${mainSup}")`);
        console.log(`[debug] [page]   - Has URL: ${!!fullUrl}`);
        console.log(`[debug] [page]   - All data present: ${hasAllData}`);
        
        // Create link data object with all columns
        const linkData = {
          url: fullUrl || null,
          text: listDate || 'Cause List',
          filename: filename || null,
          listDate: listDate || '',
          listType: listType || '',
          mainSup: mainSup || ''
        };
        
        // Add the link if we have at least a URL OR all metadata
        // This ensures we capture all rows even if URL extraction fails
        if (fullUrl || hasAllData) {
          if (fullUrl) {
            console.log(`[debug] [page] ✅ Row ${rowIndex} - SUCCESS! Adding link with all data:`);
            console.log(`[debug] [page]   - List Date: "${linkData.listDate}"`);
            console.log(`[debug] [page]   - List Type: "${linkData.listType}"`);
            console.log(`[debug] [page]   - Main/Sup: "${linkData.mainSup}"`);
            console.log(`[debug] [page]   - URL: ${linkData.url.substring(0, 100)}...`);
            processedRows++;
          } else {
            console.log(`[debug] [page] ⚠️ Row ${rowIndex} - Adding row data without URL (URL extraction failed):`);
            console.log(`[debug] [page]   - List Date: "${linkData.listDate}"`);
            console.log(`[debug] [page]   - List Type: "${linkData.listType}"`);
            console.log(`[debug] [page]   - Main/Sup: "${linkData.mainSup}"`);
            errorRows++; // Count as error since URL is missing
          }
          
          links.push(linkData);
        } else {
          console.log(`[debug] [page] ❌ Row ${rowIndex} - SKIPPED: Missing critical data`);
          console.log(`[debug] [page]   - onclick exists: ${!!onclickAttr}`);
          console.log(`[debug] [page]   - onclick value: ${onclickAttr ? onclickAttr.substring(0, 100) : 'N/A'}...`);
          console.log(`[debug] [page]   - href: ${dateLink ? dateLink.getAttribute('href') || 'N/A' : 'N/A'}`);
          errorRows++;
        }
        
        console.log(`[debug] [page] ========== Finished processing row ${rowIndex} ==========`);
      });
      
      console.log(`[debug] [page] Extraction summary: ${processedRows} processed, ${skippedRows} skipped, ${errorRows} errors`);
      
      // Store debug info in a global variable accessible from outside
      window._extractionDebug = { processedRows, skippedRows, errorRows, totalRows: rows.length };
      
      return links;
    });
    
    // Get debug info if available
    const debugInfo = await page.evaluate(() => {
      return window._extractionDebug || {};
    });
    
    console.log(`[debug] [extractPdfLinks] Extraction completed:`);
    console.log(`[debug] [extractPdfLinks] - Processed rows: ${debugInfo.processedRows || 'N/A'}`);
    console.log(`[debug] [extractPdfLinks] - Skipped rows: ${debugInfo.skippedRows || 'N/A'}`);
    console.log(`[debug] [extractPdfLinks] - Error rows: ${debugInfo.errorRows || 'N/A'}`);
    console.log(`[debug] [extractPdfLinks] - Total rows in table: ${debugInfo.totalRows || 'N/A'}`);
    console.log(`[debug] [extractPdfLinks] - Total links found: ${pdfLinks.length}`);
    
    const pdfLinksArray = Array.isArray(pdfLinks) ? pdfLinks : [];
    
    // Add fallback values if metadata is missing
    pdfLinksArray.forEach(link => {
      if (!link.listDate && searchDate) {
        console.log(`[debug] [extractPdfLinks] Adding fallback date: ${searchDate}`);
        link.listDate = searchDate;
      }
      if (!link.listType && searchListType) {
        console.log(`[debug] [extractPdfLinks] Adding fallback listType: ${searchListType}`);
        link.listType = searchListType;
      }
    });
    
    console.log(`[info] [extractPdfLinks] ✅ Found ${pdfLinksArray.length} PDF link(s) with metadata`);
    
    if (pdfLinksArray.length > 0) {
      console.log('[debug] [extractPdfLinks] ========== PDF Links Summary (All Columns) ==========');
      pdfLinksArray.forEach((link, index) => {
        console.log(`[debug] [extractPdfLinks] Row ${index + 1}:`);
        console.log(`[debug] [extractPdfLinks]   - List Date: "${link.listDate || 'N/A'}"`);
        console.log(`[debug] [extractPdfLinks]   - List Type: "${link.listType || 'N/A'}"`);
        console.log(`[debug] [extractPdfLinks]   - Main/Sup: "${link.mainSup || 'N/A'}"`);
        console.log(`[debug] [extractPdfLinks]   - URL: ${link.url ? link.url.substring(0, 100) + '...' : 'N/A'}`);
        console.log(`[debug] [extractPdfLinks]   - Filename: ${link.filename || 'N/A'}`);
      });
      console.log('[debug] [extractPdfLinks] ========== End Summary ==========');
      
      // Count columns extracted
      const columnsExtracted = {
        listDate: pdfLinksArray.filter(l => l.listDate).length,
        listType: pdfLinksArray.filter(l => l.listType).length,
        mainSup: pdfLinksArray.filter(l => l.mainSup).length,
        url: pdfLinksArray.filter(l => l.url).length
      };
      console.log(`[info] [extractPdfLinks] Columns extraction summary:`);
      console.log(`[info] [extractPdfLinks]   - List Date: ${columnsExtracted.listDate}/${pdfLinksArray.length} rows`);
      console.log(`[info] [extractPdfLinks]   - List Type: ${columnsExtracted.listType}/${pdfLinksArray.length} rows`);
      console.log(`[info] [extractPdfLinks]   - Main/Sup: ${columnsExtracted.mainSup}/${pdfLinksArray.length} rows`);
      console.log(`[info] [extractPdfLinks]   - URL: ${columnsExtracted.url}/${pdfLinksArray.length} rows`);
    } else {
      console.log('[warning] [extractPdfLinks] ❌ No PDF links found in results');
      console.log('[debug] [extractPdfLinks] This could mean:');
      console.log('[debug] [extractPdfLinks]   1. Table#tables11 was not found');
      console.log('[debug] [extractPdfLinks]   2. Table exists but has no data rows');
      console.log('[debug] [extractPdfLinks]   3. Links in table don\'t have valid onclick handlers');
    }
    
    console.log('[debug] [extractPdfLinks] ========== Finished PDF link extraction ==========');
    return pdfLinksArray;
  } catch (error) {
    console.error('[error] [dataExtractor] Error extracting PDF links:', error.message);
    throw error;
  }
};

/**
 * Extract table data (if needed for additional information)
 * @param {Object} page - Page instance
 * @returns {Promise<Array>} - Array of table row data
 */
const extractTableData = async (page) => {
  console.log('[debug] [dataExtractor] Extracting table data...');
  
  try {
    const tableData = await page.evaluate(() => {
      const rows = [];
      // Only extract from the cause list table inside #show_causeList, not other tables
      const showCauseListDiv = document.querySelector('#show_causeList');
      if (!showCauseListDiv) {
        console.log('[debug] [page] #show_causeList div not found for tableData extraction');
        return rows;
      }
      
      const table = showCauseListDiv.querySelector('table#tables11');
      
      if (!table) {
        console.log('[debug] [page] table#tables11 not found inside #show_causeList for tableData extraction');
        return rows;
      }
      
      const tableRows = table.querySelectorAll('tbody tr, tr');
      
      tableRows.forEach((tr, index) => {
        const cells = tr.querySelectorAll('td, th');
        const rowData = {};
        
        cells.forEach((cell, cellIndex) => {
          const text = cell.textContent.trim();
          const header = tr.parentElement.querySelector(`th:nth-child(${cellIndex + 1})`)?.textContent.trim() || 
                        `column_${cellIndex + 1}`;
          
          // Check for links in the cell
          const link = cell.querySelector('a[href]');
          if (link) {
            const href = link.getAttribute('href');
            rowData[header] = {
              text: text,
              link: href
            };
          } else {
            rowData[header] = text;
          }
        });
        
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
      
      return rows;
    });
    
    console.log(`[info] [dataExtractor] Extracted ${tableData.length} table row(s)`);
    return tableData;
  } catch (error) {
    console.error('[error] [dataExtractor] Error extracting table data:', error.message);
    return [];
  }
};

module.exports = {
  waitForResults,
  extractPdfLinks,
  extractTableData
};

