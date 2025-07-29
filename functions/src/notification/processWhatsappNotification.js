const { update_notification_status, get_notification_by_id } = require('../db/notificationProcess');
const functions = require('firebase-functions');
const { accessWhatsappSecretVersion } = require('../config/secretManager');

// WhatsApp Configuration
const WHATSAPP_API_URL = functions.config().environment.whatsapp_api_url;
const WHATSAPP_PHONE_NUMBER_ID = functions.config().environment.whatsapp_phone_number_id;

const getWhatsAppToken = async () => {
  try {
    const projectId = functions.config().environment.project_id;
    const secretName = functions.config().environment.whatsapp_token_secret;
    const token = await accessWhatsappSecretVersion(projectId, secretName);
    
    if (!token) {
      throw new Error('WhatsApp token not found in secret');
    }

    return token;
  } catch (error) {
    console.error('[error] Failed to get WhatsApp token:', error);
    throw error;
  }
};

const processWhatsAppNotifications = async (id) => {
  console.log('[start] [processWhatsAppNotifications] whatsapp notification started for id: ', id);

  try {

    const notification = await get_notification_by_id(id);

    if (!notification) {
      throw new Error('No pending whatsapp notifications found for id: ', id);
    }

    if (notification.status === 'success') {
      throw new Error('Whatsapp notification already processed for id: ', id);
    }

    if (notification.contact === null) {
      throw new Error('No contact found for this notification for id: ', id);
    }

    if (notification.method !== 'whatsapp') {
      throw new Error('Notification method is not whatsapp for id: ', id);
    }

    let formattedPhone = notification.contact.replace(/\D/g, ''); // Remove all non-digit characters

    // Add + if missing (but has country code)
    if (!formattedPhone.startsWith('+')) {
      // If starts with country code (91, 92, etc.)
      if (formattedPhone.match(/^[1-9]\d{9,14}$/)) {
        formattedPhone = '+' + formattedPhone;
      } else {
        throw new Error('Phone number must include country code (e.g. 919991910535 or +919991910535)');
      }
    }

    try {
      // Simulate sending WhatsApp message
      console.log('\n📱 Sending WhatsApp:');

      const requestBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: notification.message
        }
      };
          // Construct the API endpoint URL
      const apiUrl = WHATSAPP_API_URL.replace(/\/+$/, '');
      const endpoint = `${apiUrl}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

      const token = await getWhatsAppToken();

  

       // Make the API request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.trim()}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('WhatsApp API error:', {
          endpoint,
          requestBody,
          errorData
        });
        throw new Error(`WhatsApp API error: ${errorData.error?.message || 'Failed to send WhatsApp message'}`);
      }

      const data = await response.json();
      console.log('[info] [processWhatsAppNotifications] WhatsApp API response:', data);
      // Update status to success
      await update_notification_status(notification.id, 'success');
      console.log(`[info] [processWhatsAppNotificationsDB] WhatsApp notification ${notification.id} marked as success`);

    } catch (error) {
      console.error(`[error] [processWhatsAppNotificationsDB] Failed to process WhatsApp notification ${notification.id}:`, error);
      await update_notification_status(notification.id, 'failed');
      throw new Error('Failed to send WhatsApp message');
    }
  } catch (error) {
    console.error('[error] [processWhatsAppNotifications] Error in WhatsApp notification processor:', error);
    throw error;
  } finally {
    console.log('[end] [processWhatsAppNotifications] WhatsApp notification processor ended for id: ', id);
  }

  return null;
}

module.exports = {
  processWhatsAppNotifications
}