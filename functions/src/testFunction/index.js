const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { processWhatsAppNotifications } = require("../notification/processWhatsappNotification");

// Runtime options for the function
const runtimeOpts = {
    timeoutSeconds: 540,
    memory: '2GB',
};

exports.testFunction = regionFunctions.runWith(runtimeOpts).https
    .onRequest(async (req, res) => {

        const now = new Date();

        try {

            const id = req?.body?.id;

            console.log("[start] [testFunction] testFunction service started at:", now.toISOString());

            await processWhatsAppNotifications(id);
            
            res.status(200).json({
                success: true,
                message: "Test function completed successfully",
                
            });

        } catch (error) {
            console.error('[error] [testFunction] Error in test function:', error);
            res.status(500).json({
                success: false,
                message: "Test function failed. " + error.message,
                data: []
            });
        } finally {
            console.log("[end] [testFunction] testFunction service completed at:", now.toISOString());
        }
    });
