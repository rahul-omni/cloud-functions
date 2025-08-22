const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require("../scCauseListScrapper/scCauseListScrapper.js");

// Runtime options for the function
const runtimeOpts = {
    timeoutSeconds: 540,
    memory: '2GB',
};

exports.testFunction = regionFunctions.runWith(runtimeOpts).https
    .onRequest(async (req, res) => {

        const listType = req.body.listType
        const searchBy = req.body.searchBy || 'all_courts'
        const causelistType = req.body.causelistType || 'misce'
        const listingDate = req.body.listingDate
        const mainAndSupplementry = req.body.mainAndSupplementry
        console.log(req.body)
        try {

            console.log("[start] [testFunction] testFunction service started at:", new Date().toISOString());

            const resData = await fetchSupremeCourtCauseList(listType, searchBy, causelistType, listingDate, mainAndSupplementry);
            
            res.status(200).json({
                success: true,
                message: "Test function completed successfully",
                data: resData
            });

        } catch (error) {
            console.error('[error] [testFunction] Error in test function:', error);
            res.status(500).json({
                success: false,
                message: "Test function failed. " + error.message,
                data: []
            });
        } finally {
            console.log("[end] [testFunction] testFunction service completed at:", new Date().toISOString());
        }
    });
