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

    const now = new Date().toISOString();

    // Map all cases to match the transformed results structure
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

    // Filter out cases that already exist in the database
    const newCases = [];
    const existingCases = [];
    
    for (const caseData of mappedCases) {
        const exists = await checkCaseExists(
            dbClient, 
            caseData.diary_number, 
            caseData.case_number, 
            caseData.court,
            caseData.judgment_date
        );
        
        if (exists) {
            existingCases.push(caseData);
            console.log(`[info] [insertOrder] Case already exists: Diary: ${caseData.diary_number}, Case: ${caseData.case_number}, Court: ${caseData.court}`);
        } else {
            newCases.push(caseData);
            console.log(`[info] [insertOrder] New case to insert: Diary: ${caseData.diary_number}, Case: ${caseData.case_number}, Court: ${caseData.court}`);
        }
    }

    if (newCases.length === 0) {
        console.log('[info] [insertOrder] No new cases to insert. All cases already exist in database.');
        return { inserted: 0, existing: existingCases.length, message: 'No new cases to insert' };
    }

    // Generate placeholders for multiple rows (15 columns per row)
    const placeholders = newCases.map((_, index) => {
        const start = index * 15; // 15 columns per row
        return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, $${start + 10}, $${start + 11}, $${start + 12}, $${start + 13}, $${start + 14}, $${start + 15})`;
    }).join(', ');

    // Flatten the newCases array for parameter binding
    const values = newCases.flatMap(caseData => [
        caseData.serial_number,
        caseData.diary_number,
        caseData.case_number,
        caseData.parties,
        caseData.advocates,
        caseData.bench,
        caseData.judgment_by,
        caseData.judgment_date,
        caseData.court,
        caseData.date,
        caseData.created_at,
        caseData.updated_at,
        caseData.judgment_url,
        caseData.judgment_text,
        caseData.judgment_type
    ]);

    const query = `
            INSERT INTO case_management (
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
                judgment_text,
                judgment_type
            ) VALUES ${placeholders}
            RETURNING *
    `;

    const result = await dbClient.query(query, values);
    
    console.log(`[info] [insertOrder] Inserted ${newCases.length} new cases, ${existingCases.length} cases already existed`);
    
    return {
        inserted: newCases.length,
        existing: existingCases.length,
        message: `Inserted ${newCases.length} new cases, ${existingCases.length} cases already existed`,
        data: result.rows
    };
}

module.exports = {
  connectToDatabase,
  insertOrder
}