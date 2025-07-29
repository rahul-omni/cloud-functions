const { get_notification_by_id, update_notification_status } = require('../db/notificationProcess');

const processEmailNotifications = async (id) => {

    try {
      const notification = await get_notification_by_id(id);
      console.log('[start] [processEmailNotifications] email notification started for id: ', id);
      
      if (!notification) {
        throw new Error('No pending email notifications found for id: ', id);
      }

      if(notification.status === 'success'){
        throw new Error('Email notification already processed for id: ', id);
      }

      if(notification.email === null){
        throw new Error('No email found for this notification for id: ', id);
      }

      console.log(`[info] [processEmailNotifications] Processing email notification for id: ${id}`);
  
        try {
          // Simulate sending email
          console.log('\n📧 Sending Email:');
          console.log('To:', notification.contact);
          console.log('Message:', notification.message);
          console.log('Case:', notification.dairy_number);
  
          // Update status to success
          await update_notification_status(notification.id, 'success');
          console.log(`[info] [processEmailNotifications] Email notification ${notification.id} marked as success`);
        } catch (error) {
          console.error(`[error] [processEmailNotifications] Error in email notification processor for id: ${notification.id}`, error);
          // Mark as failure
          await update_notification_status(notification.id, 'failed');
          console.log(`[info] [processEmailNotifications] Email notification ${notification.id} marked as failed`);
        }
        
    } catch (error) {
      console.error(`[error] [processEmailNotifications] Error in email notification processor for id: ${id}`, error);
      throw error;
    } finally {
      console.log('[end] [processEmailNotifications] Email notification processor ended for id: ', id);
    }
  
    return null;
  }
 
  
module.exports = {
    processEmailNotifications
}