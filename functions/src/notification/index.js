const functions = require('firebase-functions');
const regionFunctions = functions.region('asia-south1');

const { processEmailNotifications } = require('./processEmailNotification');
const { processWhatsAppNotifications } = require('./processWhatsappNotification');


exports.processNotifications = regionFunctions.pubsub
  .topic('dairy-scrapping')
  .onPublish(async (message) => {

    try {
      const messageParsed = message.data ? JSON.parse(Buffer.from(message.data, 'base64').toString()) : null;
      console.log("messageParsed", messageParsed);
      const messageData = messageParsed.id;
      console.log("messageData", messageData);
      console.log("messageData.id", messageData.id);
      console.log('[start] [processNotifications] Starting notification processor for message id: ', messageData.id);
   
      // Process both types of notifications
      if(messageData.method === 'email'){
        await processEmailNotifications(messageData.id);
      }else if(messageData.method === 'whatsapp'){
        await processWhatsAppNotifications(messageData.id);
      }else{
        console.log('[info] [processNotifications] No notification method found for message id: ', messageData.id);
      }
     
      return null;

    } catch (error) {
      console.error('[error] [processNotifications] Error in notification processor: for message id: ', message, error);
      throw error;
    } finally {
      console.log('[end] [processNotifications] Notification processor ended for message id: ', message);
    }   
  });



