const { insert_to_notification_table, insert_to_case_management_table } = require('../db/notificationProcess');
const { publishMessage } = require('../config/pubSubInstance');

const processJudgmentNotifications = async (judgments) => {
  console.log(`[start] [processJudgmentNotifications] Processing ${judgments.length} judgments for notifications...`);

  if(judgments.length === 0){
    console.log("[info] [processJudgmentNotifications] No judgments to process");
    return [];
  }

  let results = [];

  try{
    results = await insert_to_case_management_table(judgments);
    console.log("[info] [processJudgmentNotifications] Notifications to be created: ", results.length);
  }catch(error){
    console.error('[error] [processJudgmentNotifications] Error inserting case management:', error);
  }

  for (const result of results){
    try{
      const whatsapp_notification_id = await insert_to_notification_table(result, 'whatsapp');
      const email_notification_id = await insert_to_notification_table(result, 'email');

      const whatsapp_messageData = {
        method: 'whatsapp',
        id: whatsapp_notification_id
      }

      const email_messageData = {
        method: 'email',
        id: email_notification_id
      }

      publishMessage(whatsapp_messageData, "dairy-scrapping");
      publishMessage(email_messageData, "dairy-scrapping");
      console.log("[info] [processJudgmentNotifications] Published message to pubsub for notification id: ", whatsapp_notification_id, email_notification_id);
    }catch(error){
      console.log("[error] [processJudgmentNotifications] Error inserting notification for notification data: ", result, error);
      results.splice(results.indexOf(result), 1);
      continue;
    }
  }

  console.log(`[end] [processJudgmentNotifications] Created ${results.length} notifications`);
  return results;
}

module.exports = {
  processJudgmentNotifications
};
