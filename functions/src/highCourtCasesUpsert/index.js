const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { HighCourtJudgmentsScrapper } = require('./highCourtScrapper');
const { getCaseDetails, connectToDatabase, updateJudgmentUrl } = require("./components/database");
const { scrapingDetails } = require("./scrapingDetails");

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.highCourtCasesUpsert = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    try {

      const id = req.body.id || null;
      console.log('Received ID:', id);
      if (id) {
        const dbClient = await connectToDatabase();
        const caseDetails = await getCaseDetails(dbClient, id);
        const {
          diary_number,
          case_type
        } = caseDetails;
       const result = await scrapingDetails(null, diary_number, "High Court of Delhi", "Principal Bench at Delhi", case_type);
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
        await HighCourtJudgmentsScrapper(date, "High Court of Delhi", "Principal Bench at Delhi");
      }

    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [highCourtCasesUpsert]: ${error}`);
      res.status(500).send({
        message: 'Error fetching high court judgments',
        error: error.message
      });
      await updateJudgmentUrl(dbClient, id, {orders: []}, 2);
      return;
    } finally {
      console.log("[end] [fetchHighCourtJudgments] High Court Scraping completed successfully");
    }

    res.send(
      {
        message: 'High Court judgments fetched successfully',
        result: result
      }
    );
  });
