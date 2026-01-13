// Function to destructure diary number
function destructureDiaryNumber(diaryNumber) {
    if (!diaryNumber || typeof diaryNumber !== 'string') {
        return {
            case_type: null,
            diary_number: null
        };
    }
    
    // Find the first occurrence of '/' to separate diary number and date
    const firstSlashIndex = diaryNumber.indexOf('/');
    
    if (firstSlashIndex === -1) {
        // No slash found, treat entire string as diary number
        return {
            diary_number: diaryNumber,
            date: null
        };
    }

    const diary_number = diaryNumber.substring(0, firstSlashIndex);
    const date = diaryNumber.substring(firstSlashIndex + 1);
    
    return {
        diary_number,
        date
    };
}

// Wait utility function
const wait = ms => new Promise(r => setTimeout(r, ms));

// Transform scraped data to database format for PHHC
function transformRowData(row, date) {
    // Prepare judgment URL array from Order href
    const judgmentUrl = row.Order?.href ? [{ text: row.Order.text || 'View Order', url: row.Order.href }] : null;
    
    // Use CaseNumber from row if provided (constructed from original diary number format)
    // Otherwise construct from case_type and DiaryNumber
    const caseNumber = row.CaseNumber || (row.case_type ? `${row.case_type}/${row.DiaryNumber}` : '');
    
    return {
        "Serial Number": row.SerialNumber || '',
        "Diary Number": row.DiaryNumber || '',
        "Case Number": caseNumber,
        "Petitioner / Respondent": row.PartyDetail || '',
        "Petitioner/Respondent Advocate": row.AdvocateName || '',
        "Bench": row.Bench || '',
        "Judgment By": row.JudgmentBy || '',
        "Judgment": row.Order?.text || '',
        "judgmentLinks": judgmentUrl || [],
        "judgment_url": judgmentUrl, // For database insert
        "insert_to_chromadb": false,
        "case_type": row.case_type || '',
        "city": "Chandigarh", // Hardcoded for PHHC
        "district": row.District || "",
        "judgment_type": row.Order?.text || "",
        "date": new Date().toISOString(),
        "created_at": new Date().toISOString(),
        "updated_at": new Date().toISOString(),
        "court": "High Court", // Required field
        "judgment_date": row.JudgmentDate || '',
        "judgment_text": row.Order?.text ? [row.Order.text] : [],
    };
}

module.exports = {
    destructureDiaryNumber,
    wait,
    transformRowData
};

