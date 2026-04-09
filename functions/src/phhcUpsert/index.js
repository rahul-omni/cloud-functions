const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const functions = require("firebase-functions");
const { defineSecret } = require('firebase-functions/params');
const regionFunctions = functions.region('asia-south1');
const { PHHCJudgmentsScrapper } = require('./phhcScrapper');
const { getCaseDetails, connectToDatabase, updateJudgmentUrl } = require("./components/database");
const { scrapingDetails } = require("./scrapingDetails");

// Secret: DATABASE_URL in Secret Manager (production); .env DATABASE_URL for local/emulator
const databaseUrlSecret = defineSecret('DATABASE_URL');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
  secrets: [databaseUrlSecret],
};

exports.phhcUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    let dbClient;
    let endedInError = false;

    const connectionString = databaseUrlSecret.value() || process.env.DATABASE_URL;
    if (!connectionString || !connectionString.trim()) {
      console.error('DATABASE_URL not set (Secret Manager or .env)');
      return res.status(500).send({
        message: 'Database configuration missing',
        error: 'Set DATABASE_URL in Secret Manager (production) or .env (local)'
      });
    }
    
    try {
      const id = req.body.id || null;
      console.log('Received ID:', id);
      
      if (id) {
        // Case-specific scraping
        dbClient = await connectToDatabase(connectionString);
        const caseDetails = await getCaseDetails(dbClient, id);
        
        if (!caseDetails) {
          return res.status(404).send({
            message: 'Case not found',
            error: `No case found with id: ${id}`
          });
        }
        
        const {
          diary_number,
          case_type
        } = caseDetails;
        
        // Pass the original id and diary_number to scrapingDetails; connectionString for DB
        const result = await scrapingDetails(null, diary_number, case_type, id, null, connectionString);
        console.log('Scraping result:', result);
        
        if (!result || result.length == 0) {
          await updateJudgmentUrl(dbClient, id, {orders: []}, 2);
        }
        
        return res.send({
          message: 'PHHC case scraping completed',
          result: result
        });
        
      } else {
        // Bulk scraping by date (optional - can be extended)
        let date = req.body.date || null;
        let caseType = req.body.caseType || null;
        let caseNumber = req.body.caseNumber || null;
        let caseYear = req.body.caseYear || null;
        
        if (!date && !caseType && !caseNumber && !caseYear) {
          return res.status(400).send({
            message: 'Missing parameters',
            error: 'Please provide either id, or date/caseType/caseNumber/caseYear for bulk scraping'
          });
        }
        
        if (!date) {
          const today = new Date();
          date = [
            String(today.getDate()).padStart(2, "0"),
            String(today.getMonth() + 1).padStart(2, "0"),
            today.getFullYear()
          ].join("-");
        }
        
        console.log("[info] [phhcUpsert] payload body:", { date, caseType, caseNumber, caseYear });
        await PHHCJudgmentsScrapper(date, caseType, caseNumber, caseYear, connectionString);
      }

    } catch (error) {
      endedInError = true;
      console.error('❌  Error:', error.message);
      console.log(`[error] [phhcUpsert]: ${error}`);
      
      if (dbClient && req.body.id) {
        try {
          await updateJudgmentUrl(dbClient, req.body.id, {orders: []}, 2);
        } catch (updateError) {
          console.error('Error updating judgment URL:', updateError.message);
        }
      }
      
      res.status(500).send({
        message: 'Error fetching PHHC judgments',
        error: error.message
      });
      return;
    } finally {
      if (dbClient) {
        try {
          await dbClient.end();
        } catch (dbCloseError) {
          console.error('Error closing database:', dbCloseError.message);
        }
      }
      console.log(
        endedInError
          ? '[end] [phhcUpsert] request finished (500 or error path)'
          : '[end] [phhcUpsert] request finished'
      );
    }

    res.send({
      message: 'PHHC judgments fetched successfully',
      result: result
    });
  });

