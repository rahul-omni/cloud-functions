// Function to destructure diary number
function destructureDiaryNumber(diaryNumber) {
    if (!diaryNumber || typeof diaryNumber !== 'string') {
        return {
            case_type: null,
            diary_number: null
        };
    }
    
    // Find the first occurrence of '/' to separate case type from diary number
    const firstSlashIndex = diaryNumber.indexOf('/');
    
    if (firstSlashIndex === -1) {
        // No slash found, treat entire string as diary number
        return {
            case_type: null,
            diary_number: diaryNumber
        };
    }
    
    const case_type = diaryNumber.substring(0, firstSlashIndex);
    const diary_number = diaryNumber.substring(firstSlashIndex + 1);
    
    return {
        case_type,
        diary_number
    };
}

// Wait utility function
const wait = ms => new Promise(r => setTimeout(r, ms));

// Transform scraped data to database format
function transformRowData(row, date) {
    return {
        "Serial Number": row.SerialNumber || '',
        "Diary Number": row.DiaryNumber || '',
        "Case Number": row.case_type ? `${row.case_type}/${row.DiaryNumber}` : '',
        "Petitioner / Respondent": '', // Not available from high court scraping
        "Petitioner/Respondent Advocate": '', // Not available from high court scraping
        "Bench": row.bench || row.Bench || '', // From scraping, e.g., "Principal Bench at Delhi"
        "Judgment By": '', // Not available from high court scraping
        "Judgment": row.Order?.text || '',
        "judgmentLinks": row.Order?.href ? [{ text: row.Order.text, url: row.Order.href }] : [],
        "file_path": row.Order?.gcsPath || '',
        "insert_to_chromadb": false,
        "case_type": row.case_type || '',
        "city": row.city,
        "district": "",
        "judgment_type": row.Order?.text || "",
        "date": new Date().toISOString(), // Required timestamp
        "created_at": new Date().toISOString(), // Required timestamp
        "updated_at": new Date().toISOString(), // Required timestamp
        "court": "High Court", // Required field
        "judgment_date": row.JudgetmentDate || '', // From scraping
        "judgment_text": row.Order?.text ? [row.Order.text] : [], // Array type
        "judgment_url": row.Order?.href ? [row.Order.href] : [] // Array type
    };
}

// Filter valid rows from scraped data
function filterValidRows(allRows) {
    return allRows.filter(row => {
        // Skip rows that are clearly headers
        if (row.SerialNumber && (
            row.SerialNumber.includes('Principal Bench at Delhi') ||
            row.SerialNumber.includes('Serial') ||
            row.SerialNumber.includes('S.No') ||
            row.SerialNumber.includes('Sr.') ||
            row.SerialNumber === '' ||
            row.SerialNumber === 'Principal Bench at Delhi'
        )) {
            return false;
        }
        
        // Skip rows that don't have proper order data
        if (!row.DiaryNumber || !row.JudgetmentDate) {
            return false;
        }
        
        return true;
    });
}

// Process rows with diary number parsing
function processRows(rows) {
    return rows.map(row => {
        const { case_type, diary_number } = destructureDiaryNumber(row.DiaryNumber);
        return {
            ...row,
            DiaryNumber: diary_number,  // Replace with parsed diary_number
            case_type: case_type,      // Add case_type as separate field
            parsedDiaryNumber: { case_type, diary_number } // Add parsedDiaryNumber for insertOrder
        };
    });
}

module.exports = {
    destructureDiaryNumber,
    wait,
    transformRowData,
    filterValidRows,
    processRows
}; 