const { MongoClient } = require('mongodb');

// Database connection
let dbClient = null;

// Connect to database
async function connectToDatabase() {
    try {
        if (dbClient && dbClient.topology && dbClient.topology.isConnected()) {
            console.log('[database] Using existing database connection');
            return dbClient;
        }

        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        const dbName = process.env.MONGODB_DB_NAME || 'lawyerai';
        
        console.log('[database] Connecting to MongoDB...');
        dbClient = new MongoClient(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        await dbClient.connect();
        console.log('[database] Connected to MongoDB successfully');
        
        return dbClient;
    } catch (error) {
        console.error('[database] Failed to connect to MongoDB:', error.message);
        throw error;
    }
}

// Close database connection
async function closeDatabase(client = null) {
    try {
        const clientToClose = client || dbClient;
        if (clientToClose && clientToClose.topology && clientToClose.topology.isConnected()) {
            await clientToClose.close();
            console.log('[database] Database connection closed');
        }
    } catch (error) {
        console.error('[database] Error closing database connection:', error.message);
    }
}

// Bulk insert cause list records
async function bulkInsertCauseList(client, records) {
    try {
        if (!client || !records || records.length === 0) {
            console.log('[database] No records to insert or no client provided');
            return { inserted: 0, errors: 0 };
        }

        const db = client.db(process.env.MONGODB_DB_NAME || 'lawyerai');
        const collection = db.collection('cause_list_records');
        
        console.log(`[database] Inserting ${records.length} cause list records...`);
        
        // Use insertMany with ordered: false to continue on individual errors
        const result = await collection.insertMany(records, { ordered: false });
        
        console.log(`[database] Successfully inserted ${result.insertedCount} cause list records`);
        
        return {
            inserted: result.insertedCount,
            errors: records.length - result.insertedCount
        };
        
    } catch (error) {
        console.error('[database] Error bulk inserting cause list records:', error.message);
        
        // If it's a bulk write error, extract the details
        if (error.writeErrors) {
            const inserted = error.result ? error.result.insertedCount : 0;
            const errors = error.writeErrors.length;
            console.log(`[database] Partial success: ${inserted} inserted, ${errors} errors`);
            return { inserted, errors };
        }
        
        throw error;
    }
}

// Get cause list records by date range
async function getCauseListByDateRange(client, startDate, endDate, courtName = null) {
    try {
        const db = client.db(process.env.MONGODB_DB_NAME || 'lawyerai');
        const collection = db.collection('cause_list_records');
        
        const query = {
            cause_list_date: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };
        
        if (courtName) {
            query.court_name = courtName;
        }
        
        const records = await collection.find(query).toArray();
        console.log(`[database] Found ${records.length} cause list records for date range`);
        
        return records;
        
    } catch (error) {
        console.error('[database] Error getting cause list records:', error.message);
        throw error;
    }
}

// Get cause list records by case number
async function getCauseListByCaseNumber(client, caseNumber, caseYear = null) {
    try {
        const db = client.db(process.env.MONGODB_DB_NAME || 'lawyerai');
        const collection = db.collection('cause_list_records');
        
        const query = {
            case_number: caseNumber
        };
        
        if (caseYear) {
            query.case_year = caseYear;
        }
        
        const records = await collection.find(query).toArray();
        console.log(`[database] Found ${records.length} cause list records for case number ${caseNumber}`);
        
        return records;
        
    } catch (error) {
        console.error('[database] Error getting cause list records by case number:', error.message);
        throw error;
    }
}

// Check if cause list record already exists
async function checkCauseListExists(client, caseNumber, caseYear, causeListDate, courtName) {
    try {
        const db = client.db(process.env.MONGODB_DB_NAME || 'lawyerai');
        const collection = db.collection('cause_list_records');
        
        const query = {
            case_number: caseNumber,
            case_year: caseYear,
            cause_list_date: new Date(causeListDate),
            court_name: courtName
        };
        
        const existingRecord = await collection.findOne(query);
        
        return !!existingRecord;
        
    } catch (error) {
        console.error('[database] Error checking cause list existence:', error.message);
        return false;
    }
}

// Create cause list record schema
function createCauseListRecord(caseData, courtData, searchData) {
    return {
        // Case information
        case_number: caseData.case_number || '',
        case_year: caseData.case_year || '',
        case_type: caseData.case_type || '',
        case_title: caseData.case_title || '',
        
        // Court information
        court_name: courtData.court_name || '',
        court_number: courtData.court_number || '',
        establishment_code: courtData.establishment_code || '',
        
        // Cause list information
        cause_list_date: new Date(searchData.causeListDate),
        cause_type: searchData.causeType || '',
        serial_number: caseData.serial_number || '',
        
        // Party information
        petitioner: caseData.petitioner || '',
        respondent: caseData.respondent || '',
        advocate_petitioner: caseData.advocate_petitioner || '',
        advocate_respondent: caseData.advocate_respondent || '',
        
        // Case status
        case_status: caseData.case_status || '',
        next_hearing_date: caseData.next_hearing_date ? new Date(caseData.next_hearing_date) : null,
        
        // Metadata
        scraped_at: new Date(),
        search_parameters: searchData,
        source_url: 'https://gurugram.dcourts.gov.in/cause-list-%e2%81%84-daily-board/'
    };
}

module.exports = {
    connectToDatabase,
    closeDatabase,
    bulkInsertCauseList,
    getCauseListByDateRange,
    getCauseListByCaseNumber,
    checkCauseListExists,
    createCauseListRecord
};
