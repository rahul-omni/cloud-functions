const functions = require('firebase-functions');
const { Client } = require('pg');

// Database connection function.
// When connectionString is passed (e.g. by supremeCourtOTF params), use it; otherwise use functions.config() for other callers.
async function connectToDatabase(options) {
  const connectionString = (options && options.connectionString) || process.env.DATABASE_URL || functions.config().environment?.database_url;
  const client = new Client({
    connectionString,
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
    if (!id) return;
    const query = `UPDATE case_details SET site_sync = 2, updated_at = $1 WHERE id = $2`;
    await dbClient.query(query, [new Date().toISOString(), id]);
    console.log(`[info] [markSyncError] Set site_sync = 2 for case id: ${id}`);
}

module.exports = {
  connectToDatabase,
  updateOrder,
  markSyncError
};