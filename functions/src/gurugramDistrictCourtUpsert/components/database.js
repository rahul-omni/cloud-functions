const { Client } = require('pg');

/** Value for case_details.site_sync when case has been synced from court site (all write paths set this). */
const SITE_SYNC_SYNCED = 1;
/** Value for case_details.site_sync when sync failed (no results, error, etc.) – same as supremeCourtOTF. */
const SITE_SYNC_ERROR = 2;

function getSiteSyncValue(orderData) {
    if (orderData == null) return SITE_SYNC_SYNCED;
    const v = orderData.site_sync;
    if (v == null || v === '') return SITE_SYNC_SYNCED;
    const n = Number(v);
    return Number.isFinite(n) ? n : SITE_SYNC_SYNCED;
}

/**
 * Connect to PostgreSQL using the given connection string.
 * @param {string} connectionString - From Secret Manager V2 (production) or process.env.DATABASE_URL / .env (local).
 */
async function connectToDatabase(connectionString) {
    if (!connectionString || !connectionString.trim()) {
        throw new Error('Database connection string is required (Secret Manager V2 DATABASE_URL or .env DATABASE_URL).');
    }
    const client = new Client({
        connectionString: connectionString.trim(),
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

async function bulkInsertOrders(client, ordersData) {
    try {
        console.log(`[database] Starting bulk insert of ${ordersData.length} orders...`);

        const query = `
            INSERT INTO case_details (
                serial_number, diary_number, case_number, parties, advocates,
                bench, judgment_by, judgment_date, court, date, created_at,
                updated_at, judgment_url, file_path, judgment_text, case_type,
                city, district, judgment_type, "courtComplex", "courtType",
                filing_number, filing_date, registered_on, case_status,
                all_parties, listing_history, order_details, site_sync
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING id;
        `;

        let insertedCount = 0;
        let errorCount = 0;

        for (const orderData of ordersData) {
            try {
                let allParties = [];
                let listingHistory = [];
                let orderDetails = [];

                if (orderData.case_details_json) {
                    try {
                        const caseDetails = typeof orderData.case_details_json === 'string'
                            ? JSON.parse(orderData.case_details_json)
                            : orderData.case_details_json;
                        allParties = caseDetails.all_parties || [];
                        listingHistory = caseDetails.listing_history || [];
                        orderDetails = caseDetails.order_details || [];
                    } catch (parseError) {
                        console.error(`[database] Error parsing case_details_json:`, parseError.message);
                    }
                }

                const values = [
                    orderData.serial_number,
                    orderData.diary_number,
                    orderData.case_number,
                    orderData.parties,
                    orderData.advocates,
                    orderData.bench,
                    orderData.judgment_by,
                    orderData.judgment_date,
                    orderData.court,
                    orderData.date,
                    orderData.created_at,
                    orderData.updated_at,
                    JSON.stringify(orderData.judgment_url != null ? orderData.judgment_url : { orders: [] }),
                    orderData.file_path,
                    orderData.judgment_text || [],
                    orderData.case_type,
                    orderData.city,
                    orderData.district,
                    orderData.judgment_type,
                    orderData.courtComplex,
                    orderData.courtType,
                    orderData.filing_number,
                    orderData.filing_date,
                    orderData.registered_on,
                    orderData.case_status,
                    allParties,
                    listingHistory,
                    orderDetails,
                    getSiteSyncValue(orderData)
                ];

                await client.query(query, values);
                insertedCount++;
                console.log(`✅  Inserted case: ${orderData.case_number} with site_sync = ${getSiteSyncValue(orderData)}`);
            } catch (error) {
                console.error(`❌  Error inserting order ${orderData.serial_number}:`, error.message);
                errorCount++;
            }
        }

        console.log(`✅  Bulk insert completed: ${insertedCount} successful, ${errorCount} errors`);
        return { inserted: insertedCount, errors: errorCount };
    } catch (error) {
        console.error('❌  Error in bulk insert:', error.message);
        throw error;
    }
}

/**
 * Merge judgment_url.orders: replace whole if scraped has more orders; else add only new orders (by judgmentDate).
 * @param {object|string|null} existingUrl - Current judgment_url from DB (object or JSON string)
 * @param {object} newUrl - Scraped judgment_url { orders: [...] }
 * @returns {object} { orders: [...] } to persist
 */
function mergeJudgmentUrlOrders(existingUrl, newUrl) {
    const existing = typeof existingUrl === 'string' ? (() => { try { return JSON.parse(existingUrl); } catch { return null; } })() : existingUrl;
    const existingOrders = (existing && Array.isArray(existing.orders)) ? existing.orders : [];
    const newOrders = (newUrl && Array.isArray(newUrl.orders)) ? newUrl.orders : [];

    if (newOrders.length === 0) {
        return existingOrders.length > 0 ? { orders: existingOrders } : { orders: [] };
    }
    // Replace whole if scraped has more orders than we have
    if (newOrders.length > existingOrders.length) {
        console.log(`[database] judgment_url: replacing (scraped ${newOrders.length} > existing ${existingOrders.length})`);
        return { orders: newOrders };
    }
    // Else add only orders with new judgmentDate (no duplicate dates)
    const existingDates = new Set(existingOrders.map(o => (o.judgmentDate || '').trim()));
    const merged = [...existingOrders];
    let added = 0;
    for (const o of newOrders) {
        const date = (o.judgmentDate || '').trim();
        if (date && !existingDates.has(date)) {
            merged.push(o);
            existingDates.add(date);
            added++;
        }
    }
    if (added > 0) {
        console.log(`[database] judgment_url: merged ${added} new order(s) (by judgmentDate)`);
    }
    return { orders: merged };
}

async function upsertCaseDetails(client, caseId, orderData) {
    try {
        console.log(`[database] Upserting case with ID: ${caseId}`);

        let allParties = [];
        let listingHistory = [];
        let orderDetails = [];

        if (orderData.case_details_json) {
            try {
                const caseDetails = typeof orderData.case_details_json === 'string'
                    ? JSON.parse(orderData.case_details_json)
                    : orderData.case_details_json;
                allParties = caseDetails.all_parties || [];
                listingHistory = caseDetails.listing_history || [];
                orderDetails = caseDetails.order_details || [];
            } catch (parseError) {
                console.error(`[database] Error parsing case_details_json:`, parseError.message);
            }
        }

        // Fetch existing judgment_url for merge (upsert orders)
        let finalJudgmentUrl = orderData.judgment_url;
        if (caseId && orderData.judgment_url && typeof orderData.judgment_url === 'object' && Array.isArray(orderData.judgment_url.orders)) {
            try {
                const row = await client.query(
                    'SELECT judgment_url FROM case_details WHERE id = $1',
                    [caseId]
                );
                const existingUrl = row.rows[0]?.judgment_url ?? null;
                finalJudgmentUrl = mergeJudgmentUrlOrders(existingUrl, orderData.judgment_url);
            } catch (selectErr) {
                console.warn('[database] Could not fetch existing judgment_url for merge, using scraped as-is:', selectErr.message);
            }
        }

        const query = `
            UPDATE case_details
            SET
                serial_number = $2,
                diary_number = $3,
                case_number = $4,
                parties = $5,
                advocates = $6,
                bench = $7,
                judgment_by = $8,
                judgment_date = $9,
                court = $10,
                date = $11,
                updated_at = $12,
                judgment_url = $13,
                file_path = $14,
                judgment_text = $15,
                case_type = $16,
                city = $17,
                district = $18,
                judgment_type = $19,
                "courtComplex" = $20,
                "courtType" = $21,
                filing_number = $22,
                filing_date = $23,
                registered_on = $24,
                case_status = $25,
                all_parties = $26,
                listing_history = $27,
                order_details = $28,
                site_sync = $29
            WHERE id = $1
            RETURNING id;
        `;

        const values = [
            caseId,
            orderData.serial_number,
            orderData.diary_number,
            orderData.case_number,
            orderData.parties,
            orderData.advocates,
            orderData.bench,
            orderData.judgment_by,
            orderData.judgment_date,
            orderData.court,
            orderData.date,
            orderData.updated_at,
            JSON.stringify(finalJudgmentUrl != null ? finalJudgmentUrl : { orders: [] }),
            orderData.file_path,
            orderData.judgment_text || [],
            orderData.case_type,
            orderData.city,
            orderData.district,
            orderData.judgment_type,
            orderData.courtComplex,
            orderData.courtType,
            orderData.filing_number,
            orderData.filing_date,
            orderData.registered_on,
            orderData.case_status,
            allParties,
            listingHistory,
            orderDetails,
            getSiteSyncValue(orderData)
        ];

        const result = await client.query(query, values);

        if (result.rowCount > 0) {
            console.log(`✅  Updated case: ${orderData.case_number} with ID: ${caseId} (site_sync = ${getSiteSyncValue(orderData)})`);
            return { success: true, id: caseId };
        } else {
            console.log(`⚠️  No case found with ID: ${caseId}`);
            return { success: false, id: caseId };
        }
    } catch (error) {
        console.error(`❌  Error upserting case ${caseId}:`, error.message);
        throw error;
    }
}

/**
 * Mark case as sync error (site_sync = 2) when no results or scraper fails – same as supremeCourtOTF.
 * Call when caseId is present and we want to record that sync failed for this placeholder.
 */
async function markSyncError(client, caseId) {
    if (!client || !caseId) return;
    try {
        const query = `UPDATE case_details SET site_sync = $1, updated_at = $2 WHERE id = $3`;
        await client.query(query, [SITE_SYNC_ERROR, new Date().toISOString(), caseId]);
        console.log(`[database] markSyncError: set site_sync = ${SITE_SYNC_ERROR} for case id: ${caseId}`);
    } catch (err) {
        console.error(`[database] markSyncError failed for id ${caseId}:`, err.message);
        throw err;
    }
}

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
    bulkInsertOrders,
    closeDatabase,
    upsertCaseDetails,
    markSyncError,
};
