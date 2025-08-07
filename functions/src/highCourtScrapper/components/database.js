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
    // Keep judgment date in dd-mm-yyyy format for database
    let judgmentDate = orderData.JudgetmentDate || null;
    
    // Extract case number from diary number if possible
    let caseNumber = null;
    let caseType = null;
    if (orderData.case_type) {
      caseType = orderData.case_type;
      caseNumber = orderData.case_type + '/' + orderData.DiaryNumber;
    }
    
    // Prepare judgment URL array
    const judgmentUrl = orderData.Order?.href ? [orderData.Order.href] : null;
    
    // Prepare judgment text array
    const judgmentText = null;
    
    const judgmentType = orderData.Order?.text || null;
    // Prepare file path (GCS path if available)
    const filePath = orderData.Order?.gcsPath || null;
    
    // Insert new record
    const insertQuery = `
      INSERT INTO case_management (
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
    
    const result = await dbClient.query(insertQuery, [
      orderData.SerialNumber || '',                    // serial_number
      orderData.DiaryNumber || '',                     // diary_number
      caseNumber,                                      // case_number
      null,                                            // parties (not available from scraping)
      null,                                            // advocates (not available from scraping)
      'Principal Bench at Delhi',                      // bench (hardcoded based on scraper)
      null,                                            // judgment_by (not available from scraping)
      judgmentDate,                                    // judgment_date
      'High Court',                                    // court (hardcoded based on scraper)
      new Date().toISOString(),                        // date (current timestamp as ISO string)
      new Date().toISOString(),                        // created_at (current timestamp as ISO string)
      new Date().toISOString(),                        // updated_at (current timestamp as ISO string)
      judgmentUrl,                                     // judgment_url (array)
      filePath,                                        // file_path
      judgmentText,                                    // judgment_text (array)
      caseType,                                        // case_type
      'Delhi',                                         // city (hardcoded based on scraper)
      '',                                              // district (hardcoded based on scraper)
      judgmentType                                     // judgment_type (single text field)
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌  Failed to insert order:', error.message);
    throw error;
  }
}

// Bulk insert orders into database
async function bulkInsertOrders(client, ordersData, batchSize = 100) {
  if (!client) {
    console.log('⚠️  Database client not available, skipping bulk insertion');
    return { totalInserted: 0, totalBatches: 0, errors: [] };
  }

  if (!ordersData || ordersData.length === 0) {
    console.log('⚠️  No orders to insert');
    return { totalInserted: 0, totalBatches: 0, errors: [] };
  }

  console.log(`📦  Starting bulk insert for ${ordersData.length} orders in batches of ${batchSize}`);
  
  const batches = [];
  const errors = [];
  let totalInserted = 0;

  // Split orders into batches
  for (let i = 0; i < ordersData.length; i += batchSize) {
    batches.push(ordersData.slice(i, i + batchSize));
  }

  console.log(`📋  Processing ${batches.length} batches...`);

  // Process each batch
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      console.log(`📦  Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} orders)...`);
      
      // Prepare data for this batch
      const values = [];
      const placeholders = [];
      
      batch.forEach((orderData, orderIndex) => {
        // Parse judgment date - keep in dd-mm-yyyy format
        let judgmentDate = orderData.JudgetmentDate || null;
        
        // Extract case number and type
        let caseNumber = null;
        let caseType = null;
        if (orderData.case_type) {
          caseType = orderData.case_type;
          caseNumber = orderData.case_type + '/' + orderData.DiaryNumber;
        }
        
        // Prepare URLs and file paths
        const judgmentUrl = orderData.Order?.href ? [orderData.Order.href] : null;
        const judgmentText = null;
        const judgmentType = orderData.Order?.text || null;
        const filePath = orderData.Order?.gcsPath || null;
        
        // Calculate parameter positions for this order (19 parameters per order)
        const offset = orderIndex * 19;
        placeholders.push(`(gen_random_uuid(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19})`);
        
        // Add values for this order
        values.push(
          orderData.SerialNumber || '',                    // $1 serial_number
          orderData.DiaryNumber || '',                     // $2 diary_number
          caseNumber,                                      // $3 case_number
          null,                                            // $4 parties
          null,                                            // $5 advocates
          'Principal Bench at Delhi',                      // $6 bench
          null,                                            // $7 judgment_by
          judgmentDate,                                    // $8 judgment_date
          'High Court',                                    // $9 court
          new Date().toISOString(),                        // $10 date
          new Date().toISOString(),                        // $11 created_at
          new Date().toISOString(),                        // $12 updated_at
          judgmentUrl,                                     // $13 judgment_url
          filePath,                                        // $14 file_path
          judgmentText,                                    // $15 judgment_text
          caseType,                                        // $16 case_type
          'Delhi',                                         // $17 city
          '',                                              // $18 district
          judgmentType                                     // $19 judgment_type
        );
      });

      // Build the bulk INSERT query
      const insertQuery = `
        INSERT INTO case_management (
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
        ) VALUES ${placeholders.join(', ')}
        RETURNING id;
      `;

      // Execute the batch insert within a transaction
      await client.query('BEGIN');
      const result = await client.query(insertQuery, values);
      await client.query('COMMIT');
      
      const insertedCount = result.rows.length;
      totalInserted += insertedCount;
      
      console.log(`✅  Batch ${batchIndex + 1}/${batches.length} completed - inserted ${insertedCount} orders`);
      
    } catch (error) {
      // Rollback transaction on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌  Rollback failed:', rollbackError.message);
      }
      
      console.error(`❌  Batch ${batchIndex + 1}/${batches.length} failed:`, error.message);
      errors.push({
        batchIndex: batchIndex + 1,
        batchSize: batch.length,
        error: error.message,
        orders: batch.map(order => `${order.DiaryNumber} (${order.case_type})`)
      });
      
      // Optional: Try individual inserts for failed batch
      console.log(`🔄  Attempting individual inserts for failed batch ${batchIndex + 1}...`);
      for (const orderData of batch) {
        try {
          const orderId = await insertOrder(client, orderData);
          totalInserted++;
          console.log(`✅  Individual insert succeeded: ${orderData.DiaryNumber} (ID: ${orderId})`);
        } catch (individualError) {
          console.error(`❌  Individual insert failed for ${orderData.DiaryNumber}:`, individualError.message);
        }
      }
    }
  }

  // Summary
  const summary = {
    totalInserted,
    totalBatches: batches.length,
    successfulBatches: batches.length - errors.length,
    failedBatches: errors.length,
    errors
  };

  console.log(`\n📊  Bulk Insert Summary:`);
  console.log(`   Total orders processed: ${ordersData.length}`);
  console.log(`   Total batches: ${summary.totalBatches}`);
  console.log(`   Successful batches: ${summary.successfulBatches}`);
  console.log(`   Failed batches: ${summary.failedBatches}`);
  console.log(`   Total orders inserted: ${summary.totalInserted}`);
  
  if (errors.length > 0) {
    console.log(`\n❌  Failed Batches Details:`);
    errors.forEach((error, index) => {
      console.log(`   ${index + 1}. Batch ${error.batchIndex}: ${error.error}`);
    });
  }

  return summary;
}

module.exports = {
  connectToDatabase,
  insertOrder,
  bulkInsertOrders
}; 