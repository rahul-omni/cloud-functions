const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { processJudgmentNotifications } = require('../services/notification.service');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for create case and notify
 */
exports.createCaseAndNotify = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

  const now = new Date();
  
  console.log("[start] [createCaseAndNotify] createCaseAndNotify service started at:", now.toISOString());

  try {

    const results = req?.body?.results || [];

    if(results.length === 0){
        console.log("[info] [createCaseAndNotify] No results found");
        res.status(200).json({
            success: true,
            message: "No results found",
            data: []
        });
        return;
    }
    
    let notifications = [];
    // Process notifications and insert into case management table
    try {
      notifications = await processJudgmentNotifications(results);
      console.log(`[info] [createCaseAndNotify] Notifications processed completed for ${notifications.length} notifications`);
    } catch (error) {
      console.error('[error] [createCaseAndNotify] Failed to process notifications:', error.message);
      throw error;
    }

    const data = {
      notifications: notifications
    }
    
    res.status(200).json({
      success: true,
      message: "Create case and notify job completed successfully",
      data: data
    });

  } catch (error) {
    console.error('[error] [createCaseAndNotify] Error during create case and notify service: ', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    console.log("[end] [createCaseAndNotify] createCaseAndNotify service ended at:", new Date().toISOString());
  }
});
