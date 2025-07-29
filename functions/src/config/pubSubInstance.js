const { PubSub } = require("@google-cloud/pubsub");
const { accessSecretVersion } = require("./secretManager");
const functions = require('firebase-functions');

let pubSubClient = null;

/**
 * Initialize PubSub client with credentials from Secret Manager
 */
const initializePubSubClient = async () => {
  if (!pubSubClient) {
    try {
      const projectId = functions.config().environment.project_id;
      const secret_name = functions.config().environment.secret_name;
      
      const credentialsJson = await accessSecretVersion(projectId, secret_name);

      // Initialize only if credentials exist and pubSubClient is not yet initialized
      if (!pubSubClient && credentialsJson) {
        const credentials = typeof credentialsJson === 'string'
          ? JSON.parse(credentialsJson)
          : credentialsJson;
        pubSubClient = new PubSub({
          credentials: credentials,
        });
        console.log("PubSub client initialized.");
      } else if (!credentialsJson) {
        throw new Error("PubSub credentials not found in environment.");
      }
      } catch (error) {
      console.error("Failed to initialize PubSub client:", error);
      throw error;
    }
  }
  return pubSubClient;
};

/**
 * Function to publish a message to a PubSub topic.
 * @param {Object} messageData - The message payload to publish.
 * @param {string} topicName - The PubSub topic to which the message is published.
 */
const publishMessage = async (messageData, topicName = "dairy-scrapping") => {
  
  await initializePubSubClient(); // Ensure PubSub client is initialized with the right credentials

  const dataBuffer = Buffer.from(JSON.stringify(messageData));

  try {
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer);
    console.log(`Message ${messageId} published.`);
    return messageId;
  } catch (error) {
    console.error(`Error publishing message: ${error.message}`);
    throw error;
  }
};

module.exports = {
  publishMessage
}; 