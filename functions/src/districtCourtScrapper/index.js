const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { DistrictCourtJudgmentsScrapper } = require('./districtCourtScrapper');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.fetchDistrictCourtJudgments = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    try {

      console.log("[start] [fetchDistrictCourtJudgments] req.body", req.body);
      
      const date = req.body?.date || new Date().toISOString().split('T')[0];
      const diaryNumber = req.body?.diaryNumber;
      const courtName = req.body?.courtName || req.body?.districtCourt;
      const caseTypeValue = req.body?.caseTypeValue;
      const courtComplex = req.body?.courtComplex

      if (!courtName && !diaryNumber && !caseTypeValue && !courtComplex) {
        throw new Error('District Court name is required (courtName or districtCourt field)');
      } else if(!date) {
        throw new Error('Date is required');
      }

      result = await DistrictCourtJudgmentsScrapper(date, diaryNumber, courtName, caseTypeValue, courtComplex);

    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [fetchDistrictCourtJudgments]: ${error}`);
      res.status(500).send({
        message: 'Error fetching district court judgments',
        error: error.message
      });
      return;
    } finally {
      console.log("[end] [fetchDistrictCourtJudgments] District Court Scraping completed successfully");
    }

    res.send(
      {
        message: 'District Court judgments fetched successfully',
        result: result
      }
    );
  });
