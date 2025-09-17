const db = require('../../config/database');

const insertCauselistFiles = async (results, formData = {}) => {
  console.log('[debug] [db] Inserting causelist files into database...');
  if (!Array.isArray(results) || results.length === 0) {
    console.log('[debug] [db] No results to insert.');
    return { inserted: 0, errors: [] };
  }

  const insertSql = `
    INSERT INTO cause_list_files (
      serial_number,
      city,
      court,
      district,
      date,
      search_by,
      list_type,
      cause_list_type,
      main_and_supply,
      link,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
    ) RETURNING id`;

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of results) {
    // Extract the first PDF link URL if available
    const linkUrl = row?.causeListLinks && row.causeListLinks.length > 0 
      ? row.causeListLinks[0].url 
      : '';

    const m_and_s = row?.File?.includes("Main") ? "Main" : "Supplementry";

    const params = [
      row?.["Serial Number"] ?? '',              // $1  serial_number
      formData?.city ?? '',                      // $2  city
      "Supreme Court",                     // $3  court
      formData?.district ?? '',                  // $4  district
      formData?.listingDate ?? '',                      // $5  date
      formData?.searchBy ?? '',                  // $6  search_by
      formData?.listType ?? '',                  // $7  list_type
      formData?.causelistType ?? '',             // $8  cause_list_type
      m_and_s ?? '',       // $9  main_and_supply
      linkUrl                                    // $10 link
    ];

    try {
      // Existence check: same serial_number, court, date, and link
      const existsSql = `
        SELECT 1 FROM cause_list_files
        WHERE COALESCE(serial_number,'') = COALESCE($1,'')
          AND court = $2
          AND date = $3
          AND COALESCE(link,'') = COALESCE($4,'')
        LIMIT 1
      `;
      const existsParams = [
        params[0], // serial_number
        params[2], // court
        params[4], // date
        params[9]  // link
      ];
      const existsRes = await db.query(existsSql, existsParams);
      if (existsRes.rows && existsRes.rows.length > 0) {
        skipped += 1;
        continue;
      }

      await db.query(insertSql, params);
      inserted += 1;
    } catch (err) {
      console.error('[error] [db] Failed to insert causelist file row:', err?.message);
      errors.push({ row, error: err?.message });
    }
  }

  console.log(`[debug] [db] Causelist files insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { inserted, skipped, errors };
}

const insertCauselist = async (results) => {
  console.log('[debug] [db] Inserting causelist into database...');
  if (!Array.isArray(results) || results.length === 0) {
    console.log('[debug] [db] No results to insert.');
    return { inserted: 0, errors: [] };
  }

  const insertSql = `
    INSERT INTO cause_list (
      id,
      serial_number,
      dairy_number,
      case_number,
      full_case_number,
      parties,
      advocates,
      city,
      court,
      district,
      date,
      search_by,
      list_type,
      cause_list_type,
      main_and_supply,
      court_no,
      aor_code,
      judge_name,
      party_name,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
    ) RETURNING id`;

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of results) {
    const params = [
      row?.serialNumber ?? '',                  // $1  serial_number
      row?.diaryNumber ?? '',                   // $2  dairy_number (schema uses "dairy_number")
      row?.caseNumber ?? '',                    // $3  case_number
      row?.fullCaseNumber ?? '',                // $4  full_case_number
      row?.parties ?? '',                       // $5  parties
      row?.advocates ?? '',                     // $6  advocates
      row?.city ?? '',                        // $7  city
      row?.court ?? '',                         // $8  court
      row?.district ??  '',                    // $9  district
      row?.date ?? '',                          // $10 date
      row?.searchBy ?? '',                      // $11 search_by
      row?.ListType ?? '',                      // $12 list_type
      row?.causelistType ?? '',                 // $13 cause_list_type
      row?.mainAndSupplementry ?? '',           // $14 main_and_supply
      row?.courtNo ?? '',                     // $15 court_no
      row?.aorCode ?? '',                     // $16 aor_code
      row?.judge ?? '',                       // $17 judge_name
      row?.partyName ?? '',                    // $18 party_name
    ];

    try {
      // Existence check: same dairy_number, case_number, court, date
      const existsSql = `
        SELECT 1 FROM cause_list
        WHERE COALESCE(dairy_number,'') = COALESCE($1,'')
          AND COALESCE(case_number,'') = COALESCE($2,'')
          AND court = $3
          AND date = $4
        LIMIT 1
      `;
      const existsParams = [
        params[1], // dairy_number
        params[2], // case_number
        params[7], // court
        params[9]  // date
      ];
      const existsRes = await db.query(existsSql, existsParams);
      if (existsRes.rows && existsRes.rows.length > 0) {
        skipped += 1;
        continue;
      }

      await db.query(insertSql, params);
      inserted += 1;
    } catch (err) {
      console.error('[error] [db] Failed to insert causelist row:', err?.message);
      errors.push({ row, error: err?.message });
    }
  }

  console.log(`[debug] [db] Causelist insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { inserted, skipped, errors };
}

const getSubscribedCases = async () => {
  const sql = `
    UPDATE user_cases uc
    SET updated_at = NOW()
    FROM users u
    WHERE uc.user_id = u.id
      AND (uc.updated_at::date <> CURRENT_DATE)
      AND court = 'Supreme Court'
    RETURNING 
      u.id as user_id,
      uc.case_number, 
      u.email,
      uc.diary_number,
      u.mobile_number,
      uc.updated_at;
  `;

  const { rows } = await db.query(sql);
  return rows;
};

const insertNotifications = async (diary_number, user_id, method, contact, message) => {
  const sql = `
    INSERT INTO notifications (
      id,
      dairy_number,
      user_id,
      method,
      contact,
      message,
      status,
      created_at
    ) VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      CURRENT_TIMESTAMP
    )
    RETURNING id, method;
  `;

  const values = [
    diary_number,
    user_id,
    method,
    contact,
    message,
    'pending'
  ];

  const result = await db.query(sql, values);
  return result.rows[0];
};

module.exports = {
  insertCauselist,
  insertCauselistFiles,
  getSubscribedCases,
  insertNotifications
};