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
            INSERT INTO case_details (
                serial_number, diary_number, case_number, parties, advocates, 
                bench, judgment_by, judgment_date, court, date, created_at, 
                updated_at, judgment_url, file_path, judgment_text, case_type, 
                city, district, judgment_type, "courtComplex", "courtType",
                filing_number, filing_date, registered_on, case_status,
                all_parties, listing_history, order_details, site_sync
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING id;
        `;

        let insertedCount = 0;
        let errorCount = 0;

        for (const orderData of ordersData) {
            try {
                // Parse case_details_json if it exists and extract the arrays
                let allParties = [];
                let listingHistory = [];
                let orderDetails = [];
                
                if (orderData.case_details_json) {
                    try {
                        const caseDetails = typeof orderData.case_details_json === 'string' 
                            ? JSON.parse(orderData.case_details_json) 
                            : orderData.case_details_json;
                        
                        allParties = caseDetails.all_parties || [];
                        listingHistory = caseDetails.listing_history || [];
                        orderDetails = caseDetails.order_details || [];
                    } catch (parseError) {
                        console.error(`[database] Error parsing case_details_json:`, parseError.message);
                    }
                }
                
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
                    JSON.stringify(orderData.judgment_url || []),  // Convert to JSON string for Json type
                    orderData.file_path,
                    orderData.judgment_text || [],  // Array of strings
                    orderData.case_type,
                    orderData.city,
                    orderData.district,
                    orderData.judgment_type,
                    orderData.courtComplex,
                    orderData.courtType,
                    orderData.filing_number,
                    orderData.filing_date,
                    orderData.registered_on,
                    orderData.case_status,
                    allParties,  // Pass as array for Json[] type (PostgreSQL will handle conversion)
                    listingHistory,  // Pass as array for Json[] type
                    orderDetails,  // Pass as array for Json[] type
                    1  // site_sync = 1 (successful extraction and save)
                ];

                await client.query(query, values);
                insertedCount++;
                console.log(`✅  Inserted case: ${orderData.case_number} with site_sync = 1`);
            } catch (error) {
                console.error(`❌  Error inserting order ${orderData.serial_number}:`, error.message);
                console.error(`[database] Error details:`, error);
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
// Add this new function in database.js
async function upsertCaseDetails(client, caseId, orderData) {
    try {
        console.log(`[database] Upserting case with ID: ${caseId}`);
        
        // Parse case_details_json if it exists
        let allParties = [];
        let listingHistory = [];
        let orderDetails = [];
        
        if (orderData.case_details_json) {
            try {
                const caseDetails = typeof orderData.case_details_json === 'string' 
                    ? JSON.parse(orderData.case_details_json) 
                    : orderData.case_details_json;
                
                allParties = caseDetails.all_parties || [];
                listingHistory = caseDetails.listing_history || [];
                orderDetails = caseDetails.order_details || [];
            } catch (parseError) {
                console.error(`[database] Error parsing case_details_json:`, parseError.message);
            }
        }

        const query = `
            UPDATE case_details 
            SET 
                serial_number = $2,
                diary_number = $3,
                case_number = $4,
                parties = $5,
                advocates = $6,
                bench = $7,
                judgment_by = $8,
                judgment_date = $9,
                court = $10,
                date = $11,
                updated_at = $12,
                judgment_url = $13,
                file_path = $14,
                judgment_text = $15,
                case_type = $16,
                city = $17,
                district = $18,
                judgment_type = $19,
                "courtComplex" = $20,
                "courtType" = $21,
                filing_number = $22,
                filing_date = $23,
                registered_on = $24,
                case_status = $25,
                all_parties = $26,
                listing_history = $27,
                order_details = $28,
                site_sync = $29
            WHERE id = $1
            RETURNING id;
        `;

        const values = [
            caseId, // $1
            orderData.serial_number, // $2
            orderData.diary_number, // $3
            orderData.case_number, // $4
            orderData.parties, // $5
            orderData.advocates, // $6
            orderData.bench, // $7
            orderData.judgment_by, // $8
            orderData.judgment_date, // $9
            orderData.court, // $10
            orderData.date, // $11
            orderData.updated_at, // $12
            JSON.stringify(orderData.judgment_url || []), // $13
            orderData.file_path, // $14
            orderData.judgment_text || [], // $15
            orderData.case_type, // $16
            orderData.city, // $17
            orderData.district, // $18
            orderData.judgment_type, // $19
            orderData.courtComplex, // $20
            orderData.courtType, // $21
            orderData.filing_number, // $22
            orderData.filing_date, // $23
            orderData.registered_on, // $24
            orderData.case_status, // $25
            allParties, // $26
            listingHistory, // $27
            orderDetails, // $28
            1 // $29 - site_sync = 1 (successful extraction and save)
        ];

        console.log(`[database] Executing UPDATE query for case ID: ${caseId}`);
        console.log(`[database] Setting site_sync = 1 (data successfully scraped and saved)`);
        console.log(`[database] orderData.district value: "${orderData.district}"`);
        console.log(`[database] Query values - case_number: ${values[3]}, district: ${values[17]}, court: ${values[9]}`);
        console.log(`[database] All critical values:`, {
            case_number: values[3],
            diary_number: values[2],
            parties: values[4] ? values[4].substring(0, 50) + '...' : null,
            district: values[17],
            case_type: values[15],
            site_sync: values[28]
        });
        
        const result = await client.query(query, values);
        
        console.log(`[database] UPDATE result - rowCount: ${result.rowCount}, command: ${result.command}`);
        
        if (result.rowCount > 0) {
            console.log(`✅  Updated case: ${orderData.case_number} with ID: ${caseId}`);
            
            // Verify the update by reading back
            const verifyQuery = `SELECT id, case_number, district, parties FROM case_details WHERE id = $1`;
            const verifyResult = await client.query(verifyQuery, [caseId]);
            if (verifyResult.rows.length > 0) {
                console.log(`[database] Verified update - case_number: ${verifyResult.rows[0].case_number}, district: ${verifyResult.rows[0].district}`);
            } else {
                console.log(`⚠️  Verification failed - case not found after UPDATE!`);
            }
            
            return { success: true, id: caseId };
        } else {
            console.log(`⚠️  No case found with ID: ${caseId}, case not updated`);
            return { success: false, id: caseId };
        }
    } catch (error) {
        console.error(`❌  Error upserting case ${caseId}:`, error.message);
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
    closeDatabase,
    upsertCaseDetails,
}; 