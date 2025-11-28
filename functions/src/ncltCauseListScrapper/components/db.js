const { Client } = require('pg');
const functions = require('firebase-functions');

/**
 * Database connection using shared config
 */
const db = require('../../config/database');

/**
 * Connect to database
 */
async function connectToDatabase() {
    try {
        const client = new Client({
            connectionString: functions.config().environment.database_url,
            ssl: {
                rejectUnauthorized: false
            }
        });
        
        await client.connect();
        console.log('[db] ✅ Connected to PostgreSQL database');
        return client;
    } catch (error) {
        console.error('[db] ❌ Database connection failed:', error.message);
        return null;
    }
}

/**
 * Insert NCLT cause list files (PDF links and metadata)
 */
const insertNCLTCauselistFiles = async (results, formData = {}) => {
  console.log('[debug] [db] Inserting NCLT causelist files into database...');
  if (!Array.isArray(results) || results.length === 0) {
    console.log('[debug] [db] No results to insert.');
    return { inserted: 0, errors: [] };
  }

  const insertSql = `
    INSERT INTO nclt_cause_list_files (
      serial_number,
      bench,
      court,
      date,
      pdf_url,
      pdf_filename,
      file_size,
      number_of_entries,
      title,
      cause_date,
      search_parameters,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
    ) RETURNING id`;

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of results) {
    const params = [
      row?.serialNumber ?? '',                  // $1  serial_number
      row?.benchName ?? formData?.bench ?? '',  // $2  bench
      'Nclt Court',                            // $3  court
      row?.causeDate ?? formData?.causeListDate ?? '', // $4  date
      row?.pdfUrl ?? '',                        // $5  pdf_url
      row?.pdfFileName ?? '',                   // $6  pdf_filename
      row?.fileSize ?? '',                      // $7  file_size
      row?.numberOfEntries ?? 0,                // $8  number_of_entries
      row?.title ?? '',                         // $9  title
      row?.causeDate ?? '',                     // $10 cause_date
      JSON.stringify(formData)                  // $11 search_parameters
    ];

    try {
      // Existence check: same bench, date, and pdf_url
      const existsSql = `
        SELECT 1 FROM nclt_cause_list_files
        WHERE COALESCE(bench,'') = COALESCE($1,'')
          AND date = $2
          AND COALESCE(pdf_url,'') = COALESCE($3,'')
        LIMIT 1
      `;
      const existsParams = [
        params[1], // bench
        params[3], // date
        params[4]  // pdf_url
      ];
      const existsRes = await db.query(existsSql, existsParams);
      if (existsRes.rows && existsRes.rows.length > 0) {
        skipped += 1;
        continue;
      }

      await db.query(insertSql, params);
      inserted += 1;
    } catch (err) {
      console.error('[error] [db] Failed to insert NCLT causelist file row:', err?.message);
      errors.push({ row, error: err?.message });
    }
  }

  console.log(`[debug] [db] NCLT Causelist files insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { inserted, skipped, errors };
};

/**
 * Insert NCLT cause list entries (individual cases)
 */
const insertNCLTCauselist = async (results) => {
  console.log('[debug] [db] Inserting NCLT causelist into database...');
  if (!Array.isArray(results) || results.length === 0) {
    console.log('[debug] [db] No results to insert.');
    return { inserted: 0, errors: [] };
  }

  const insertSql = `
    INSERT INTO nclt_cause_list (
      id,
      user_id,
      case_id,
      created_at
    ) VALUES (
      gen_random_uuid(), $1, $2, NOW()
    ) RETURNING id`;

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of results) {
    const params = [
      row?.user_id ?? '',
      row?.case_id ?? '',
    ];

    try {
      await db.query(insertSql, params);
      inserted += 1;
    } catch (err) {
      console.error('[error] [db] Failed to insert NCLT causelist row:', err?.message);
      errors.push({ row, error: err?.message });
    }
  }

  console.log(`[debug] [db] NCLT Causelist insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { inserted, skipped, errors };
};

/**
 * Get subscribed NCLT cases for notification matching
 * This function fetches all NCLT cases without updating last_synced
 */
const getNCLTSubscribedCases = async () => {
  const sql = `
    SELECT 
      DISTINCT uc.bench,
      uc.case_number,
      uc.diary_number,
      u.id as user_id,
      u.email,
      u.mobile_number,
      u.country_code
    FROM user_cases uc
    JOIN users u ON u.id = uc.user_id
    WHERE uc.court = 'NCLT' OR uc.court LIKE '%NCLT%' OR uc.court = 'Nclt Court'
  `;

  try {
    const { rows } = await db.query(sql);
    console.log(`[debug] [getNCLTSubscribedCases] Found ${rows.length} NCLT cases in database`);
    return rows;
  } catch (error) {
    console.error('[error] [getNCLTSubscribedCases] Database query failed:', error.message);
    return [];
  }
};

/**
 * Get subscribed NCLT cases with last_synced update (for scheduled processing)
 */
const getNCLTSubscribedCasesWithSync = async (limit = 100) => {
  const sql = `
      WITH rows_to_update AS (
      SELECT uc.id
      FROM user_cases uc
      JOIN users u ON uc.user_id = u.id
      WHERE (uc.last_synced IS NULL OR uc.last_synced::date <> CURRENT_DATE)
        AND (uc.court = 'NCLT' OR uc.court LIKE '%NCLT%' OR uc.court = 'Nclt Court')
      LIMIT $1
  )
  UPDATE user_cases uc
  SET last_synced = NOW()
  FROM users u, rows_to_update r
  WHERE uc.id = r.id
    AND uc.user_id = u.id
  RETURNING 
    u.id AS user_id,
    uc.case_number,
    uc.id AS case_id, 
    u.email,
    uc.diary_number,
    u.mobile_number,
    u.country_code,
    uc.bench,
    uc.last_synced`;

  try {
    const { rows } = await db.query(sql, [limit]);
    console.log(`[debug] [getNCLTSubscribedCasesWithSync] Found ${rows.length} NCLT cases in database`);
    return rows;
  } catch (error) {
    console.error('[error] [getNCLTSubscribedCasesWithSync] Database query failed:', error.message);
    return [];
  }
};

/**
 * Insert notifications for NCLT cases
 */
/**
 * Insert notifications for NCLT cases
 */
async function insertNCLTNotifications(notificationData) {
    try {
        const query = `
            INSERT INTO notifications 
            (dairy_number, user_id, method, contact, message, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, dairy_number, user_id, method, contact, message, status
        `;
        
        const values = [
            notificationData.dairy_number || notificationData.case_number,
            notificationData.user_id,
            notificationData.method || 'whatsapp',
            notificationData.contact || notificationData.mobile_number,
            notificationData.message,
            notificationData.status || 'pending',
            notificationData.created_at || new Date()
        ];
        
        // FIX: Use db.query instead of pool.query
        const result = await db.query(query, values);
        return result.rows[0]; // Returns the inserted row with ID
        
    } catch (error) {
        console.error('Error inserting notification:', error);
        throw error;
    }
}


/**
 * Find matching user cases for NCLT case numbers
 */
const findNCLTCaseMatches = async (caseNumber, bench = '') => {
  try {
    const query = `
      SELECT 
        uc.id,
        uc.user_id,
        uc.diary_number,
        uc.case_number,
        uc.court,
        uc.bench,
        uc.status,
        u.email,
        u.mobile_number,
        u.country_code
      FROM user_cases uc
      JOIN users u ON u.id = uc.user_id
      WHERE (uc.case_number = $1 OR uc.diary_number = $1)
      AND (uc.court = 'NCLT' OR uc.court LIKE '%NCLT%' OR uc.court = 'Nclt Court')
      AND ($2 = '' OR uc.bench = $2 OR uc.bench IS NULL)
    `;
    
    const result = await db.query(query, [caseNumber, bench]);
    return result.rows || [];
    
  } catch (error) {
    console.error(`[error] [findNCLTCaseMatches] Database query failed for case ${caseNumber}:`, error.message);
    return [];
  }
};

module.exports = {
  insertNCLTCauselist,
  insertNCLTCauselistFiles,
  getNCLTSubscribedCases,
  getNCLTSubscribedCasesWithSync,
  insertNCLTNotifications,
  findNCLTCaseMatches,
  connectToDatabase
};
// const insertNCLTCauselistFiles = async (results, formData = {}) => {
//   console.log('[debug] [db] Inserting NCLT causelist files into database...');
//   if (!Array.isArray(results) || results.length === 0) {
//     console.log('[debug] [db] No results to insert.');
//     return { inserted: 0, errors: [] };
//   }

//   const insertSql = `
//     INSERT INTO nclt_cause_list_files (
//       serial_number,
//       bench,
//       court,
//       date,
//       pdf_url,
//       pdf_filename,
//       file_size,
//       number_of_entries,
//       title,
//       cause_date,
//       search_parameters,
//       created_at,
//       updated_at
//     ) VALUES (
//       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
//     ) RETURNING id`;

//   let inserted = 0;
//   let skipped = 0;
//   const errors = [];

//   for (const row of results) {
//     const params = [
//       row?.serialNumber ?? '',                  // $1  serial_number
//       row?.benchName ?? formData?.bench ?? '',  // $2  bench
//       'NCLT',                                   // $3  court
//       row?.causeDate ?? formData?.causeListDate ?? '', // $4  date
//       row?.pdfUrl ?? '',                        // $5  pdf_url
//       row?.pdfFileName ?? '',                   // $6  pdf_filename
//       row?.fileSize ?? '',                      // $7  file_size
//       row?.numberOfEntries ?? 0,                // $8  number_of_entries
//       row?.title ?? '',                         // $9  title
//       row?.causeDate ?? '',                     // $10 cause_date
//       JSON.stringify(formData)                  // $11 search_parameters
//     ];

//     try {
//       // Existence check: same bench, date, and pdf_url
//       const existsSql = `
//         SELECT 1 FROM nclt_cause_list_files
//         WHERE COALESCE(bench,'') = COALESCE($1,'')
//           AND date = $2
//           AND COALESCE(pdf_url,'') = COALESCE($3,'')
//         LIMIT 1
//       `;
//       const existsParams = [
//         params[1], // bench
//         params[3], // date
//         params[4]  // pdf_url
//       ];
//       const existsRes = await db.query(existsSql, existsParams);
//       if (existsRes.rows && existsRes.rows.length > 0) {
//         skipped += 1;
//         continue;
//       }

//       await db.query(insertSql, params);
//       inserted += 1;
//     } catch (err) {
//       console.error('[error] [db] Failed to insert NCLT causelist file row:', err?.message);
//       errors.push({ row, error: err?.message });
//     }
//   }

//   console.log(`[debug] [db] NCLT Causelist files insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
//   return { inserted, skipped, errors };
// }

// /**
//  * Insert NCLT cause list entries (individual cases)
//  */
// const insertNCLTCauselist = async (results, formData = {}) => {
//   console.log('[debug] [db] Inserting NCLT causelist into database...');
//   if (!Array.isArray(results) || results.length === 0) {
//     console.log('[debug] [db] No results to insert.');
//     return { inserted: 0, errors: [] };
//   }

//   const insertSql = `
//     INSERT INTO nclt_cause_list (
//       id,
//       serial_number,
//       case_number,
//       case_type,
//       petitioner,
//       respondent,
//       parties,
//       advocate,
//       stage,
//       court_room,
//       listing_time,
//       cause_list_date,
//       bench,
//       court,
//       remarks,
//       search_parameters,
//       pdf_url,
//       created_at,
//       updated_at
//     ) VALUES (
//       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
//     ) RETURNING id`;

//   let inserted = 0;
//   let skipped = 0;
//   const errors = [];

//   for (const row of results) {
//     const params = [
//       row?.serialNumber ?? '',                  // $1  serial_number
//       row?.caseNumber ?? '',                    // $2  case_number
//       row?.caseType ?? '',                      // $3  case_type
//       row?.petitioner ?? '',                    // $4  petitioner
//       row?.respondent ?? '',                    // $5  respondent
//       row?.parties ?? '',                       // $6  parties
//       row?.advocate ?? '',                      // $7  advocate
//       row?.stage ?? '',                         // $8  stage
//       row?.courtRoom ?? '',                     // $9  court_room
//       row?.listingTime ?? '',                   // $10 listing_time
//       row?.causeListDate ?? formData?.causeListDate ?? '', // $11 cause_list_date
//       row?.bench ?? formData?.bench ?? '',      // $12 bench
//       'NCLT',                                   // $13 court
//       row?.remarks ?? '',                       // $14 remarks
//       JSON.stringify(formData),                 // $15 search_parameters
//       row?.pdfUrl ?? ''                         // $16 pdf_url
//     ];

//     try {
//       // Existence check: same case_number, bench, court, date
//       const existsSql = `
//         SELECT 1 FROM nclt_cause_list
//         WHERE COALESCE(case_number,'') = COALESCE($1,'')
//           AND COALESCE(bench,'') = COALESCE($2,'')
//           AND court = $3
//           AND cause_list_date = $4
//         LIMIT 1
//       `;
//       const existsParams = [
//         params[1], // case_number
//         params[11], // bench
//         params[12], // court
//         params[10]  // cause_list_date
//       ];
//       const existsRes = await db.query(existsSql, existsParams);
//       if (existsRes.rows && existsRes.rows.length > 0) {
//         skipped += 1;
//         continue;
//       }

//       await db.query(insertSql, params);
//       inserted += 1;
//     } catch (err) {
//       console.error('[error] [db] Failed to insert NCLT causelist row:', err?.message);
//       errors.push({ row, error: err?.message });
//     }
//   }

//   console.log(`[debug] [db] NCLT Causelist insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
//   return { inserted, skipped, errors };
// }

// /**
//  * Get subscribed NCLT cases for notification matching
//  */
// const getNCLTSubscribedCases = async () => {
//   const sql = `
//     SELECT 
//       u.id as user_id,
//       uc.case_number, 
//       u.email,
//       uc.diary_number,
//       u.mobile_number,
//       u.country_code,
//       uc.bench,
//       uc.court,
//       uc.status,
//       uc.updated_at
//     FROM user_cases uc
//     JOIN users u ON u.id = uc.user_id
//     WHERE (uc.court = 'NCLT' OR uc.court LIKE '%NCLT%' OR uc.court = 'Nclt Court')
//       AND uc.status = 'PENDING'
//   `;

//   const { rows } = await db.query(sql);
//   console.log(`[debug] [getNCLTSubscribedCases] Found ${rows.length} NCLT cases in database`);
//   return rows;
// };

// /**
//  * Find matching user cases for NCLT case numbers
//  */
// const findNCLTCaseMatches = async (caseNumber, bench = '') => {
//   try {
//     const query = `
//       SELECT 
//         uc.id,
//         uc.user_id,
//         uc.diary_number,
//         uc.case_number,
//         uc.court,
//         uc.bench,
//         uc.status,
//         u.email,
//         u.mobile_number,
//         u.country_code
//       FROM user_cases uc
//       JOIN users u ON u.id = uc.user_id
//       WHERE (uc.case_number = $1 OR uc.diary_number = $1)
//       AND (uc.court = 'NCLT' OR uc.court LIKE '%NCLT%')
//       AND uc.status = 'PENDING'
//       AND ($2 = '' OR uc.bench = $2 OR uc.bench IS NULL)
//     `;
    
//     const result = await db.query(query, [caseNumber, bench]);
//     return result.rows || [];
    
//   } catch (error) {
//     console.error(`[error] [findNCLTCaseMatches] Database query failed for case ${caseNumber}:`, error.message);
//     return [];
//   }
// };

// /**
//  * Insert notifications for NCLT cases
//  */
// const insertNCLTNotifications = async (diary_number, user_id, method, contact, message, additional_data = {}) => {
//   const sql = `
//     INSERT INTO notifications (
//       id,
//       dairy_number,
//       user_id,
//       method,
//       contact,
//       message,
//       status,
//       notification_type,
//       additional_data,
//       created_at
//     ) VALUES (
//       gen_random_uuid(),
//       $1,
//       $2,
//       $3,
//       $4,
//       $5,
//       $6,
//       $7,
//       $8,
//       CURRENT_TIMESTAMP
//     )
//     RETURNING id, method;
//   `;

//   const values = [
//     diary_number,
//     user_id,
//     method,
//     contact,
//     message,
//     'pending',
//     'NCLT_CASE_UPDATE',
//     JSON.stringify(additional_data)
//   ];

//   const result = await db.query(sql, values);
//   return result.rows[0];
// };

// /**
//  * Save NCLT PDF extraction results
//  */
// const saveNCLTPDFExtraction = async (pdfData, formData = {}) => {
//   console.log('[debug] [db] Saving NCLT PDF extraction results...');
  
//   if (!pdfData || !Array.isArray(pdfData) || pdfData.length === 0) {
//     console.log('[debug] [db] No PDF extraction data to save.');
//     return { inserted: 0, errors: [] };
//   }

//   const insertSql = `
//     INSERT INTO nclt_pdf_extractions (
//       id,
//       bench_name,
//       bench_date,
//       pdf_url,
//       pdf_filename,
//       file_size,
//       total_cases,
//       extraction_success,
//       extracted_content,
//       metadata,
//       search_parameters,
//       extracted_at,
//       created_at,
//       updated_at
//     ) VALUES (
//       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
//     ) RETURNING id`;

//   let inserted = 0;
//   let skipped = 0;
//   const errors = [];

//   for (const extraction of pdfData) {
//     if (!extraction.success || !extraction.content) {
//       continue; // Skip failed extractions
//     }

//     // Count total cases
//     let totalCases = 0;
//     if (extraction.content.benches) {
//       totalCases = extraction.content.benches.reduce((sum, bench) => {
//         return sum + (bench.cases ? bench.cases.length : 0);
//       }, 0);
//     }

//     const params = [
//       extraction.benchName ?? '',               // $1  bench_name
//       extraction.benchDate ?? '',               // $2  bench_date
//       extraction.metadata?.pdfUrl ?? '',        // $3  pdf_url
//       extraction.metadata?.pdfFileName ?? '',   // $4  pdf_filename
//       extraction.metadata?.fileSize ?? '',      // $5  file_size
//       totalCases,                               // $6  total_cases
//       extraction.success ?? false,              // $7  extraction_success
//       JSON.stringify(extraction.content),       // $8  extracted_content
//       JSON.stringify(extraction.metadata),      // $9  metadata
//       JSON.stringify(formData),                 // $10 search_parameters
//       extraction.extractedAt ?? new Date().toISOString() // $11 extracted_at
//     ];

//     try {
//       // Existence check: same bench_name, bench_date, and pdf_url
//       const existsSql = `
//         SELECT 1 FROM nclt_pdf_extractions
//         WHERE COALESCE(bench_name,'') = COALESCE($1,'')
//           AND bench_date = $2
//           AND COALESCE(pdf_url,'') = COALESCE($3,'')
//         LIMIT 1
//       `;
//       const existsParams = [
//         params[0], // bench_name
//         params[1], // bench_date
//         params[2]  // pdf_url
//       ];
//       const existsRes = await db.query(existsSql, existsParams);
//       if (existsRes.rows && existsRes.rows.length > 0) {
//         skipped += 1;
//         continue;
//       }

//       await db.query(insertSql, params);
//       inserted += 1;
//     } catch (err) {
//       console.error('[error] [db] Failed to insert NCLT PDF extraction row:', err?.message);
//       errors.push({ extraction, error: err?.message });
//     }
//   }

//   console.log(`[debug] [db] NCLT PDF extraction insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
//   return { inserted, skipped, errors };
// };
// /**
//  * Save NCLT cause list data to database (Legacy function - kept for backward compatibility)
//  * @param {Object} dbClient - Database client
//  * @param {Array} causeListData - Cause list entries to save
//  */
// async function saveToDatabase(dbClient, causeListData) {
//     try {
//         console.log(`[db] Starting bulk insert for ${causeListData.length} cause list entries`);
        
//         if (!dbClient) {
//             console.log('[db] ⚠️ Database client not available, skipping save');
//             return { totalInserted: 0, errors: [] };
//         }
        
//         if (!causeListData || causeListData.length === 0) {
//             console.log('[db] ⚠️ No cause list data to insert');
//             return { totalInserted: 0, errors: [] };
//         }

//         let totalInserted = 0;
//         const errors = [];
        
//         for (const entry of causeListData) {
//             try {
//                 await insertCauseListEntry(dbClient, entry);
//                 totalInserted++;
//             } catch (error) {
//                 errors.push({
//                     caseNumber: entry.caseNumber,
//                     error: error.message
//                 });
//                 console.error(`[db] ❌ Failed to insert entry ${entry.caseNumber}:`, error.message);
//             }
//         }
        
//         console.log(`[db] 📊 Bulk Insert Summary:`);
//         console.log(`[db]    Total Entries: ${causeListData.length}`);
//         console.log(`[db]    Successfully Inserted: ${totalInserted}`);
//         console.log(`[db]    Errors: ${errors.length}`);
        
//         return {
//             totalInserted,
//             errors,
//             success: totalInserted > 0
//         };
        
//     } catch (error) {
//         console.error('[db] ❌ Error in bulk insert:', error.message);
//         throw error;
//     }
// }

// /**
//  * Insert single cause list entry
//  * @param {Object} dbClient - Database client
//  * @param {Object} entry - Cause list entry
//  */
// async function insertCauseListEntry(dbClient, entry) {
//     try {
//         const query = `
//             INSERT INTO nclt_cause_list (
//                 serial_number, case_number, case_type, petitioner, respondent, 
//                 parties, advocate, stage, court_room, listing_time, 
//                 cause_list_date, bench, court, remarks, 
//                 row_index, table_index, cell_count, raw_cells,
//                 extracted_at, created_at, updated_at, search_parameters
//             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
//             RETURNING id;
//         `;

//         const values = [
//             entry.serialNumber || '',           // serial_number
//             entry.caseNumber || '',             // case_number  
//             entry.caseType || '',               // case_type
//             entry.petitioner || '',             // petitioner
//             entry.respondent || '',             // respondent
//             entry.parties || '',                // parties
//             entry.advocate || '',               // advocate
//             entry.stage || '',                  // stage
//             entry.courtRoom || '',              // court_room
//             entry.listingTime || '',            // listing_time
//             entry.causeListDate || '',          // cause_list_date
//             entry.bench || '',                  // bench
//             'NCLT Court',                       // court
//             entry.remarks || '',               // remarks
//             entry.rowIndex || 0,                // row_index
//             entry.tableIndex || 0,              // table_index
//             entry.cellCount || 0,               // cell_count
//             JSON.stringify(entry.rawCells || []), // raw_cells (JSON)
//             new Date().toISOString(),           // extracted_at
//             new Date().toISOString(),           // created_at
//             new Date().toISOString(),           // updated_at
//             JSON.stringify(entry.searchParameters || {}) // search_parameters (JSON)
//         ];

//         const result = await dbClient.query(query, values);
//         console.log(`[db] ✅ Inserted cause list entry: ${entry.caseNumber} (ID: ${result.rows[0].id})`);
//         return result.rows[0].id;
        
//     } catch (error) {
//         console.error(`[db] ❌ Failed to insert cause list entry:`, error.message);
//         throw error;
//     }
// }

// /**
//  * Close database connection
//  */
// async function closeDatabase(client) {
//     try {
//         if (client) {
//             await client.end();
//             console.log('[db] ✅ Database connection closed');
//         }
//     } catch (error) {
//         console.error('[db] ❌ Error closing database connection:', error.message);
//     }
// }

// module.exports = {
//     // Legacy functions for backward compatibility
//     connectToDatabase,
//     saveToDatabase,
//     insertCauseListEntry,
//     closeDatabase,
    
//     // New NCLT-specific functions similar to Supreme Court scrapper
//     insertNCLTCauselist,
//     insertNCLTCauselistFiles,
//     getNCLTSubscribedCases,
//     findNCLTCaseMatches,
//     insertNCLTNotifications,
//     saveNCLTPDFExtraction
// };
