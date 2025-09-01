
// Wait utility function
const wait = ms => new Promise(r => setTimeout(r, ms));

// Function to clean text content - remove HTML tags and escape characters
function cleanText(text) {
    if (!text) return '';
    
    return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&lt;/g, '<') // Replace &lt; with <
        .replace(/&gt;/g, '>') // Replace &gt; with >
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .replace(/&#39;/g, "'") // Replace &#39; with '
        .replace(/\\/g, '') // Remove escape backslashes
        .replace(/\n/g, ' ') // Replace newlines with space
        .replace(/\r/g, ' ') // Replace carriage returns with space
        .replace(/\t/g, ' ') // Replace tabs with space
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim(); // Remove leading/trailing whitespace
}

// Function to clean URL - remove quotes and escape characters
function cleanUrl(url) {
    if (!url) return null;
    
    return url
        .replace(/^["']+|["']+$/g, '') // Remove leading/trailing quotes
        .replace(/\\/g, '') // Remove escape backslashes
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .trim();
}

// Validate date format (dd-mm-yyyy)
function isValidDate(dateString) {
    const regex = /^\d{2}-\d{2}-\d{4}$/;
    if (!regex.test(dateString)) return false;
    
    const [day, month, year] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.getFullYear() === year &&
           date.getMonth() === month - 1 &&
           date.getDate() === day;
}

// Get yesterday's date in dd-mm-yyyy format
function getYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

// Parse case number and year from diaryNumber parameter
function parseCaseNumber(diaryNumber) {
    if (!diaryNumber || typeof diaryNumber !== 'string') {
        return {
            caseNumber: null,
            caseYear: null,
            caseType: null
        };
    }
    
    // Handle various case number formats
    // Examples: "123/2024", "CC 123/2024", "CRL 456/2023", etc.
    
    // Try to extract case type, number, and year
    const patterns = [
        // Pattern: "TYPE NUMBER/YEAR" (e.g., "CC 123/2024")
        /^([A-Z]+)\s*(\d+)\/(\d{4})$/i,
        // Pattern: "NUMBER/YEAR" (e.g., "123/2024")
        /^(\d+)\/(\d{4})$/,
        // Pattern: "TYPE/NUMBER/YEAR" (e.g., "CC/123/2024")
        /^([A-Z]+)\/(\d+)\/(\d{4})$/i
    ];
    
    for (const pattern of patterns) {
        const match = diaryNumber.trim().match(pattern);
        if (match) {
            if (match.length === 4) {
                // Has case type
                return {
                    caseType: match[1].toUpperCase(),
                    caseNumber: match[2],
                    caseYear: match[3]
                };
            } else if (match.length === 3) {
                // No case type
                return {
                    caseType: null,
                    caseNumber: match[1],
                    caseYear: match[2]
                };
            }
        }
    }
    
    // Fallback: try to extract just number and current year
    const numberMatch = diaryNumber.match(/(\d+)/);
    if (numberMatch) {
        return {
            caseType: null,
            caseNumber: numberMatch[1],
            caseYear: new Date().getFullYear().toString()
        };
    }
    
    return {
        caseNumber: null,
        caseYear: null,
        caseType: null
    };
}

// Determine search type based on parameters
function determineSearchType(date, diaryNumber, caseTypeValue, courtComplex) {
    // If we have a diary number or case type value, prefer case number search
    if (diaryNumber && caseTypeValue && courtComplex) {
        const parsedCase = parseCaseNumber(diaryNumber);
        if (parsedCase.caseNumber && parsedCase.caseYear) {
            return {
                searchType: 'case_number',
                searchData: {
                    caseNumber: parsedCase.caseNumber,
                    caseYear: parsedCase.caseYear,
                    caseType: caseTypeValue,
                    courtComplex: courtComplex
                }
            };
        }
    }
    
    // Default to date search
    
    return {
        searchType: 'order_date',
        searchData: {
            date: date || getYesterday(),
            courtComplex: courtComplex
        }
    };
}

// Transform scraped data to database format
function transformRowData(caseItem, court, searchDate) {
    return {
        "Serial Number": caseItem.serial_number || '',
        "Diary Number": '', // Not available in district court data
        "Case Number": caseItem.case_type_number_year || '',
        "Petitioner / Respondent": '', // Not available in district court scraping
        "Petitioner/Respondent Advocate": '', // Not available in district court scraping
        "Bench": court.court_name || '',
        "Judgment By": '', // Not available in district court scraping
        "Judgment": caseItem.order_type || '',
        "judgmentLinks": caseItem.copy_of_order_url ? [{ text: caseItem.order_type, url: caseItem.copy_of_order_url }] : [],
        "file_path": '', // Would be populated after PDF download
        "insert_to_chromadb": false,
        "case_type": '', // Not clearly available from district court
        "city": "Gurugram",
        "district": "Gurugram",
        "judgment_type": caseItem.order_type || "",
        "date": new Date().toISOString(), // Required timestamp
        "created_at": new Date().toISOString(), // Required timestamp
        "updated_at": new Date().toISOString(), // Required timestamp
        "court": "District Court", // Required field
        "judgment_date": caseItem.order_date || '', // From scraping
        "judgment_text": caseItem.order_type ? [caseItem.order_type] : [], // Array type
        "judgment_url": caseItem.copy_of_order_url ? [caseItem.copy_of_order_url] : [] // Array type
    };
}

// Process court data for consistency
function processCourtData(courts) {
    try {
        if (!Array.isArray(courts)) {
            throw new Error('Courts data must be an array');
        }
        
        return courts.map(court => ({
            ...court,
            court_name: cleanText(court.court_name),
            establishment_code: court.establishment_code || '',
            cases: court.cases.map(caseItem => ({
                serial_number: cleanText(caseItem.serial_number),
                case_type_number_year: cleanText(caseItem.case_type_number_year),
                order_date: cleanText(caseItem.order_date),
                order_type: cleanText(caseItem.order_type),
                copy_of_order_url: cleanUrl(caseItem.copy_of_order_url)
            }))
        }));
    } catch (error) {
        console.error('[error] [processCourtData] Failed to process court data:', error.message);
        throw new Error(`Failed to process court data: ${error.message}`);
    }
}

// Filter valid rows from scraped data
function filterValidRows(allCases) {
    try {
        if (!Array.isArray(allCases)) {
            throw new Error('Cases data must be an array');
        }
        
        return allCases.filter(caseItem => {
            // Skip rows that don't have essential data
            if (!caseItem.serial_number || !caseItem.order_date || !caseItem.case_type_number_year) {
                return false;
            }
            
            // Skip obvious header rows
            if (caseItem.serial_number.toLowerCase().includes('serial') ||
                caseItem.serial_number.toLowerCase().includes('s.no') ||
                caseItem.serial_number.toLowerCase().includes('sr.')) {
                return false;
            }
            
            return true;
        });
    } catch (error) {
        console.error('[error] [filterValidRows] Failed to filter valid rows:', error.message);
        throw new Error(`Failed to filter valid rows: ${error.message}`);
    }
}

// Get date in mm/dd/yyyy format (as expected by the form)
function formatDateForForm(dateString) {
    const [day, month, year] = dateString.split('-');
    return `${month}/${day}/${year}`;
}

// Extract case type from case_details (e.g., "BA" from "BA/1234/2022")
function extractCaseType(caseDetails) {
    if (!caseDetails || typeof caseDetails !== 'string') {
        return '';
    }
    
    // Pattern: "TYPE/NUMBER/YEAR" (e.g., "BA/1234/2022")
    const match = caseDetails.match(/^([A-Z]+)\/(\d+)\/(\d{4})$/);
    return match ? match[1] : '';
}

// Extract diary number from case_details (e.g., "1234/2022" from "BA/1234/2022")
function extractDiaryNumber(caseDetails) {
    if (!caseDetails || typeof caseDetails !== 'string') {
        return '';
    }
    
    // Pattern: "TYPE/NUMBER/YEAR" (e.g., "BA/1234/2022")
    const match = caseDetails.match(/^([A-Z]+)\/(\d+)\/(\d{4})$/);
    return match ? `${match[2]}/${match[3]}` : '';
}

// Transform scraped data to database schema format
function transformToDatabaseSchema(caseItem, court, searchData) {
    const currentTimestamp = new Date().toISOString();
    const caseType = extractCaseType(caseItem.case_type_number_year);
    const diaryNumber = extractDiaryNumber(caseItem.case_type_number_year);
    
    return {
        serial_number: caseItem.serial_number || '',
        diary_number: diaryNumber,
        case_number: caseItem.case_type_number_year || '',
        parties: '', // not available in district court data
        advocates: '', // not available in district court data
        bench: '', // empty as requested
        judgment_by: '', // not available in district court data
        judgment_date: caseItem.order_date || '',
        court: 'District Court', // hardcoded main court name
        date: currentTimestamp,
        created_at: currentTimestamp,
        updated_at: currentTimestamp,
        judgment_url: caseItem.copy_of_order_url ? [caseItem.copy_of_order_url] : [],
        file_path: '', // empty string as default
        judgment_text: caseItem.order_type ? [caseItem.order_type] : [],
        case_type: caseType,
        city: '', // empty as requested
        district: 'Gurugram', // hardcoded
        judgment_type: caseItem.order_type || '',
        courtComplex: searchData.courtComplex || '',
        courtType: court.court_name || '' // specific court for each entry
    };
}

module.exports = {
    wait,
    cleanText,
    cleanUrl,
    isValidDate,
    getYesterday,
    parseCaseNumber,
    determineSearchType,
    transformRowData,
    filterValidRows,
    processCourtData,
    formatDateForForm,
    extractCaseType,
    extractDiaryNumber,
    transformToDatabaseSchema
}; 