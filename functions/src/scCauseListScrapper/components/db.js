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
      console.error('[error] [db] Failed to insert causelist row:', err?.message);
      errors.push({ row, error: err?.message });
    }
  }

  console.log(`[debug] [db] Causelist insert complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors.length}`);
  return { inserted, skipped, errors };
}

const getSubscribedCases = async () => {
  const sql = `
      WITH rows_to_update AS (
          SELECT cd.id, u.id AS user_id
          FROM subscribed_cases sc
          JOIN users u ON sc.user_id = u.id
          JOIN case_details cd ON sc.case_id = cd.id
          WHERE (cd.last_synced IS NULL OR cd.last_synced::date <> CURRENT_DATE)
            AND cd.court = 'Supreme Court'
          LIMIT 100
      )
      UPDATE case_details cd
      SET last_synced = NOW()
      FROM rows_to_update r
      WHERE cd.id = r.id
      RETURNING
          r.user_id,
          cd.case_number,
          cd.id AS case_id,
          cd.diary_number,
          (SELECT mobile_number FROM users WHERE id = r.user_id) AS mobile_number,
          cd.last_synced;`;

  const { rows } = await db.query(sql);
  return rows;
};

const updateUserCase = async (id, dateString) => {
  // Convert DD-MM-YYYY → YYYY-MM-DD
  const [day, month, year] = dateString.split('-');
  const formattedDate = `${year}-${month}-${day}`;

  const sql = `
    UPDATE case_details
    SET tentative_date = $1
    WHERE id = $2
    RETURNING *;
  `;
  const { rows } = await db.query(sql, [formattedDate, id]);
  return rows[0];
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
  insertNotifications,
  updateUserCase
};