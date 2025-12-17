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
    console.log("orderData:", orderData);

    console.log("orderData CaseType:", orderData.case_type);

    if (orderData.case_type && orderData.DiaryNumber) {
      caseType = orderData.case_type;
      caseNumber = orderData.case_type + '/' + orderData.DiaryNumber;
    }
    console.log("caseType:", caseType);

    const diaryNumber = orderData['Diary Number'] || '';
    
    // Prepare judgment URL array
    const judgmentUrl = orderData.judgment_url || null;

    // Prepare judgment text array
    const judgmentText = null;
    
    const judgmentType = orderData.Order?.text || null;
    // Prepare file path (GCS path if available)
    const filePath = orderData.Order?.gcsPath || null;

    const parties = orderData["Petitioner / Respondent"] || '';
    
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
// ...existing code...
     console.log("benchValue:", benchValue);
     console.log("cityValue:", cityValue);
     console.log("caseType:", caseType);
     console.log("judgmentType:", judgmentType);

    const result = await dbClient.query(insertQuery, [
      orderData.SerialNumber || '',                    // serial_number
      diaryNumber,                                      // diary_number
      caseNumber,                                       // case_number
      parties,                                             // parties (not available from scraping)
      null,                                             // advocates (not available from scraping)
      benchValue,                                      // bench (hardcoded based on scraper)
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
      cityValue,                                         // city (hardcoded based on scraper)
      '',                                              // district (hardcoded based on scraper)
      judgmentType                                     // judgment_type (single text field)
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌  Failed to insert order:', error.message);
    throw error;
  }
}

async function updateJudgmentUrl(dbClient, id, newJudgmentUrl, sync_site) {
  try {
    const updateQuery = `
      UPDATE case_details
      SET 
        judgment_url = $1,
        updated_at = $2,
        site_sync = $3
      WHERE id = $4
      RETURNING id, judgment_url;
    `;

    const result = await dbClient.query(updateQuery, [
      newJudgmentUrl,
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

async function bulkInsertOrders(client, ordersData, batchSize = 100) {
  const filteredOrders = ordersData.filter(order =>
    (order.Bench || order.bench || order.requestBench || '').trim() !== ''
  );
  if (!client) {
    console.log('⚠️  Database client not available, skipping bulk insertion');
    return { totalInserted: 0, totalBatches: 0, errors: [] };
  }
  if (!filteredOrders || filteredOrders.length === 0) {
    console.log('⚠️  No valid orders to insert (bench missing)');
    return { totalInserted: 0, totalBatches: 0, errors: [] };
  }

  console.log(`📦  Starting bulk insert for ${filteredOrders.length} orders in batches of ${batchSize}`);

  const batches = [];
  const errors = [];
  let totalInserted = 0;

  // Split filteredOrders into batches
  for (let i = 0; i < filteredOrders.length; i += batchSize) {
    batches.push(filteredOrders.slice(i, i + batchSize));
  }

  console.log(`📋  Processing ${batches.length} batches...`);

  // Process each batch
  for (const [batchIndex, batch] of batches.entries()) {
    try {
      console.log(`📦  Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} orders)...`);

      const values = [];
      const placeholders = [];

      batch.forEach((orderData, orderIndex) => {
        let judgmentDate = orderData.JudgetmentDate || null;
        let caseNumber = null;
        let caseType = null;
        if (orderData.case_type) {
          caseType = orderData.case_type;
          caseNumber = orderData.case_type + '/' + orderData.DiaryNumber;
        }
        const judgmentUrl = orderData.Order?.href ? [orderData.Order.href] : null;
        const judgmentText = null;
        const judgmentType = orderData.Order?.text || null;
        const filePath = orderData.Order?.gcsPath || null;

        const offset = orderIndex * 19;
        placeholders.push(`(gen_random_uuid(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19})`);

        values.push(
          orderData.SerialNumber || '',
          orderData.DiaryNumber || '',
          caseNumber,
          null,
          null,
          orderData.Bench || orderData.bench || '',
          null,
          judgmentDate,
          'High Court',
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
          judgmentUrl,
          filePath,
          judgmentText,
          caseType,
          orderData.city || '',
          '',
          judgmentType
        );
      });

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
        ) VALUES ${placeholders.join(', ')}
        RETURNING id;
      `;

      await client.query('BEGIN');
      const result = await client.query(insertQuery, values);
      await client.query('COMMIT');

      const insertedCount = result.rows.length;
      totalInserted += insertedCount;

      console.log(`✅  Batch ${batchIndex + 1}/${batches.length} completed - inserted ${insertedCount} orders`);

    } catch (error) {
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

  const summary = {
    totalInserted,
    totalBatches: batches.length,
    successfulBatches: batches.length - errors.length,
    failedBatches: errors.length,
    errors
  };

  console.log(`\n📊  Bulk Insert Summary:`);
  console.log(`   Total orders processed: ${filteredOrders.length}`);
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

async function getCaseDetails(dbClient, id) {
  try {
    const getQuery = `
      select diary_number, case_type from case_details where id = $1;
    `;

    const result = await dbClient.query(getQuery, [
      id,
    ]);

    console.log("getCaseDetails result:", result);

    if (result.rowCount === 0) {
      console.warn(`⚠️  No record found with id: ${id}`);
      return null;
    }
    return result.rows[0];
  } catch (error) {
    console.error(`❌  Failed to update judgment URL for id ${id}:`, error.message);
    throw error;
  }
}

module.exports = {
  connectToDatabase,
  insertOrder,
  bulkInsertOrders,
  updateJudgmentUrl,
  getCaseDetails
}; 