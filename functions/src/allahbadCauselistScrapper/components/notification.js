const functions = require('firebase-functions');

const { insert_to_notification_table } = require('../../db/notificationProcess');
const { processWhatsAppNotificationsWithTemplate } = require('../../notification/processWhatsappNotification');
const { getHighCourtUserCases } = require('./database');


async function sendNotifications(dbClient, diaryNumber, caseType, court, city, district, judgmentDate = null, judgmentUrl = null) {
  try {
    
    // Get all users subscribed to this case
    const userCases = await getHighCourtUserCases(dbClient, diaryNumber, caseType, court, city, district);
    
    if (!userCases || userCases.length === 0) {
      console.log(`ℹ️  No users found for diary number ${diaryNumber}. Skipping notifications.`);
      return;
    }

    console.log(`📧 [sendNotifications] Found ${userCases.length} user(s) for diary ${diaryNumber}. Creating notifications...`);

    // Format date for template
    const formattedDate = judgmentDate || new Date().toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });

    // Create identifier (case type + diary number)
    const identifier = caseType ? `${caseType}/${diaryNumber}` : diaryNumber;

    // Create notifications for each user
    for (const userCase of userCases) {
      try {
        // Prepare notification data
        const notificationData = {
          diary_number: userCase.diary_number,
          user_id: userCase.user_id,
          email: userCase.email,
          country_code: userCase.country_code,
          mobile_number: userCase.mobile_number
        };

        // Create WhatsApp notification
        const whatsappNotification = await insert_to_notification_table(notificationData, 'whatsapp');
        
        // Prepare template data: [identifier, formattedDate, url]
        const templateData = [
          identifier,
          formattedDate,
          judgmentUrl || 'N/A'  // Use provided URL or 'N/A' if not available
        ];

        // Send WhatsApp notification directly using template
        await processWhatsAppNotificationsWithTemplate(
          whatsappNotification.id,
          "order_status",  // Template name (same as hcCauseListScrapper)
          templateData
        );
        
        console.log(`✅ [sendNotifications] WhatsApp notification sent for user ${userCase.user_id}`);

      } catch (error) {
        console.error(`❌ [sendNotifications] Failed to send notification for user ${userCase.user_id}:`, error.message);
        // Continue with other users even if one fails
      }
    }

    console.log(`✅ [sendNotifications] Completed notifications for diary ${diaryNumber}`);
  } catch (error) {
    console.error(`❌ [sendNotifications] Error sending notifications for diary ${diaryNumber}:`, error.message);
    throw error;
  }
}

module.exports = {
  sendNotifications
};