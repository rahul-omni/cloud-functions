const { wait } = require('./utils');

/**
 * Wait for results to load and count PDF links
 * @param {Object} page - Page instance
 * @returns {Promise<number>} - Number of PDF links found
 */
const waitForResults = async (page) => {
  console.log('[debug] [dataExtractor] Waiting for results to load...');

  await page.waitForFunction(
    () => {
      const links = document.querySelectorAll('td strong a[href*="display_causelist_pdf.php"]');
      const error = document.querySelector('.error-message, .alert-danger');
      if (error) throw new Error(error.innerText);
      return links.length > 0;
    },
    { timeout: 120_000 }
  );

  console.log('[debug] [dataExtractor] Results loaded successfully');

  // Extract the PDF links
  const pdfLinks = await page.evaluate(() => {
    const baseUrl = window.location.origin + '/hcservices/';
    const links = Array.from(document.querySelectorAll('td strong a[href*="display_causelist_pdf.php"]'));
    return links.map(link => baseUrl + link.getAttribute('href').replace(/&amp;/g, '&'));
  });

  console.log(`[info] [dataExtractor] Found ${pdfLinks.length} PDF cause list(s)`);
  console.log('[debug] [dataExtractor] PDF Links:', pdfLinks);

  // Optional: wait a bit for table to fully load
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('[debug] [dataExtractor] Table loading wait completed');

  return pdfLinks;
};

/**
 * Extract table data from the results page
 * @param {Object} page - Page instance
 * @returns {Promise<Array>} - Array of extracted row data
 */
const extractTableData = async (page) => {
  console.log('[debug] [dataExtractor] Starting table data extraction...');
  const rows = await page.evaluate(() => {
    console.log('[debug] [page] Starting table extraction...');
    const rows = document.querySelectorAll('table tbody tr');
    console.log(`[debug] [page] Found ${rows.length} table rows`);
    
    return Array.from(rows).map((tr, index) => {
      console.log(`[debug] [page] Processing row ${index + 1}`);
      const obj = {};
      
      // Extract data from table cells using data-th attributes
      const cells = tr.querySelectorAll('td');
      console.log(`[debug] [page] Row ${index + 1} has ${cells.length} cells`);
      
      cells.forEach((td, cellIndex) => {
        const label = td.getAttribute('data-th');
        if (label) {
          // Get text content from the span.bt-content or direct text
          const spanContent = td.querySelector('.bt-content');
          const cellText = spanContent ? spanContent.textContent.trim() : td.textContent.trim();
          obj[label.trim()] = cellText.replace(/\s+/g, ' ') || null;
          console.log(`[debug] [page] Cell ${cellIndex + 1}: ${label.trim()} = "${cellText}"`);
        }
      });
      
      // Extract links to cause list files from the File column
      const fileCell = tr.querySelector('td[data-th="File"]');
      let causeListLinks = [];
      
      if (fileCell) {
        const links = fileCell.querySelectorAll('a[href*=".pdf" i]');
        console.log(`[debug] [page] Row ${index + 1} has ${links.length} PDF links in File column`);
        
        causeListLinks = Array.from(links, (a, linkIndex) => {
          const linkData = { 
            text: a.textContent.trim(), 
            url: a.href,
            filename: a.href.split('/').pop() || a.href
          };
          console.log(`[debug] [page] Link ${linkIndex + 1}: ${linkData.text} -> ${linkData.filename}`);
          return linkData;
        });
      }
      
      obj.causeListLinks = causeListLinks;
      
      // Add row ID if available
      if (tr.id) {
        obj.rowId = tr.id;
        console.log(`[debug] [page] Row ${index + 1} has ID: ${tr.id}`);
      }
      
      console.log(`[debug] [page] Row ${index + 1} processed, keys: ${Object.keys(obj).join(', ')}`);
      return obj;
    })
    .filter(row => {
      // Filter out rows that don't have Serial Number
      const hasSerialNumber = row["Serial Number"] && row["Serial Number"].trim();
      
      // Only include rows that have serial number
      return hasSerialNumber;
    });
  });
  console.log(`[debug] [dataExtractor] Table extraction completed, got ${rows.length} filtered rows`);

  if (rows.length === 0) {
    console.log('[warning] [dataExtractor] No valid case data found in website');
  } else {
    console.log(`[info] [dataExtractor] Successfully extracted ${rows.length} case rows`);       
  }

  return rows;
};

module.exports = {
  waitForResults,
  extractTableData
};
