const { Client } = require('pg');
const functions = require('firebase-functions');

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

// Insert single NCLT order into database  
async function insertOrder(dbClient, orderData) {
    try {
        const benchValue = orderData.bench || '';
        if (!benchValue.trim()) {
            console.log(`⏭️ Skipping insert for ${orderData.diaryNumber} - bench missing`);
            return null;
        }

        // Prepare data using the working District Court pattern
        const judgmentDate = orderData.judgmentDate || orderData.filingDate || null;
        const caseNumber = orderData.caseNumber || orderData.filingNumber || null;
        const caseType = orderData.case_type || 'Company Petition IB (IBC)';

        // Prepare judgment URL array - extract unique PDF URLs
        const uniquePdfUrls = [];
        if (orderData.judgmentUrl && Array.isArray(orderData.judgmentUrl)) {
            const seenUrls = new Set();
            orderData.judgmentUrl.forEach(url => {
                if (url && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    uniquePdfUrls.push(url);
                }
            });
        }
        
        const judgmentUrl = uniquePdfUrls;
        const judgmentText = Array.isArray(orderData.judgmentText) ? orderData.judgmentText : [];
        const judgmentType = orderData.judgment_type || '';
        const filePath = orderData.file_path || '';

        console.log(`💾 Inserting NCLT case: ${caseNumber || orderData.diaryNumber} with ${uniquePdfUrls.length} PDF URLs`);

        // Use the enhanced insert pattern for NCLT with all new fields
        const query = `
            INSERT INTO case_management (
                serial_number, diary_number, case_number, parties, advocates, 
                bench, judgment_by, judgment_date, court, date, created_at, 
                updated_at, judgment_url, file_path, judgment_text, case_type, 
                city, district, judgment_type, "courtComplex", "courtType",
                filing_number, filing_date, party_name, petitioner_advocate,
                respondent_advocate, registered_on, last_listed, next_listing_date,
                case_status, order_details, all_parties, listing_history
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
            RETURNING id;
        `;

        const values = [
            orderData.serialNumber || '1',                     // serial_number
            orderData.diaryNumber ||  '',  // diary_number (use filing number as fallback)
            caseNumber,                                        // case_number
            orderData.parties || orderData.partyName || '',    // parties
            orderData.advocates || orderData.petitionerAdvocate || '', // advocates
            benchValue,                                        // bench
            orderData.judgmentBy || '',                        // judgment_by
            judgmentDate,                                      // judgment_date
            'Nclt Court',                                      // court
            new Date().toISOString(),                          // date
            new Date().toISOString(),                          // created_at
            new Date().toISOString(),                          // updated_at
            judgmentUrl,                                       // judgment_url (array)
            filePath,                                          // file_path
            judgmentText,                                      // judgment_text (array)
            caseType,                                          // case_type
            orderData.city || benchValue,                         // city
            orderData.district || '',                          // district
            judgmentType,                                      // judgment_type
            orderData.courtComplex || null,                    // courtComplex
            orderData.courtType || null,                       // courtType
            // NEW NCLT-SPECIFIC FIELDS:
            orderData.filingNumber || '',                      // filing_number
            orderData.filingDate || '',                        // filing_date
            orderData.partyName || '',                         // party_name
            orderData.petitionerAdvocate || '',                // petitioner_advocate
            orderData.respondentAdvocate || '',                // respondent_advocate
            orderData.registeredOn || '',                      // registered_on
            orderData.lastListed || '',                        // last_listed
            orderData.nextListingDate || '',                   // next_listing_date
            orderData.caseStatus || '',                        // case_status
            orderData.orderDetails || [],                      // order_details (JSON array)
            orderData.allParties || [],                        // all_parties (JSON array)
            orderData.listingHistory || []                     // listing_history (JSON array)
        ];

        console.log('💾 Database Insert Values:', {
            serial_number: values[0],
            diary_number: values[1],
            case_number: values[2],
            parties: values[3]?.substring(0, 50) + '...',
            bench: values[5],
            court: values[8],
            pdf_count: judgmentUrl.length,
            // NEW NCLT FIELDS:
            filing_number: values[21],
            filing_date: values[22],
            party_name: values[23]?.substring(0, 50) + '...',
            case_status: values[29],
            registered_on: values[26],
            last_listed: values[27],
            next_listing_date: values[28]
        });

        const result = await dbClient.query(query, values);
        console.log(`✅ Successfully inserted NCLT case with ID: ${result.rows[0].id}`);
        return result.rows[0].id;
        
    } catch (error) {
        console.error('❌ Failed to insert NCLT order:', error.message);
        console.error('🔍 Order data summary:', {
            diaryNumber: orderData.diaryNumber,
            caseNumber: orderData.caseNumber,
            parties: orderData.parties?.substring(0, 50) + '...',
            bench: orderData.bench,
            pdfCount: orderData.judgmentUrl?.length || 0
        });
        throw error;
    }
}

// Bulk insert orders into the database
async function bulkInsertOrders(client, ordersData) {
    try {
        console.log(`📦 Starting bulk insert for ${ordersData.length} NCLT orders`);
        
        if (!client) {
            console.log('⚠️ Database client not available, skipping bulk insertion');
            return { totalInserted: 0, totalBatches: 0, errors: [] };
        }
        
        if (!ordersData || ordersData.length === 0) {
            console.log('⚠️ No NCLT orders to insert');
            return { totalInserted: 0, totalBatches: 0, errors: [] };
        }

        let totalInserted = 0;
        let totalErrors = 0;
        const errors = [];
        
        for (const orderData of ordersData) {
            try {
                console.log(`💾 Processing NCLT case: ${orderData.diaryNumber} with ${orderData.judgmentUrl?.length || 0} PDF URLs`);
                
                const result = await insertOrder(client, orderData);
                if (result) {
                    totalInserted++;
                    console.log(`✅ Individual insert succeeded: ${orderData.diaryNumber} (ID: ${result})`);
                }
            } catch (error) {
                totalErrors++;
                const errorInfo = {
                    diaryNumber: orderData.diaryNumber,
                    error: error.message
                };
                errors.push(errorInfo);
                console.error(`❌ Individual insert failed for ${orderData.diaryNumber}:`, error.message);
            }
        }
        
        console.log(`📊 NCLT Bulk Insert Summary:`);
        console.log(`   Total Orders: ${ordersData.length}`);
        console.log(`   Successfully Inserted: ${totalInserted}`);
        console.log(`   Errors: ${totalErrors}`);
        
        if (errors.length > 0) {
            console.log(`❌ Error Details:`);
            errors.forEach((err, index) => {
                console.log(`   ${index + 1}. ${err.diaryNumber}: ${err.error}`);
            });
        }
        
        return {
            totalInserted,
            totalBatches: 1,
            errors,
            success: totalInserted > 0
        };
        
    } catch (error) {
        console.error('❌ Error in NCLT bulk insert:', error.message);
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
    insertOrder,
    bulkInsertOrders,
    closeDatabase
};
