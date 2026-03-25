const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Storage } = require('@google-cloud/storage');

const defaultClient = new SecretManagerServiceClient();

/** Default name of the secret that holds the V2 service account key JSON (bootstrap). */
const DEFAULT_BOOTSTRAP_SECRET_NAME = 'secret-manager-v2-credential';

/**
 * Read bootstrap credentials (SA key JSON) from Secret Manager.
 * Use for GCS, Secret Manager, etc. when function's SA lacks permissions.
 *
 * @param {string} projectId - GCP project ID
 * @param {string} [bootstrapSecretName] - Secret name
 * @returns {Promise<object>} Parsed SA key JSON (credentials)
 */
async function getBootstrapCredentials(projectId, bootstrapSecretName = DEFAULT_BOOTSTRAP_SECRET_NAME) {
  const name = `projects/${projectId}/secrets/${bootstrapSecretName}/versions/latest`;
  console.log('[secretManagerV2] Reading bootstrap secret:', { projectId, bootstrapSecretName });
  const [version] = await defaultClient.accessSecretVersion({ name });
  const credentials = JSON.parse(version.payload.data.toString());
  if (!credentials || typeof credentials !== 'object') {
    throw new Error(`secretManagerV2: bootstrap secret "${bootstrapSecretName}" must be valid JSON (SA key)`);
  }
  return credentials;
}

/**
 * Create a Secret Manager client that uses a **different IAM identity** (dedicated service account).
 * The default client is used only to read the bootstrap secret; all other secret access uses the
 * credentials stored in that secret.
 *
 * @param {string} projectId - GCP project ID
 * @param {string} [bootstrapSecretName] - Secret that contains the SA key JSON (default: secret-manager-v2-credentials)
 * @returns {Promise<{ accessPlainTextSecret: (secretName: string, version?: string) => Promise<string> }>}
 */
async function createSecretManagerV2(projectId, bootstrapSecretName = DEFAULT_BOOTSTRAP_SECRET_NAME) {
  const credentials = await getBootstrapCredentials(projectId, bootstrapSecretName);
  console.log('[secretManagerV2] Bootstrap JSON parsed, V2 client created');

  const v2Client = new SecretManagerServiceClient({ credentials });

  return {
    async accessPlainTextSecret(secretName, version = 'latest') {
      const secretNameFull = `projects/${projectId}/secrets/${secretName}/versions/${version}`;
      console.log('[secretManagerV2] Reading app secret:', { secretName, version, fullName: secretNameFull });
      try {
        const [v] = await v2Client.accessSecretVersion({ name: secretNameFull });
        const value = v.payload.data.toString().trim();
        console.log('[secretManagerV2] App secret read OK, length:', value ? value.length : 0);
        return value;
      } catch (e) {
        console.error('[secretManagerV2] App secret failed:', { secretName, message: e.message, code: e.code, details: e.details });
        throw e;
      }
    },
  };
}

/**
 * Create a GCS Storage client using bootstrap credentials (secretManagerV2).
 * Use when the function's SA lacks storage.objects.create; the bootstrap SA must have
 * Storage Object Creator on the target bucket.
 *
 * @param {string} [projectId] - GCP project ID (default: GCLOUD_PROJECT)
 * @returns {Promise<Storage>} Storage client
 */
async function createStorageClientFromSecretManagerV2(projectId) {
  const projId = projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projId) {
    throw new Error('project_id not set for GCS. Set GCLOUD_PROJECT.');
  }
  const credentials = await getBootstrapCredentials(projId);
  console.log('[secretManagerV2] Creating GCS Storage client with bootstrap credentials');
  return new Storage({ projectId: projId, credentials });
}

module.exports = {
  createSecretManagerV2,
  getBootstrapCredentials,
  createStorageClientFromSecretManagerV2,
  DEFAULT_BOOTSTRAP_SECRET_NAME,
};
