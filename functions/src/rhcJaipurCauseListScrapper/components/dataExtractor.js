const { wait } = require('./utils');

/**
 * Wait for results table to load
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const waitForResults = async (page) => {
  console.log('[debug] [waitForResults] ========== Starting wait for results ==========');
  
  try {
    console.log('[debug] [waitForResults] Waiting for table#causelist-table to appear...');
    await page.waitForSelector('#causelist-table', { visible: true, timeout: 300000 }); // 5 minutes timeout
    console.log('[debug] [waitForResults] ✅ Found table#causelist-table');
    
    console.log('[debug] [waitForResults] Waiting 3 seconds for table content to render...');
    await wait(3000);
    
    // Check if table has rows
    const tableInfo = await page.evaluate(() => {
      const table = document.querySelector('#causelist-table');
      if (!table) return { exists: false };
      
      const tbody = table.querySelector('tbody');
      if (!tbody) return { exists: true, hasTbody: false };
      
      const rows = tbody.querySelectorAll('tr');
      return {
        exists: true,
        hasTbody: true,
        rowCount: rows.length,
        hasButtons: rows.length > 0 ? rows[0].querySelectorAll('.view-button').length > 0 : false
      };
    });
    
    console.log('[debug] [waitForResults] Table structure:', JSON.stringify(tableInfo, null, 2));
    
    if (!tableInfo.exists) {
      throw new Error('Table#causelist-table does not exist');
    }
    
    if (tableInfo.rowCount === 0) {
      console.log('[warning] [waitForResults] ⚠️ Table found but has no rows');
    } else {
      console.log(`[debug] [waitForResults] ✅ Table has ${tableInfo.rowCount} rows - looks good!`);
    }
  } catch (error) {
    console.log(`[warning] [waitForResults] ⚠️ Timeout waiting for table: ${error.message}`);
    throw error;
  }
  
  console.log('[debug] [waitForResults] ========== Finished waiting for results ==========');
};

/**
 * Extract PDF links from the results table
 * @param {Object} page - Page instance
 * @param {string} searchDate - Date used for search (for fallback)
 * @returns {Promise<Array>} - Array of PDF link objects
 */
const extractPdfLinks = async (page, searchDate = null) => {
  console.log('[debug] [extractPdfLinks] ========== Starting PDF link extraction ==========');
  console.log(`[debug] [extractPdfLinks] Search date: ${searchDate}`);
  
  try {
    const pdfLinks = await page.evaluate((searchDate) => {
      const links = [];
      const baseUrl = window.location.origin;
      console.log(`[debug] [page] Base URL: ${baseUrl}`);
      
      const table = document.querySelector('#causelist-table');
      if (!table) {
        console.log('[debug] [page] ❌ Table#causelist-table not found');
        return links;
      }
      
      const tbody = table.querySelector('tbody');
      if (!tbody) {
        console.log('[debug] [page] ❌ Table tbody not found');
        return links;
      }
      
      const rows = tbody.querySelectorAll('tr');
      console.log(`[debug] [page] Found ${rows.length} rows in table`);
      
      rows.forEach((row, rowIndex) => {
        console.log(`[debug] [page] ========== Processing row ${rowIndex} ==========`);
        
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) {
          console.log(`[debug] [page] ⚠️ Row ${rowIndex} has ${cells.length} cells (expected 3), skipping`);
          return;
        }
        
        const courtNo = cells[0].textContent.trim();
        const judges = cells[1].textContent.trim();
        const causelistTypeCell = cells[2];
        
        console.log(`[debug] [page] Row ${rowIndex} - Court No.: ${courtNo}, Judges: ${judges.substring(0, 50)}...`);
        
        // Check if causelist is available
        if (causelistTypeCell.textContent.trim() === 'Causelist Not Available') {
          console.log(`[debug] [page] Row ${rowIndex} - Causelist not available, skipping`);
          return;
        }
        
        // Find all view buttons in this row
        const viewButtons = causelistTypeCell.querySelectorAll('.view-button');
        console.log(`[debug] [page] Row ${rowIndex} - Found ${viewButtons.length} view button(s)`);
        
        viewButtons.forEach((button, btnIndex) => {
          const pdfPath = button.getAttribute('data-pdfpath');
          const linkType = button.textContent.trim(); // "D" or "S"
          
          if (!pdfPath) {
            console.log(`[debug] [page] Row ${rowIndex}, Button ${btnIndex} - No data-pdfpath attribute`);
            return;
          }
          
          console.log(`[debug] [page] Row ${rowIndex}, Button ${btnIndex} - PDF path: ${pdfPath.substring(0, 50)}..., Type: ${linkType}`);
          
          // Decode base64 path
          let decodedPath;
          try {
            decodedPath = atob(pdfPath);
            console.log(`[debug] [page] Row ${rowIndex}, Button ${btnIndex} - Decoded path: ${decodedPath}`);
          } catch (e) {
            console.log(`[debug] [page] Row ${rowIndex}, Button ${btnIndex} - Failed to decode base64: ${e.message}`);
            // Try using path as-is
            decodedPath = pdfPath;
          }
          
          // Construct full URL
          // Based on the JavaScript code, PDFs are accessed via: ?path=encodedPath
          // The decoded path is like: /home/court/jaipur/causelist_report/2025/03102025_1950_1001.pdf
          // But we need to use the base64 encoded path in the URL parameter
          const fullUrl = `${baseUrl}/quick-causelist-jp/?path=${encodeURIComponent(pdfPath)}`;
          
          console.log(`[debug] [page] Row ${rowIndex}, Button ${btnIndex} - Full URL: ${fullUrl}`);
          
          // Determine mainSup based on link type
          // D = Daily/Main, S = Supplementary
          const mainSup = linkType === 'D' ? 'Main List' : 'Supplementary List';
          
          links.push({
            url: fullUrl,
            pdfPath: pdfPath,
            decodedPath: decodedPath,
            listDate: searchDate || null,
            mainSup: mainSup,
            courtNo: courtNo,
            judges: judges,
            linkType: linkType, // "D" or "S" - keep for reference
            text: `${courtNo} - ${judges.substring(0, 30)}... (${linkType})`
          });
          
          console.log(`[debug] [page] ✅ Row ${rowIndex}, Button ${btnIndex} - Added link`);
        });
        
        console.log(`[debug] [page] ========== Finished processing row ${rowIndex} ==========`);
      });
      
      console.log(`[debug] [page] Extraction completed. Total links: ${links.length}`);
      return links;
    }, searchDate);
    
    console.log(`[info] [extractPdfLinks] ✅ Found ${pdfLinks.length} PDF link(s)`);
    
    if (pdfLinks.length > 0) {
      console.log('[debug] [extractPdfLinks] PDF Links summary:');
      pdfLinks.forEach((link, index) => {
        console.log(`[debug] [extractPdfLinks] Link ${index + 1}:`);
        console.log(`[debug] [extractPdfLinks]   - Court: ${link.courtNo}`);
        console.log(`[debug] [extractPdfLinks]   - Link Type: ${link.linkType} (${link.mainSup})`);
        console.log(`[debug] [extractPdfLinks]   - Main/Sup: ${link.mainSup}`);
        console.log(`[debug] [extractPdfLinks]   - URL: ${link.url.substring(0, 100)}...`);
      });
    } else {
      console.log('[warning] [extractPdfLinks] ❌ No PDF links found in results');
    }
    
    return pdfLinks;
  } catch (error) {
    console.error('[error] [extractPdfLinks] Error extracting PDF links:', error.message);
    throw error;
  }
};

module.exports = { waitForResults, extractPdfLinks };

