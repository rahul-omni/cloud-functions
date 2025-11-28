/**
 * Utility functions for NCLT cause list scraping
 */

/**
 * Get page information for debugging
 * @param {Object} page - Puppeteer page instance
 */
async function getPageInfo(page) {
    try {
        const pageInfo = await page.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                hasForm: !!document.querySelector('form'),
                hasTables: document.querySelectorAll('table').length,
                bodyText: document.body.textContent.substring(0, 300)
            };
        });
        
        console.log('[debug] Page info:', pageInfo);
        return pageInfo;
    } catch (error) {
        console.error('[debug] Error getting page info:', error.message);
        return null;
    }
}

/**
 * Validate if the response page contains cause list data
 * @param {Object} page - Puppeteer page instance
 * @returns {boolean} Whether page contains valid cause list data
 */
async function validateResponse(page) {
    try {
        const validation = await page.evaluate(() => {
            const bodyText = document.body.textContent.toLowerCase();
            const tables = document.querySelectorAll('table');
            
            // Check for error messages
            const hasError = bodyText.includes('no records found') ||
                           bodyText.includes('no data found') ||
                           bodyText.includes('error') ||
                           bodyText.includes('invalid');
            
            // Check for cause list indicators
            const hasCauseListContent = bodyText.includes('cause list') ||
                                      bodyText.includes('case') ||
                                      bodyText.includes('petitioner') ||
                                      bodyText.includes('respondent') ||
                                      tables.length > 0;
            
            return {
                hasError,
                hasCauseListContent,
                tableCount: tables.length,
                isValid: !hasError && hasCauseListContent
            };
        });
        
        console.log('[validate] Response validation:', validation);
        
        if (validation.hasError) {
            console.log('[validate] ❌ Error detected in response');
            return false;
        }
        
        if (!validation.hasCauseListContent) {
            console.log('[validate] ❌ No cause list content found');
            return false;
        }
        
        console.log('[validate] ✅ Valid cause list response detected');
        return true;
        
    } catch (error) {
        console.error('[validate] ❌ Error validating response:', error.message);
        return false;
    }
}

/**
 * Wait for element with timeout and retry
 * @param {Object} page - Puppeteer page instance
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @returns {boolean} Whether element was found
 */
async function waitForElement(page, selector, timeout = 10000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        console.log(`[wait] Element ${selector} not found within ${timeout}ms`);
        return false;
    }
}

/**
 * Safe click with retry mechanism
 * @param {Object} page - Puppeteer page instance
 * @param {string} selector - CSS selector
 * @param {number} retries - Number of retry attempts
 */
async function safeClick(page, selector, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            await page.click(selector);
            console.log(`[click] ✅ Successfully clicked: ${selector}`);
            return true;
        } catch (error) {
            console.log(`[click] Attempt ${i + 1} failed for ${selector}: ${error.message}`);
            if (i === retries - 1) {
                throw error;
            }
            await page.waitForTimeout(1000);
        }
    }
    return false;
}

/**
 * Format date for NCLT system
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Formatted date
 */
function formatDateForNCLT(dateString) {
    try {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch (error) {
        console.error('[date] Error formatting date:', error.message);
        return dateString;
    }
}

/**
 * Clean text content
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
        .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
        .replace(/\n+/g, ' ')           // Replace newlines with space
        .replace(/\t+/g, ' ')           // Replace tabs with space
        .trim();                        // Remove leading/trailing whitespace
}

module.exports = {
    getPageInfo,
    validateResponse,
    waitForElement,
    safeClick,
    formatDateForNCLT,
    cleanText
};
