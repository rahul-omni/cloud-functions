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

function parseDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function runBackwardScraper(
  startDate,
  endDate,
  court,
  bench
) {
  let current = parseDate(startDate);
  const end = parseDate(endDate);

  while (current >= end) {
    const dateStr = formatDate(current);

    console.log(`📅 Scraping for date: ${dateStr}`);

    try {
      await HighCourtJudgmentsScrapper(dateStr, court, bench);
    } catch (err) {
      console.error(`❌ Failed for ${dateStr}:`, err.message);
    }

    // ⏳ optional delay to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));

    // ⬅️ move one day backward
    current.setDate(current.getDate() - 1);
  }

  console.log("✅ Backward scraping completed");
}


runBackwardScraper('16-12-2025', '01-01-2025', 'High Court of Delhi', 'Principal Bench at Delhi')