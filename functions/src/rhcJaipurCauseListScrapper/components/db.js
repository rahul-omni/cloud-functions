const db = require('../../config/database');

/**
 * Get subscribed cases for Rajasthan High Court, Jaipur
 * Filters by court = 'High Court' and city = 'Jaipur'
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
            AND cd.city = 'Jaipur'
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

/**
 * Insert notification record
 * @param {string} diary_number - Diary number
 * @param {string} user_id - User ID
 * @param {string} method - Notification method (e.g., 'whatsapp')
 * @param {string} contact - Contact information (e.g., mobile number)
 * @param {string} message - Notification message
 * @returns {Promise<{id: string, method: string}>}
 */
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

