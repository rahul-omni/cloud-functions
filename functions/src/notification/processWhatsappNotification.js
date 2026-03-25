const { update_notification_status, get_notification_by_id } = require('../db/notificationProcess');
const { createSecretManagerV2 } = require('../config/secretManagerV2');

// WhatsApp Configuration
const WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || '';
}

let _smv2Promise = null;
async function getSecretManagerV2() {
  if (_smv2Promise) return _smv2Promise;
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Project ID not found in env (GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT)');
  }
  _smv2Promise = createSecretManagerV2(projectId);
  return _smv2Promise;
}

async function resolveWhatsAppConfig() {
  const smv2 = await getSecretManagerV2();
  // Store these in Secret Manager V2 as plain text secrets:
  // - WHATSAPP_TOKEN
  // - WHATSAPP_PHONE_NUMBER_ID
  const [token, phoneNumberId] = await Promise.all([
    smv2.accessPlainTextSecret('WHATSAPP_TOKEN'),
    smv2.accessPlainTextSecret('WHATSAPP_PHONE_NUMBER_ID'),
  ]);
  if (!token) throw new Error('Missing Secret Manager V2 secret: WHATSAPP_TOKEN');
  if (!phoneNumberId) throw new Error('Missing Secret Manager V2 secret: WHATSAPP_PHONE_NUMBER_ID');
  return { token: token.trim(), phoneNumberId: phoneNumberId.trim() };
}

const processWhatsAppNotifications = async (id, template_name, data) => {
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
      const { token, phoneNumberId } = await resolveWhatsAppConfig();
      const endpoint = `${apiUrl}/${phoneNumberId}/messages`;

       // Make the API request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
const processWhatsAppNotificationsWithTemplate = async (id, template_name, data = []) => {
  console.log('[start] [processWhatsAppNotifications] WhatsApp notification started for id:', id);

  try {
    const notification = await get_notification_by_id(id);

    if (!notification) {
      throw new Error('No pending WhatsApp notifications found for id: ' + id);
    }

    if (notification.status === 'success') {
      throw new Error('WhatsApp notification already processed for id: ' + id);
    }

    if (!notification.contact) {
      throw new Error('No contact found for this notification for id: ' + id);
    }

    if (notification.method !== 'whatsapp') {
      throw new Error('Notification method is not WhatsApp for id: ' + id);
    }

    let formattedPhone = notification.contact.replace(/\D/g, '');

    try {
      console.log('\n📱 Sending WhatsApp template message:');

      // Convert data array to WhatsApp template parameters
      const templateParameters = data.map(param => ({
        type: 'text',
        text: String(param)
      }));

      const requestBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: template_name,
          language: { code: 'en' }, // Must match the approved template language
          components: [
            {
              type: 'body',
              parameters: templateParameters
            }
          ]
        }
      };

      // API endpoint
      const apiUrl = WHATSAPP_API_URL.replace(/\/+$/, '');
      const { token, phoneNumberId } = await resolveWhatsAppConfig();
      const endpoint = `${apiUrl}/${phoneNumberId}/messages`;

      // Send request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('WhatsApp API error:', { endpoint, requestBody, errorData });
        await update_notification_status(notification.id, 'failed');
        throw new Error(`WhatsApp API error: ${errorData.error?.message || 'Failed to send WhatsApp message'}`);
      }

      const responseData = await response.json();
      console.log('[info] [processWhatsAppNotifications] WhatsApp API response:', responseData);

      // Update status to success
      await update_notification_status(notification.id, 'success');
      console.log(`[info] [processWhatsAppNotificationsDB] WhatsApp notification ${notification.id} marked as success`);

    } catch (error) {
      console.error(`[error] [processWhatsAppNotificationsDB] Failed to process WhatsApp notification ${notification.id}:`, error);
      await update_notification_status(notification.id, 'failed');
      throw error;
    }

  } catch (error) {
    console.error('[error] [processWhatsAppNotifications] Error in WhatsApp notification processor:', error);
    throw error;
  } finally {
    console.log('[end] [processWhatsAppNotifications] WhatsApp notification processor ended for id:', id);
  }

  return null;
};


module.exports = {
  processWhatsAppNotifications,
  processWhatsAppNotificationsWithTemplate
}