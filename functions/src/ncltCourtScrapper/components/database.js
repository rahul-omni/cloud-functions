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

// FIXED: Insert single NCLT order into database with proper data mapping
// ...existing code...

async function insertOrder(client, orderData) {
    console.log('[database] 🔄 insertOrder called with data summary:');
    console.log('[database] 📊 Order data summary:', {
        diaryNumber: orderData.diaryNumber,
        filingNumber: orderData.filingNumber,
        caseNumber: orderData.caseNumber,
        parties: orderData.parties?.substring(0, 50) + '...',
        bench: orderData.bench,
        availableFields: Object.keys(orderData),
        listingHistoryType: typeof orderData.listingHistory,
        listingHistoryLength: Array.isArray(orderData.listingHistory) ? orderData.listingHistory.length : 'Not array'
    });
    
    if (!client) {
        console.log('[database] ❌ No database client provided');
        return null;
    }
    
    if (!orderData || typeof orderData !== 'object') {
        console.log('[database] ❌ Invalid order data provided');
        return null;
    }
    
    try {
        // Test database connection first
        console.log('[database] 🔍 Testing database connection...');
        await client.query('SELECT 1');
        console.log('[database] ✅ Database connection test passed');
        
        // SIMPLIFIED: Only extract PDF URLs for judgment_url field
        let pdfUrls = [];
        
        console.log('[database] 🔍 Starting PDF URL extraction...');
        
        // Method 1: Direct judgmentUrl array (if it exists and contains strings)
        if (Array.isArray(orderData.judgmentUrl)) {
            console.log('[database] 📊 Found direct judgmentUrl array:', orderData.judgmentUrl.length);
            pdfUrls = orderData.judgmentUrl.filter(url => typeof url === 'string' && url.trim() !== '');
        }
        
        // Method 2: Extract from listingHistory if judgmentUrl is empty
        if (pdfUrls.length === 0 && Array.isArray(orderData.listingHistory)) {
            console.log('[database] 📊 Extracting PDF URLs from listingHistory:', orderData.listingHistory.length, 'entries');
            
            orderData.listingHistory.forEach((entry, index) => {
                if (entry && entry.pdfLinks && Array.isArray(entry.pdfLinks)) {
                    console.log(`[database] 📄 Processing entry ${index + 1}: ${entry.pdfLinks.length} PDF links`);
                    entry.pdfLinks.forEach(pdfLink => {
                        if (pdfLink && (pdfLink.url || pdfLink.href)) {
                            const url = pdfLink.url || pdfLink.href;
                            if (typeof url === 'string' && url.trim() !== '') {
                                pdfUrls.push(url.trim());
                                console.log(`[database] ✅ Added PDF URL: ${url.substring(0, 80)}...`);
                            }
                        }
                    });
                }
            });
            
            console.log('[database] 📊 Total extracted from listingHistory:', pdfUrls.length);
        }
        
        // Remove duplicates and ensure all are valid strings
        pdfUrls = [...new Set(pdfUrls)].filter(url => typeof url === 'string' && url.trim() !== '');
        
        console.log('[database] 📊 Final PDF URLs ready for insertion:', {
            count: pdfUrls.length,
            allAreStrings: pdfUrls.every(url => typeof url === 'string'),
            sampleUrls: pdfUrls.slice(0, 3).map(url => url.substring(0, 80) + '...')
        });
        
        // CRITICAL: Validate that we're not passing complex objects
        if (pdfUrls.some(url => typeof url !== 'string')) {
            console.error('[database] ❌ CRITICAL: Non-string values detected in PDF URLs!');
            pdfUrls = pdfUrls.filter(url => typeof url === 'string');
            console.log('[database] 🔧 Filtered to only strings:', pdfUrls.length);
        }
        
        // SIMPLIFIED: Only basic text arrays, no complex JSONB
        const judgmentTexts = Array.isArray(orderData.judgmentText) 
            ? orderData.judgmentText.filter(text => typeof text === 'string') 
            : [];
        
        console.log('[database] 📊 Data ready for insertion:', {
            pdfUrlsCount: pdfUrls.length,
            pdfUrlsType: typeof pdfUrls,
            allValidStrings: pdfUrls.every(url => typeof url === 'string' && url.length > 0),
            judgmentTextsCount: judgmentTexts.length
        });
        
        // SIMPLIFIED INSERT: No complex JSONB fields, only essential data
        const insertQuery = `
            INSERT INTO case_management (
                serial_number, diary_number, case_number, parties, advocates,
                bench, judgment_by, judgment_date, court, date,
                judgment_url, file_path, judgment_text, case_type,
                city, district, judgment_type, "courtComplex", "courtType",
                filing_number, filing_date, party_name, petitioner_advocate, respondent_advocate,
                registered_on, last_listed, next_listing_date, case_status,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28,
                NOW(), NOW()
            ) RETURNING id, diary_number, filing_number, case_number, bench, judgment_url
        `;
        
        const values = [
            orderData.serialNumber?.toString() || '1',                    // $1 serial_number
            orderData.diaryNumber || '',                                  // $2 diary_number (required)
            orderData.caseNumber || null,                                 // $3 case_number
            orderData.parties || null,                                    // $4 parties
            orderData.advocates || null,                                  // $5 advocates
            orderData.bench || null,                                      // $6 bench
            orderData.judgmentBy || null,                                 // $7 judgment_by
            orderData.judgmentDate || null,                               // $8 judgment_date
            orderData.court || 'NCLT Court',                             // $9 court (required field)
            new Date(),                                                   // $10 date (required with default now())
            pdfUrls,                                                      // $11 judgment_url (PostgreSQL text[] - ONLY CLEAN PDF URLs)
            orderData.filePath || '',                                     // $12 file_path (default "")
            judgmentTexts,                                                // $13 judgment_text (PostgreSQL text[] - CLEAN STRING ARRAY)
            orderData.caseType || '',                                     // $14 case_type (default "")
            orderData.city || '',                                         // $15 city (default "")
            orderData.district || '',                                     // $16 district (default "")
            orderData.judgmentType || '',                                 // $17 judgment_type (default "")
            orderData.courtComplex || null,                               // $18 courtComplex (camelCase in DB)
            orderData.courtType || null,                                  // $19 courtType (camelCase in DB)
            orderData.filingNumber || null,                               // $20 filing_number
            orderData.filingDate || null,                                 // $21 filing_date
            orderData.partyName || null,                                  // $22 party_name
            orderData.petitionerAdvocate || null,                         // $23 petitioner_advocate
            orderData.respondentAdvocate || null,                         // $24 respondent_advocate
            orderData.registeredOn || null,                               // $25 registered_on
            orderData.lastListed || null,                                 // $26 last_listed
            orderData.nextListingDate || null,                            // $27 next_listing_date
            orderData.caseStatus || null                                  // $28 case_status
            // REMOVED: order_details, all_parties, listing_history (complex JSONB fields)
        ];
        
        console.log('[database] 🔄 Final validation before insert:');
        console.log('[database] 📊 Insert values summary:', {
            valuesCount: values.length,
            serialNumber: values[0],
            diaryNumber: values[1],
            caseNumber: values[2],
            filingNumber: values[19],
            parties: values[3]?.substring(0, 50) + '...',
            bench: values[5],
            court: values[8],
            judgment_url_type: typeof values[10],
            judgment_url_is_array: Array.isArray(values[10]),
            judgment_url_count: Array.isArray(values[10]) ? values[10].length : 'Not array',
            judgment_url_all_strings: Array.isArray(values[10]) ? values[10].every(url => typeof url === 'string') : false,
            judgment_url_sample: Array.isArray(values[10]) ? values[10].slice(0, 2).map(url => url?.substring(0, 60) + '...') : values[10]
        });
        
        // FINAL SAFETY CHECK
        if (!Array.isArray(values[10]) || !values[10].every(url => typeof url === 'string')) {
            throw new Error('judgment_url field contains non-string values or is not an array');
        }
        
        console.log('[database] 🚀 Executing simplified insert query...');
        const result = await client.query(insertQuery, values);
        
        if (result.rows && result.rows.length > 0) {
            const insertedRecord = result.rows[0];
            console.log('[database] ✅ Successfully inserted NCLT case with ID:', insertedRecord.id);
            console.log('[database] 📊 Inserted case summary:', {
                id: insertedRecord.id,
                diary_number: insertedRecord.diary_number,
                filing_number: insertedRecord.filing_number,
                case_number: insertedRecord.case_number,
                bench: insertedRecord.bench,
                pdf_urls_saved: Array.isArray(insertedRecord.judgment_url) ? insertedRecord.judgment_url.length : 0
            });
            
            return insertedRecord.id;
        } else {
            console.log('[database] ❌ Insert query executed but no rows returned');
            return null;
        }
        
    } catch (error) {
        console.error('[database] ❌ Insert failed:', error.message);
        console.error('[database] 📊 Error details:', {
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            constraint: error.constraint
        });
        
        // Enhanced error debugging
        if (error.code === '22P02') {
            console.error('[database] ❌ POSTGRESQL ARRAY PARSING ERROR');
            console.log('[database] 🔍 This means a complex object was passed to judgment_url instead of clean strings');
            
            // Debug the actual data being passed
            console.log('[database] 🔍 Debug judgment_url data:', {
                type: typeof orderData.judgmentUrl,
                isArray: Array.isArray(orderData.judgmentUrl),
                length: Array.isArray(orderData.judgmentUrl) ? orderData.judgmentUrl.length : 'Not array',
                sample: Array.isArray(orderData.judgmentUrl) ? orderData.judgmentUrl.slice(0, 1) : orderData.judgmentUrl
            });
        }
        
        throw error;
    }
}

// ...existing code...

// ...existing code...
// ENHANCED: Bulk insert with better error handling and debugging
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

        // ENHANCED: Log sample data structure
        console.log('🔍 Sample order data structure:', {
            firstOrderKeys: Object.keys(ordersData[0] || {}),
            sampleData: ordersData[0] || {}
        });

        let totalInserted = 0;
        let totalErrors = 0;
        const errors = [];
        
        for (let i = 0; i < ordersData.length; i++) {
            const orderData = ordersData[i];
            try {
                console.log(`💾 Processing NCLT case ${i + 1}/${ordersData.length}:`, {
                    diaryNumber: orderData.diaryNumber,
                    filingNumber: orderData.filingNumber,
                    caseNumber: orderData.caseNumber,
                    pdfCount: orderData.judgmentUrl?.length || orderData.pdfLinks?.length || 0
                });
                
                const result = await insertOrder(client, orderData);
                if (result) {
                    totalInserted++;
                    console.log(`✅ Individual insert succeeded: ${orderData.diaryNumber || orderData.filingNumber} (ID: ${result})`);
                } else {
                    console.log(`⚠️ Insert skipped for: ${orderData.diaryNumber || orderData.filingNumber}`);
                }
            } catch (error) {
                totalErrors++;
                const errorInfo = {
                    diaryNumber: orderData.diaryNumber || orderData.filingNumber,
                    error: error.message
                };
                errors.push(errorInfo);
                console.error(`❌ Individual insert failed for ${orderData.diaryNumber || orderData.filingNumber}:`, error.message);
            }
        }
        
        console.log(`📊 NCLT Bulk Insert Summary:`);
        console.log(`   Total Orders: ${ordersData.length}`);
        console.log(`   Successfully Inserted: ${totalInserted}`);
        console.log(`   Skipped: ${ordersData.length - totalInserted - totalErrors}`);
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
        console.error('❌ Full error:', error);
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