const functions = require('firebase-functions');
const { createSecretManagerV2 } = require('./secretManagerV2');

/** Default secret name for OpenAI API key in Secret Manager (V2). */
const DEFAULT_OPENAI_SECRET_NAME = 'openai-api-key';

/**
 * Reusable: get OpenAI API key from Secret Manager via V2 (dedicated IAM).
 * Use in any Cloud Function that needs the key without env/config.
 *
 * @param {string} [projectId] - GCP project ID. If omitted, uses (in order): GCLOUD_PROJECT, PROJECT_ID, GCP_PROJECT from env, or functions.config().environment.project_id.
 * @param {string} [secretName] - Secret name in Secret Manager. Default: 'openai-api-key'
 * @param {string} [logPrefix] - Prefix for log lines (e.g. 'supremeCourtOTF') for debugging.
 * @returns {Promise<string>} The OpenAI API key (plain text).
 * @throws {Error} If projectId missing, or Secret Manager read fails.
 */
async function getOpenAiKeyFromSecretManager(projectId, secretName = DEFAULT_OPENAI_SECRET_NAME, logPrefix = 'getOpenAiKey') {
  const projId = projectId
    || process.env.GCLOUD_PROJECT
    || process.env.PROJECT_ID
    || process.env.GCP_PROJECT
    || functions.config().environment?.project_id;
  if (!projId) {
    throw new Error('project_id not set (required for Secret Manager). Set PROJECT_ID or GCLOUD_PROJECT in .env, or environment.project_id in config.');
  }

  console.log(`[${logPrefix}] Secret Manager: projectId=`, projId);
  const v2 = await createSecretManagerV2(projId);
  console.log(`[${logPrefix}] Requesting secret:`, secretName);
  const key = await v2.accessPlainTextSecret(secretName);
  if (!key || !key.trim()) {
    throw new Error(`Secret "${secretName}" not found or empty in Secret Manager`);
  }
  console.log(`[${logPrefix}] OpenAI key read from Secret Manager OK, length:`, key.length);
  return key.trim();
}

/** Default secret name for DATABASE_URL in Secret Manager (V2). */
const DEFAULT_DATABASE_URL_SECRET_NAME = 'DATABASE_URL';

/**
 * Reusable: get DATABASE_URL from Secret Manager via V2 (dedicated IAM).
 * Use when function and secrets are in different projects; V2 uses bootstrap credentials.
 *
 * @param {string} [projectId] - GCP project ID where secrets live. If omitted, uses SECRETS_PROJECT_ID env, then GCLOUD_PROJECT.
 * @param {string} [secretName] - Secret name. Default: 'DATABASE_URL'
 * @param {string} [logPrefix] - Log prefix for debugging.
 * @returns {Promise<string>} The database connection string.
 */
async function getDatabaseUrlFromSecretManager(projectId, secretName = DEFAULT_DATABASE_URL_SECRET_NAME, logPrefix = 'getDatabaseUrl') {
  const projId = projectId
    || process.env.SECRETS_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.PROJECT_ID
    || process.env.GCP_PROJECT
    || functions.config().environment?.project_id;
  if (!projId) {
    throw new Error('project_id not set (required for Secret Manager). Set PROJECT_ID or GCLOUD_PROJECT in .env.');
  }

  console.log(`[${logPrefix}] Secret Manager V2: projectId=`, projId);
  const v2 = await createSecretManagerV2(projId);
  console.log(`[${logPrefix}] Requesting secret:`, secretName);
  const value = await v2.accessPlainTextSecret(secretName);
  if (!value || !value.trim()) {
    throw new Error(`Secret "${secretName}" not found or empty in Secret Manager`);
  }
  console.log(`[${logPrefix}] DATABASE_URL read from Secret Manager V2 OK, length:`, value.length);
  return value.trim();
}

module.exports = {
  getOpenAiKeyFromSecretManager,
  getDatabaseUrlFromSecretManager,
  DEFAULT_OPENAI_SECRET_NAME,
  DEFAULT_DATABASE_URL_SECRET_NAME,
};
