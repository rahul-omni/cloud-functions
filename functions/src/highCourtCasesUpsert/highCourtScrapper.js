const { connectToDatabase } = require('./components/database');
const { initializeBrowser, setupDialogHandler, navigateToMainPage, selectHighCourt, selectPrincipalBench, setDateFields, setDiaryNumberFields } = require('./components/browser');
const { scrapeData } = require('./components/scraper');

// Main high court scraper function
const HighCourtJudgmentsScrapper = async (date, highCourtname, bench) => {
    console.log(`[start] [HighCourtJudgmentsScrapper] Scraping high court judgments for: ${date}`);

    let dbClient;
    try {
        dbClient = await connectToDatabase();
        console.log('✅  Connected to database');
    } catch (dbError) {
        console.error('❌  Database setup failed:', dbError.message);
        console.log('⚠️   Continuing without database...');
    }

    // Initialize browser
    const { browser, page } = await initializeBrowser();
    
    // Setup dialog handler
    let modalHandled = setupDialogHandler(page);


    try {
        // Navigate to main page and handle initial setup
        modalHandled = await navigateToMainPage(page, modalHandled);

        // Select High Court of Delhi
        await selectHighCourt(page, highCourtname );

        // Select Principal Bench at Delhi
        await selectPrincipalBench(page, bench);
            // Set date fields
        await setDateFields(page, date);

        // Scrape data
        const results = await scrapeData(page, date, dbClient);

        return results;
            } catch (error) {
        console.error('❌  Error:', error.message);
        console.log(`[error] [HighCourtJudgmentsScrapper]: ${error}`);
        throw error;
    } finally {
        await browser.close();
        console.log("[end] [HighCourtJudgmentsScrapper] High Court Scraping completed successfully");
        
        // Close database connection
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
    HighCourtJudgmentsScrapper
}; 