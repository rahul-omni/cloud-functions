const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { getDatabaseUrlFromSecretManager } = require('../config/getOpenAiKeyFromSecretManager');
const { HighCourtJudgmentsScrapper } = require('./highCourtScrapper');
const { getCaseDetails, connectToDatabase, updateJudgmentUrl } = require("./components/database");
const { scrapingDetails } = require("./scrapingDetails");

// Runtime options - no defineSecret; uses secretManagerV2 (bootstrap SA) for cross-project secrets
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.highCourtCasesUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    let dbClient;

    let connectionString;
    try {
      connectionString = await getDatabaseUrlFromSecretManager(undefined, 'DATABASE_URL', 'highCourtCasesUpsert');
    } catch (secretErr) {
      connectionString = process.env.DATABASE_URL;
    }
    if (!connectionString || !connectionString.trim()) {
      console.error('DATABASE_URL not set (Secret Manager V2 or .env)');
      return res.status(500).send({
        message: 'Database configuration missing',
        error: 'Set DATABASE_URL in Secret Manager (V2) or .env (local). Ensure secret-manager-v2-credential bootstrap exists.'
      });
    }

    try {
      const id = req.body.id || null;
      console.log('Received ID:', id);
      if (id) {
        dbClient = await connectToDatabase(connectionString);
        const caseDetails = await getCaseDetails(dbClient, id);
        const {
          diary_number,
          case_type
        } = caseDetails;
       const result = await scrapingDetails(null, diary_number, "High Court of Delhi", "Principal Bench at Delhi", case_type, connectionString);
       console.log('Scraping result:', result);
       if (!result || result.length == 0) {
        await updateJudgmentUrl(dbClient, id, {orders: []}, 2);
       }
      } else {
        let date = req.body.date || null;
        if (!date) {
          const today = new Date();
          date = [
            String(today.getDate()).padStart(2, "0"),
            String(today.getMonth() + 1).padStart(2, "0"),
            today.getFullYear()
          ].join("-");
        }
        console.log("[info] [highCourtCasesUpsert] payload body at: date", date);
        await HighCourtJudgmentsScrapper(date, "High Court of Delhi", "Principal Bench at Delhi", connectionString);
      }

    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [highCourtCasesUpsert]: ${error}`);
      if (dbClient && req.body.id) {
        try {
          await updateJudgmentUrl(dbClient, req.body.id, {orders: []}, 2);
        } catch (updateError) {
          console.error('Error updating judgment URL:', updateError.message);
        }
      }
      return res.status(500).send({
        message: 'Error fetching high court judgments',
        error: error.message
      });
    } finally {
      if (dbClient) {
        try {
          await dbClient.end();
        } catch (dbCloseError) {
          console.error('Error closing database:', dbCloseError.message);
        }
      }
      console.log("[end] [fetchHighCourtJudgments] High Court Scraping completed successfully");
    }

    res.send(
      {
        message: 'High Court judgments fetched successfully',
        result: result
      }
    );
  });
