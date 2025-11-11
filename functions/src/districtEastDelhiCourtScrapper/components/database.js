const { Client } = require('pg');
const functions = require('firebase-functions');

// Database connection configuration
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

//Currently not Bulk insert, future updates will be Bulk insert orders into the database
async function bulkInsertOrders(client, ordersData) {
    try {
        console.log(`[database] Starting bulk insert of ${ordersData.length} orders...`);
        
        const query = `
            INSERT INTO case_management (
                serial_number, diary_number, case_number, parties, advocates, 
                bench, judgment_by, judgment_date, court, date, created_at, 
                updated_at, judgment_url, file_path, judgment_text, case_type, 
                city, district, judgment_type, "courtComplex", "courtType"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id;
        `;

        let insertedCount = 0;
        let errorCount = 0;

        for (const orderData of ordersData) {
            try {
                const values = [
                    orderData.serial_number,
                    orderData.diary_number,
                    orderData.case_number,
                    orderData.parties,
                    orderData.advocates,
                    orderData.bench,
                    orderData.judgment_by,
                    orderData.judgment_date,
                    orderData.court,
                    orderData.date,
                    orderData.created_at,
                    orderData.updated_at,
                    orderData.judgment_url,
                    orderData.file_path,
                    orderData.judgment_text,
                    orderData.case_type,
                    orderData.city,
                    orderData.district,
                    orderData.judgment_type,
                    orderData.courtComplex,
                    orderData.courtType
                ];

                await client.query(query, values);
                insertedCount++;
            } catch (error) {
                console.error(`❌  Error inserting order ${orderData.serial_number}:`, error.message);
                errorCount++;
            }
        }

        console.log(`✅  Bulk insert completed: ${insertedCount} successful, ${errorCount} errors`);
        return { inserted: insertedCount, errors: errorCount };
    } catch (error) {
        console.error('❌  Error in bulk insert:', error.message);
        throw error;
    }
}

// Close database connection
async function closeDatabase(client) {
    try {
        if (client) {
            await client.end();
            console.log('✅  Database connection closed');
        }
    } catch (error) {
        console.error('❌  Error closing database connection:', error.message);
        throw new Error(`Failed to close database connection: ${error.message}`);
    }
}

module.exports = {
    connectToDatabase,
    bulkInsertOrders,
    closeDatabase
}; 