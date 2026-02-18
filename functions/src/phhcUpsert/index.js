const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { PHHCJudgmentsScrapper } = require('./phhcScrapper');
const { getCaseDetails, connectToDatabase, updateJudgmentUrl } = require("./components/database");
const { scrapingDetails } = require("./scrapingDetails");

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.phhcUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    let dbClient;
    
    try {
      const id = req.body.id || null;
      console.log('Received ID:', id);
      
      if (id) {
        // Case-specific scraping
        dbClient = await connectToDatabase();
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
        
        // Pass the original id and diary_number to scrapingDetails
        const result = await scrapingDetails(null, diary_number, case_type, id);
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
        await PHHCJudgmentsScrapper(date, caseType, caseNumber, caseYear);
      }

    } catch (error) {
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
      console.log("[end] [phhcUpsert] PHHC Scraping completed successfully");
    }

    res.send({
      message: 'PHHC judgments fetched successfully',
      result: result
    });
  });

