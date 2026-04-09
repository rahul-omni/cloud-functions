const db = require('../../config/database');

/**
 * Get subscribed cases for Punjab & Haryana High Court, Chandigarh
 * Filters by court = 'High Court' and city = 'Chandigarh'
 * @returns {Promise<Array>} Array of subscribed cases
 */
const getSubscribedCases = async () => {
  const sql = `
      WITH rows_to_update AS (
          SELECT cd.id, u.id AS user_id
          FROM subscribed_cases sc
          JOIN users u ON sc.user_id = u.id
          JOIN case_details cd ON sc.case_id = cd.id
          WHERE (cd.last_synced IS NULL OR cd.last_synced::date <> CURRENT_DATE)
            AND cd.court = 'High Court'
            AND cd.city = 'Chandigarh'
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
          (SELECT country_code FROM users WHERE id = r.user_id) AS country_code,
          (SELECT mobile_number FROM users WHERE id = r.user_id) AS mobile_number,
          cd.last_synced;`;

  const { rows } = await db.query(sql);
  return rows;
};

/**
 * One row per (user_id, case_id, day, method) — same as hcCauseListScrapper.
 * `day` is YYYY-MM-DD (list date). Re-runs do not reset rows already marked success (no duplicate WhatsApp).
 */
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
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
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

/**
 * Update user case with tentative date
 * @param {string} id - Case ID
 * @param {string} dateString - Date in DD-MM-YYYY format
 * @returns {Promise<object>}
 */
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

module.exports = {
  getSubscribedCases,
  insertNotifications,
  updateUserCase
};

