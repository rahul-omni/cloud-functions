const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { DistrictCourtCauseListScrapper } = require('./districtCourtCauseListScrapper');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.fetchDistrictCourtCauseList = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
    let result = [];
    try {

      console.log("[start] [fetchDistrictCourtCauseList] req.body", req.body);
      
      const causeListDate = req.body?.causeListDate || req.body?.date || new Date().toISOString().split('T')[0];
      const courtComplex = req.body?.courtComplex;
      const courtEstablishment = req.body?.courtEstablishment;
      const courtNumber = req.body?.courtNumber;
      const causeType = req.body?.causeType || 'Civil';

      // Validate required parameters
      if (!causeListDate) {
        throw new Error('Cause list date is required');
      }

      if (!courtComplex && !courtEstablishment) {
        throw new Error('Either court complex or court establishment must be specified');
      }

      if (!courtNumber) {
        throw new Error('Court number is required');
      }

      if (!['Civil', 'Criminal'].includes(causeType)) {
        throw new Error('Cause type must be either "Civil" or "Criminal"');
      }

      result = await DistrictCourtCauseListScrapper(
        causeListDate, 
        courtComplex, 
        courtEstablishment, 
        courtNumber, 
        causeType
      );

    } catch (error) {
      console.error('❌  Error:', error.message);
      console.log(`[error] [fetchDistrictCourtCauseList]: ${error}`);
      res.status(500).send({
        message: 'Error fetching district court cause list',
        error: error.message
      });
      return;
    } finally {
      console.log("[end] [fetchDistrictCourtCauseList] District Court Cause List Scraping completed successfully");
    }

    res.send(
      {
        message: 'District Court cause list fetched successfully',
        result: result
      }
    );
  });
