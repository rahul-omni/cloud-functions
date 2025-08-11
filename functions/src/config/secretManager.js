const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();

/**
 * Access the latest version of a secret for service account credentials
 * @param {string} projectId - Project ID
 * @param {string} secretName - Secret name
 */
const accessSecretVersion = async (projectId, secretName) => {
  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/1`,
    });
    const serviceAccountCredentials = JSON.parse(version.payload.data.toString());
    return serviceAccountCredentials;
  } catch (error) {
    console.error('Error accessing secret:', error);
    throw error;
  }
};

// Function to access WhatsApp token as plain text
const accessWhatsappSecretVersion = async (projectId, secretName) => {
  try {
    const name = `projects/${projectId}/secrets/${secretName}/versions/5`;
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload.data.toString();
    return payload.trim(); // Return the plain text token directly
  } catch (error) {
    console.error('Error accessing WhatsApp token:', error);
    throw error;
  }
};


module.exports = {
  accessSecretVersion,
  accessWhatsappSecretVersion,
}; 