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

// Check if a case already exists in the database
async function checkCaseExists(dbClient, diaryNumber, caseNumber, court) {
    const query = `
        SELECT COUNT(*) as count 
        FROM case_management 
        WHERE diary_number = $1 
        AND case_number = $2 
        AND court = $3
    `;
    
    const result = await dbClient.query(query, [diaryNumber, caseNumber, court]);
    return parseInt(result.rows[0].count) > 0;
}

async function insertOrder(dbClient, orderData) {

  try {
    const benchValue = orderData.Bench || orderData.bench || orderData.requestBench || '';

    // Keep judgment date in dd-mm-yyyy format for database
    const judgmentDate = orderData.judgment_date || null;
    
    // Extract case number from diary number if possible
    const caseNumber = orderData.case_number || null;
    const caseType = orderData.case_type || null;

    const diaryNumber = orderData.diary_number || '';
    
    // Prepare judgment URL array
    const judgmentUrl = orderData.judgment_url || null;

    // Prepare judgment text array
    const judgmentText = null;

    const parties = orderData.parties || '';
    
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING id;
    `;

    const cityValue = orderData.city || ''; // Use from scraped data or request

    const result = await dbClient.query(insertQuery, [
      '',                    // serial_number
      diaryNumber,                                      // diary_number
      caseNumber,                                       // case_number
      parties,                                             // parties (not available from scraping)
      null,                                             // advocates (not available from scraping)
      benchValue,                                      // bench (hardcoded based on scraper)
      null,                                            // judgment_by (not available from scraping)
      judgmentDate,                                    // judgment_date
      'Supreme Court',                                    // court (hardcoded based on scraper)
      new Date().toISOString(),                        // date (current timestamp as ISO string)
      new Date().toISOString(),                        // created_at (current timestamp as ISO string)
      new Date().toISOString(),                        // updated_at (current timestamp as ISO string)
      judgmentUrl,                                     // judgment_url (array)
      '',                                        // file_path
      judgmentText,                                    // judgment_text (array)
      caseType,                                        // case_type
      cityValue,                                       // city (hardcoded based on scraper)
      '',                                              // district (hardcoded based on scraper)
      ''                                     // judgment_type (single text field)
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌  Failed to insert order:', error.message);
    throw error;
  }
}

async function updateOrder(dbClient, orderData, id) {

    const getRow = `SELECT * FROM case_details WHERE id = $1`;
    const rowResult = await dbClient.query(getRow, [id]);
    if (rowResult.rows.length === 0) {
        throw new Error(`No case found with id: ${id}`);
    }
    const row = rowResult.rows[0];

    const judgment_url = row.judgment_url;

    const now = new Date().toISOString();

    const mappedCases = orderData.map(caseData => {
        return {
            serial_number: caseData.serial_number || '',
            diary_number: caseData.diary_number || '',
            case_number: caseData.case_number || '',
            parties: caseData.parties || '',
            advocates: caseData.advocates || '',
            bench: caseData.bench || '',
            judgment_by: caseData.judgment_by || '',
            judgment_date: caseData.judgment_date || '',
            court: caseData.court || "Supreme Court",
            date: caseData.date || now,
            created_at: caseData.created_at || now,
            updated_at: caseData.updated_at || now,
            judgment_url: caseData.judgment_url || [],
            judgment_text: caseData.judgment_text || [],
            judgment_type: caseData.judgment_type || ''
        };
    });

    const caseNumber = mappedCases[0].case_number;
    const diary_number = mappedCases[0].diary_number;
    const parties = mappedCases[0].parties;

    for (const caseData of mappedCases) {
        const judgementDate = caseData.judgment_date;
        let exists = false;
        for (const rowUrl of row.judgment_url.orders) {
            if (rowUrl.judgmentDate === judgementDate) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            judgment_url.orders.push({
                gcsPath: caseData.judgment_url[0],
                filename: '',
                judgmentDate: judgementDate,
            });
        }
    }

    const query = `Update case_details SET
                judgment_url = $1,
                case_number = $2,
                parties = $3,
                diary_number = $4,
                site_sync = 1
            WHERE id = $5`;

    const values = [
        judgment_url,
        caseNumber,
        parties,
        diary_number,
        id
    ];

    const result = await dbClient.query(query, values);

    return {
        data: result.rows
    };
}

const markSyncError = async (dbClient, id) => {
    const query = `Update case_details SET
                sync_status = 2
            WHERE id = $1`;
    const values = [
        id
    ];
    await dbClient.query(query, values);
}

const findCase = async (dbClient, id) => {
    const query = `SELECT * FROM case_details WHERE case_number = $1`;
    const values = [id];

    const result = await dbClient.query(query, values);
    return result.rows[0] || null;   // return a row instead of the whole result
};

const findCaseByDiary = async (dbClient, diaryNumber) => {
    const query = `SELECT * FROM case_details WHERE diary_number = $1`;
    const values = [diaryNumber];

    const result = await dbClient.query(query, values);
    return result.rows[0] || null;   // return a row instead of the whole result
};
module.exports = {
  connectToDatabase,
  insertOrder,
  updateOrder,
  markSyncError,
  findCase,
  findCaseByDiary
}