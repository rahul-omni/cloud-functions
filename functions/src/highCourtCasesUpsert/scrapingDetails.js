const { connectToDatabase } = require('./components/database');
const { initializeBrowser, setupDialogHandler, navigateToMainPage, selectHighCourt, selectPrincipalBench, setDateFields, setDiaryNumberFields } = require('./components/browser');
const { scrapeData } = require('./components/scraper');

// Main high court scraper function
// connectionString: PostgreSQL URL from Secret Manager or .env (required when DB is needed)
const scrapingDetails = async (date, diaryNumber, highCourtname, bench, caseTypeValue, connectionString = null) => {
    console.log(`[start] [HighCourtJudgmentsScrapper] Scraping high court judgments for: ${date}`);

    let dbClient;
    if (connectionString) {
        try {
            dbClient = await connectToDatabase(connectionString);
            console.log('✅  Connected to database');
        } catch (dbError) {
            console.error('❌  Database setup failed:', dbError.message);
            console.log('⚠️   Continuing without database...');
        }
    }

    // Initialize browser
    const { browser, page } = await initializeBrowser();

    // Setup dialog handler
    let modalHandled = setupDialogHandler(page);


    try {
        // Navigate to main page and handle initial setup
        modalHandled = await navigateToMainPage(page, modalHandled);

        // Select High Court of Delhi
        await selectHighCourt(page, highCourtname);

        // Select Principal Bench at Delhi
        await selectPrincipalBench(page, bench);

        if (diaryNumber) {
            // Set diary number fields
            await setDiaryNumberFields(page, diaryNumber, caseTypeValue);
        } else {
            return
        }

        // Scrape data
        const results = await scrapeData(page, date, dbClient);

        return results;
    } catch (error) {
        console.error('❌  Error:', error.message);
        console.log(`[error] [HighCourtJudgmentsScrapper]: ${error}`);
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
    scrapingDetails
}; 