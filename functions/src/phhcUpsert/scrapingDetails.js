const { connectToDatabase } = require('./components/database');
const { initializeBrowser, navigateToSearchPage, fillCaseSearchForm, submitSearchForm, extractCaseLinks } = require('./components/browser');
const { extractCaseDetails, processCaseAndInsertToDB } = require('./components/scraper');
const { destructureDiaryNumber } = require('./components/utils');
const { getCaseTypeCode } = require('./components/mapping');

// Main PHHC scraper function for specific case (by diary number)
// originalCaseId: The database ID of the case to update (if provided)
// originalDiaryNumber: The original diary number format (e.g., "4112/2025") used to construct case number
const scrapingDetails = async (date, diaryNumber, caseTypeValue, originalCaseId = null, originalDiaryNumber = null) => {
    console.log(`[start] [scrapingDetails] Scraping PHHC case for diary number: ${diaryNumber}`);
    if (originalCaseId) {
        console.log(`[scrapingDetails] Will update existing case with id: ${originalCaseId}`);
    }

    let dbClient;
    try {
        dbClient = await connectToDatabase();
        console.log('✅  Connected to database');
    } catch (dbError) {
        console.error('❌  Database setup failed:', dbError.message);
        console.log('⚠️   Continuing without database...');
    }

    const { browser, page } = await initializeBrowser();
    let results = [];

    try {
        // Parse diary number to get diary number and year
        const { diary_number, date } = destructureDiaryNumber(diaryNumber);
        const caseYear = date; // Use date as caseYear
        
        // Get case type code from mapping
        const caseTypeCode = getCaseTypeCode(caseTypeValue) || caseTypeValue;
        
        console.log(`[scrapingDetails] Parsed values: diary_number=${diary_number}, caseYear=${caseYear}, caseTypeCode=${caseTypeCode}`);
        
        if (!caseTypeCode) {
            throw new Error(`Case type code not found for: ${caseTypeValue}`);
        }
        
        // Navigate to search page
        await navigateToSearchPage(page);

        // Fill and submit form with parsed values
        await fillCaseSearchForm(page, caseTypeCode, diary_number, caseYear);
        await submitSearchForm(page);

        // Extract case links
        const caseLinks = await extractCaseLinks(page);
        
        if (caseLinks.length === 0) {
            console.log('[scrapingDetails] No cases found for diary number:', diaryNumber);
            return [];
        }

        console.log(`[scrapingDetails] Found ${caseLinks.length} case(s) to process`);

        console.log('caseLinks', caseLinks);
        // Get cookies for PDF downloads
        const cookies = await page.cookies();

        // Process each case
        for (const caseLink of caseLinks) {
            try {
                console.log(`[scrapingDetails] Processing case: ${caseLink.caseId}`);
                
                const caseData = await extractCaseDetails(page, caseLink.fullUrl);
                
                console.log('caseData from caseLink', caseData);
                if (caseData) {
                    // Pass original case ID and diary number for updating the correct record
                    const processResults = await processCaseAndInsertToDB(
                        caseData, 
                        cookies, 
                        dbClient, 
                        originalCaseId, 
                        originalDiaryNumber || diaryNumber,
                        caseTypeValue
                    );
                    if (processResults) {
                        results = results.concat(processResults);
                    }
                }
                
                // Wait between cases
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ [scrapingDetails] Error processing case ${caseLink.caseId}:`, error.message);
            }
        }

        return results;

    } catch (error) {
        console.error('❌  Error:', error.message);
        console.log(`[error] [scrapingDetails]: ${error}`);
        return [];
    } finally {
        await browser.close();
        console.log("[end] [scrapingDetails] PHHC Scraping completed successfully");
        
        if (dbClient) {
            try {
                await dbClient.end();
                console.log('✅  Database connection closed');
            } catch (dbCloseError) {
                console.error('❌  Error closing database connection:', dbCloseError.message);
            }
        }
    }
};

module.exports = {
    scrapingDetails
};

