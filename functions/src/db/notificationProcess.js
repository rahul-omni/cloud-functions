const db = require('../config/database');
const { getTodayDate, transformJudgmentLinks } = require('../util/helper');

const get_supreme_court_user_cases = async (dairy_number) => {
    const query = `SELECT 
            uc.user_id,
            uc.diary_number,
            uc.court,
            uc.case_type,
            uc.city,
            uc.district,
            u.country_code,
            u.mobile_number,
            u.email
          FROM user_cases uc
          JOIN users u ON u.id = uc.user_id
          WHERE uc.diary_number = $1 AND uc.court = $2`;
    const values = [dairy_number, 'Supreme Court'];
    const result = await db.query(query, values);
    return result;
}



const insert_to_notification_table = async (data, method) => {
    try {
        const { diary_number, user_id, email, country_code, mobile_number } = data;
        
        // Create notification message
        const message = `New judgment available for your case ${diary_number}`;
        
        // Determine contact value based on method
        let contact;
        if (method === 'email') {
            contact = email;
        } else if (method === 'whatsapp') {
            contact = country_code + mobile_number;
        } else {
            contact = email; // fallback to email for unknown methods
        }
        
        const query = `INSERT INTO notifications (
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
        RETURNING id, method`;
        
        const values = [
            diary_number,  // dairy_number in the table (note the spelling)
            user_id,      // uuid type
            method,      // method
            contact,      // contact - now conditionally set based on method
            message,      // message
            'pending'     // status
        ];

        const result = await db.query(query, values);
        
        console.log("[info] [insert_to_notification_table] Inserted notification for dairy_number:", diary_number);
        return result.rows[0];
    } catch (error) {
        console.error("[error] [insert_to_notification_table] Error inserting notification:", error);
        throw error;
    }
}

//it inserts to case_management table and returns the diary_number, user_id, email, country_code, mobile_number 
//from user cases table
const insert_to_case_management_table = async (data) => {
    // Ensure data is an array
    const cases = Array.isArray(data) ? data : [data];

    console.log("[info] [insert_to_case_management_table] Received cases data");

    const todayDate = getTodayDate();
    const now = new Date().toISOString();

    // Map all cases
    const mappedCases = cases.map(caseData => {
        // Validate required fields

        return {
            date: now, // timestamp without time zone
            created_at: now,
            updated_at: now,
            parties: caseData["Petitioner / Respondent"] || '',
            advocates: caseData["Petitioner/Respondent Advocate"] || '',
            bench: caseData["Bench"] || '',
            judgment_by: caseData["Judgment By"] || '',
            judgment_date: caseData["judgment_date"] || todayDate || '',
            judgment_text: caseData["judgment_text"] || (Array.isArray(caseData["Judgment"]) ? caseData["Judgment"] : [caseData["Judgment"] || '']),
            judgment_url: caseData["judgment_url"] || transformJudgmentLinks(caseData.judgmentLinks),
            court: caseData["court"] || "Supreme Court",
            serial_number: caseData["Serial Number"] || '',
            diary_number: caseData["Diary Number"] || '',
            case_number: caseData["Case Number"] || '',
            file_path: caseData["file_path"] || '',
            case_type: caseData["case_type"] || '',
            city: caseData["city"] || '',
            district: caseData["district"] || '',
            judgment_type: caseData["judgment_type"] || ''
        };
    });

    // Create parameterized values string for bulk insert
    const values = mappedCases.map((_, index) => {
        const offset = index * 19; // 19 fields excluding id which is auto-generated
        return `(gen_random_uuid(), $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19})`;
    }).join(',');

    // Flatten all values into a single array
    const flattenedValues = mappedCases.flatMap(caseData => {
        const values = [
            caseData.date,
            caseData.created_at,
            caseData.updated_at,
            caseData.parties,
            caseData.advocates,
            caseData.bench,
            caseData.judgment_by,
            caseData.judgment_date,
            caseData.judgment_text,
            caseData.judgment_url,
            caseData.court,
            caseData.serial_number,
            caseData.diary_number,
            caseData.case_number,
            caseData.file_path,
            caseData.case_type,
            caseData.city,
            caseData.district,
            caseData.judgment_type
        ];
        return values;
    });

    const query = `
        WITH inserted_cases AS (
            INSERT INTO case_management (
                id,
                date,
                created_at,
                updated_at,
                parties,
                advocates,
                bench,
                judgment_by,
                judgment_date,
                judgment_text,
                judgment_url,
                court,
                serial_number,
                diary_number,
                case_number,
                file_path,
                case_type,
                city,
                district,
                judgment_type
            ) VALUES ${values}
            RETURNING diary_number
        )
        SELECT 
            ic.diary_number,
            uc.user_id,
            u.email,
            u.country_code,
            u.mobile_number
        FROM inserted_cases ic
        JOIN user_cases uc ON ic.diary_number = uc.diary_number AND ic.court = uc.court
        JOIN users u ON u.id = uc.user_id`;

    const result = await db.query(query, flattenedValues);
    console.log("[info] [insert_to_case_management_table] Result from case management table");
    return result.rows;
}

const get_pending_notifications = async (method) => {
    const query = `SELECT * FROM notifications WHERE status = 'pending' AND method = $1`;
    const values = [method];
    const result = await db.query(query, values);
    return result.rows;
}

const update_notification_status = async (id, status) => {
    const query = `UPDATE notifications SET status = $1 WHERE id = $2`;
    const values = [status, id];
    const result = await db.query(query, values);
    return result.rows[0];
}

const get_notification_by_id = async (id) => {
    const query = `SELECT * FROM notifications WHERE id = $1`;
    const values = [id];
    const result = await db.query(query, values);
    return result.rows[0];
}


module.exports = { 
    insert_to_notification_table, 
    insert_to_case_management_table,
    get_supreme_court_user_cases,
    get_pending_notifications,
    update_notification_status,
    get_notification_by_id
};


// INSERT INTO case_management (
//     date,
//     parties,
//     advocates,
//     bench,
//     judgment_by,
//     judgment_date,
//     judgment_url,
//     court,
//     diary_number,
//     case_number
// ) VALUES ${values}
// ON CONFLICT (diary_number) DO UPDATE SET
//     date = EXCLUDED.date,
//     parties = EXCLUDED.parties,
//     advocates = EXCLUDED.advocates,
//     bench = EXCLUDED.bench,
//     judgment_by = EXCLUDED.judgment_by,
//     judgment_date = EXCLUDED.judgment_date,
//     judgment_url = EXCLUDED.judgment_url,
//     court = EXCLUDED.court,
//     case_number = EXCLUDED.case_number
// RETURNING diary_number`;


// ON CONFLICT (diary_number,judgment_date) DO UPDATE SET
// date = EXCLUDED.date,
// parties = EXCLUDED.parties,
// advocates = EXCLUDED.advocates,
// bench = EXCLUDED.bench,
// judgment_by = EXCLUDED.judgment_by,
// judgment_date = EXCLUDED.judgment_date,
// judgment_url = EXCLUDED.judgment_url,
// court = EXCLUDED.court,
// case_number = EXCLUDED.case_number