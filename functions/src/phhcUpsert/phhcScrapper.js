const { connectToDatabase } = require('./components/database');
const { initializeBrowser, navigateToSearchPage, fillCaseSearchForm, submitSearchForm, extractCaseLinks } = require('./components/browser');
const { extractCaseDetails, processCaseAndInsertToDB } = require('./components/scraper');

// Main PHHC scraper function - for date-based scraping (bulk)
const PHHCJudgmentsScrapper = async (date, caseType, caseNumber, caseYear) => {
    console.log(`[start] [PHHCJudgmentsScrapper] Scraping PHHC judgments for: ${date || 'specific case'}`);

    let dbClient;
    try {
        dbClient = await connectToDatabase();
        console.log('✅  Connected to database');
    } catch (dbError) {
        console.error('❌  Database setup failed:', dbError.message);
        console.log('⚠️   Continuing without database...');
    }

    const { browser, page } = await initializeBrowser();
    let allResults = [];

    try {
        // Navigate to search page
        await navigateToSearchPage(page);

        // Fill and submit form
        await fillCaseSearchForm(page, caseType, caseNumber, caseYear);
        await submitSearchForm(page);

        // Extract case links
        const caseLinks = await extractCaseLinks(page);
        
        if (caseLinks.length === 0) {
            console.log('[PHHCJudgmentsScrapper] No cases found');
            return { processedResults: [] };
        }

        console.log(`[PHHCJudgmentsScrapper] Found ${caseLinks.length} case(s) to process`);

        // Get cookies for PDF downloads
        const cookies = await page.cookies();

        // Process each case
        for (const caseLink of caseLinks) {
            try {
                console.log(`[PHHCJudgmentsScrapper] Processing case: ${caseLink.caseId}`);
                
                const caseData = await extractCaseDetails(page, caseLink.fullUrl);
                
                if (caseData) {
                    const results = await processCaseAndInsertToDB(caseData, cookies, dbClient);
                    if (results) {
                        allResults = allResults.concat(results);
                    }
                }
                
                // Wait between cases to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ [PHHCJudgmentsScrapper] Error processing case ${caseLink.caseId}:`, error.message);
            }
        }

        return { processedResults: allResults };

    } catch (error) {
        console.error('❌  Error:', error.message);
        console.log(`[error] [PHHCJudgmentsScrapper]: ${error}`);
        throw error;
    } finally {
        await browser.close();
        console.log("[end] [PHHCJudgmentsScrapper] PHHC Scraping completed successfully");
        
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
    PHHCJudgmentsScrapper
};

