const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { HighCourtJudgmentsScrapper } = require('./highCourtScrapper');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.fetchHighCourtJudgments = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    try {

      console.log("[start] [fetchHighCourtJudgments] req.body", req.body);
      
      const date = req.body?.date || new Date().toISOString().split('T')[0];
      const diaryNumber = req.body?.diaryNumber;
      const highCourtname = req.body?.highCourt;
    //   const bench = req.body?.bench;
    //   const caseTypeValue = req.body?.caseTypeValue;

    const benches = Array.isArray(req.body?.bench) ? req.body.bench : [req.body?.bench];
const caseTypes = Array.isArray(req.body?.caseTypeValue) ? req.body.caseTypeValue : [req.body?.caseTypeValue];


      if (!highCourtname && !benches.length ===0) {
        throw new Error('High Court and Bench are required');
      }

      if(!date || (!diaryNumber && caseTypes.length === 0)) {
        throw new Error('Date or Diary Number and Case Type are required');
      }

      
let allResults = [];
for (const b of benches) {
  for (const ct of caseTypes) {
    const results = await HighCourtJudgmentsScrapper(date, diaryNumber, highCourtname, b, ct);
    allResults = allResults.concat(results);
  }
}
result = allResults;
// ...existing code.

    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [fetchHighCourtJudgments]: ${error}`);
      res.status(500).send({
        message: 'Error fetching high court judgments',
        error: error.message
      });
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
