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

/**
 * Subscribed SC cases for cause-list matching.
 * Do NOT filter or bump `last_synced` here: other sync jobs (e.g. case upsert) set `last_synced`
 * the same day and would exclude rows from cause-list forever for that calendar day.
 * Duplicate sends for the same listing day are prevented by notifications ON CONFLICT (user_id, case_id, day, method).
 */
const getSubscribedCases = async () => {
  const sql = `
      SELECT
          sc.user_id,
          cd.case_number,
          cd.id AS case_id,
          cd.diary_number,
          u.mobile_number,
          u.country_code,
          cd.last_synced
      FROM subscribed_cases sc
      JOIN users u ON sc.user_id = u.id
      JOIN case_details cd ON sc.case_id = cd.id
      WHERE cd.court = 'Supreme Court'
        AND sc.status = 'ACTIVE'
      ORDER BY cd.updated_at DESC NULLS LAST
      LIMIT 500`;

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

// Option B: one notification per (user_id, case_id, day, method)
const insertNotifications = async (case_id, day, user_id, method, contact, message) => {
  const sql = `
    INSERT INTO notifications (
      id,
      case_id,
      day,
      user_id,
      method,
      contact,
      message,
      status,
      created_at
    ) VALUES (
      gen_random_uuid(),
      $1,  -- case_id
      $2,  -- day (YYYY-MM-DD)
      $3,  -- user_id
      $4,  -- method
      $5,  -- contact
      $6,  -- message
      $7,  -- status
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, case_id, day, method)
    DO UPDATE SET
      contact = EXCLUDED.contact,
      message = EXCLUDED.message,
      status = 'pending',
      created_at = CURRENT_TIMESTAMP
    WHERE notifications.status IS DISTINCT FROM 'success'
    RETURNING id, method;
  `;

  const values = [case_id, day, user_id, method, contact, message, "pending"];

  const result = await db.query(sql, values);
  return result.rows[0] || null;
};

module.exports = {
  insertCauselist,
  insertCauselistFiles,
  getSubscribedCases,
  insertNotifications,
  updateUserCase
};