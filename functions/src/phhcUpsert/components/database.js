const functions = require('firebase-functions');
const { Client } = require('pg');

// Database connection function
async function connectToDatabase() {
  const client = new Client({
    connectionString: functions.config().environment.database_url,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('✅  Connected to PostgreSQL database');
    return client;
  } catch (error) {
    console.error('❌  Database connection failed:', error.message);
    throw error;
  }
}

// Insert order into database
async function insertOrder(dbClient, orderData) {
  try {
    const benchValue = orderData.Bench || orderData.bench || orderData.requestBench || '';
    if (!benchValue.trim()) {
      console.log(`⏭️  Skipping insert for ${orderData.DiaryNumber} - bench missing`);
      return null;
    }

    // Keep judgment date in dd-mm-yyyy format for database
    let judgmentDate = orderData.JudgetmentDate || null;
    
    // Extract case number from diary number if possible
    let caseNumber = orderData['Case Number'] || null;
    let caseType = orderData.case_type || null;

    if (orderData.case_type && orderData.DiaryNumber) {
      caseType = orderData.case_type;
      caseNumber = orderData.case_type + '/' + orderData.DiaryNumber;
    }

    const diaryNumber = orderData['Diary Number'] || '';
    
    // Prepare judgment URL array - convert to JSON string for PostgreSQL
    let judgmentUrl = orderData.judgment_url || null;
    if (judgmentUrl && Array.isArray(judgmentUrl)) {
      judgmentUrl = JSON.stringify(judgmentUrl);
    } else if (judgmentUrl && typeof judgmentUrl === 'object') {
      judgmentUrl = JSON.stringify(judgmentUrl);
    }

    // Prepare judgment text array
    const judgmentText = null;
    
    const judgmentType = orderData.Order?.text || null;
    // No file path since we're not uploading PDFs
    const filePath = null;

    const parties = orderData["Petitioner / Respondent"] || '';
    const advocates = orderData["Petitioner/Respondent Advocate"] || '';
    
    // Insert new record
    const insertQuery = `
      INSERT INTO case_details (
        id,
        serial_number, 
        diary_number, 
        case_number,
        parties,
        advocates,
        bench,
        judgment_by,
        judgment_date,
        court,
        date,
        created_at,
        updated_at,
        judgment_url,
        file_path,
        judgment_text,
        case_type,
        city,
        district,
        judgment_type
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19
      )
      RETURNING id;
    `;

    const cityValue = "Chandigarh"; // Hardcoded for PHHC

    const result = await dbClient.query(insertQuery, [
      orderData.SerialNumber || '',
      diaryNumber,
      caseNumber,
      parties,
      advocates,
      benchValue,
      null, // judgment_by
      judgmentDate,
      'High Court',
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
      judgmentUrl,
      filePath,
      judgmentText,
      caseType,
      cityValue,
      orderData.district || '',
      judgmentType
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌  Failed to insert order:', error.message);
    throw error;
  }
}

async function updateJudgmentUrl(dbClient, id, newJudgmentUrl, sync_site) {
  try {
    // Convert to JSON string if it's an array or object
    let judgmentUrlJson = newJudgmentUrl;
    if (Array.isArray(newJudgmentUrl) || (typeof newJudgmentUrl === 'object' && newJudgmentUrl !== null)) {
      judgmentUrlJson = JSON.stringify(newJudgmentUrl);
    }
    
    const updateQuery = `
      UPDATE case_details
      SET 
        judgment_url = $1::jsonb,
        updated_at = $2,
        site_sync = $3
      WHERE id = $4
      RETURNING id, judgment_url;
    `;

    const result = await dbClient.query(updateQuery, [
      judgmentUrlJson,
      new Date().toISOString(),
      sync_site,
      id,
    ]);

    if (result.rowCount === 0) {
      console.warn(`⚠️  No record found with id: ${id}`);
      return null;
    }

    console.log(`✅ Judgment URL updated for id: ${id}`);
    return result.rows[0];
  } catch (error) {
    console.error(`❌  Failed to update judgment URL for id ${id}:`, error.message);
    throw error;
  }
}

// Update case details (diary_number, case_number, and other fields) for an existing record
async function updateCaseDetails(dbClient, id, caseData, preserveDiaryNumber = false) {
  try {
    // If preserveDiaryNumber is true, don't update diary_number (keep original)
    const updateQuery = preserveDiaryNumber ? `
      UPDATE case_details
      SET 
        case_number = $1,
        parties = $2,
        advocates = $3,
        bench = $4,
        district = $5,
        updated_at = $6
      WHERE id = $7
      RETURNING id;
    ` : `
      UPDATE case_details
      SET 
        diary_number = $1,
        case_number = $2,
        parties = $3,
        advocates = $4,
        bench = $5,
        district = $6,
        updated_at = $7
      WHERE id = $8
      RETURNING id;
    `;

    const result = preserveDiaryNumber ? await dbClient.query(updateQuery, [
      caseData['Case Number'] || null,
      caseData['Petitioner / Respondent'] || null,
      caseData['Petitioner/Respondent Advocate'] || null,
      caseData['Bench'] || null,
      caseData['district'] || '',
      new Date().toISOString(),
      id,
    ]) : await dbClient.query(updateQuery, [
      caseData['Diary Number'] || null,
      caseData['Case Number'] || null,
      caseData['Petitioner / Respondent'] || null,
      caseData['Petitioner/Respondent Advocate'] || null,
      caseData['Bench'] || null,
      caseData['district'] || '',
      new Date().toISOString(),
      id,
    ]);

    if (result.rowCount === 0) {
      console.warn(`⚠️  No record found with id: ${id}`);
      return null;
    }

    console.log(`✅ Case details updated for id: ${id}`);
    return result.rows[0];
  } catch (error) {
    console.error(`❌  Failed to update case details for id ${id}:`, error.message);
    throw error;
  }
}

async function getCaseDetails(dbClient, id) {
  try {
    const query = `
      SELECT 
        diary_number,
        case_type,
        case_number
      FROM case_details
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await dbClient.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error(`❌  Failed to get case details for id ${id}:`, error.message);
    throw error;
  }
}

// Check if entry exists in database (by diary number, case type, court, and city)
// We check without judgment_date so we can append multiple judgment URLs to the same case
async function checkIfEntryExists(dbClient, diaryNumber, caseType, court, city) {
  if (!dbClient) return null;
  
  try {
    const query = `
      SELECT id, judgment_url
      FROM case_details 
      WHERE diary_number = $1 
        AND case_type = $2 
        AND court = $3
        AND city = $4
      ORDER BY created_at DESC
      LIMIT 1
    `;
  
    const result = await dbClient.query(query, [diaryNumber, caseType, court, city]);
    return result.rows.length > 0 ? result.rows[0] : null;
    
  } catch (error) {
    console.error('❌  Error checking if entry exists:', error.message);
    return null;
  }
}

module.exports = {
  connectToDatabase,
  insertOrder,
  updateJudgmentUrl,
  getCaseDetails,
  checkIfEntryExists,
  updateCaseDetails
};

