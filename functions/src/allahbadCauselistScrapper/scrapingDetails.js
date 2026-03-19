const { connectToDatabase } = require('./components/database');
const { initializeBrowser, setupDialogHandler, navigateToMainPage, selectHighCourt, selectPrincipalBench, setDateFields, setDiaryNumberFields } = require('./components/browser');
const { scrapeData, getCasesFromPDF } = require('./components/scraper');

// Main high court scraper function
const scrapingDetails = async () => {

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
        const link = await navigateToMainPage(page, modalHandled);

        const cases = await getCasesFromPDF(link);

        console.log('Scraping results:', cases);

        return cases;
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

scrapingDetails()