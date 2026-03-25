const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { getDatabaseUrlFromSecretManager } = require('../config/getOpenAiKeyFromSecretManager');
const { DistrictCourtJudgmentsScrapper } = require('./districtCourtScrapper');
const { connectToDatabase, markSyncError, closeDatabase } = require('./components/database');

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.gurugramDistrictCourtUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    let connectionString;
    try {
      connectionString = await getDatabaseUrlFromSecretManager(undefined, 'DATABASE_URL', 'gurugramDistrictCourt');
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

    let caseId;
    try {
      console.log("[start] [gurugramDistrictCourtUpsert] req.body", req.body);
      caseId = req.body?.id;
      const date = req.body?.date || new Date().toISOString().split('T')[0];
      const diaryNumber = req.body?.diaryNumber;
      const courtName = req.body?.courtName || req.body?.districtCourt;
      const caseTypeValue = req.body?.caseTypeValue;
      const courtComplex = req.body?.courtComplex;

      console.log(`[params] Extracted parameters:`, {
        caseId,
        date,
        diaryNumber,
        courtName,
        caseTypeValue,
        courtComplex
      });

      if (!courtName && !diaryNumber && !caseTypeValue && !courtComplex) {
        throw new Error('District Court name is required (courtName or districtCourt field)');
      } else if (!date) {
        throw new Error('Date is required');
      }

      result = await DistrictCourtJudgmentsScrapper(date, diaryNumber, courtName, caseTypeValue, courtComplex, caseId, connectionString);
    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [gurugramDistrictCourtUpsert]: ${error}`);
      if (caseId && connectionString) {
        try {
          const errClient = await connectToDatabase(connectionString);
          await markSyncError(errClient, caseId);
          await closeDatabase(errClient);
          console.log('[gurugramDistrictCourtUpsert] Case marked as sync error (site_sync = 2)');
        } catch (markErr) {
          console.error('[gurugramDistrictCourtUpsert] Failed to mark sync error:', markErr.message);
        }
      }
      res.status(500).send({
        message: 'Error fetching district court judgments',
        error: error.message
      });
      return;
    } finally {
      console.log("[end] [gurugramDistrictCourtUpsert] District Court Scraping completed successfully");
    }

    res.send({
      message: 'Gurugram District Court judgments upserted successfully',
      result: result
    });
  });
