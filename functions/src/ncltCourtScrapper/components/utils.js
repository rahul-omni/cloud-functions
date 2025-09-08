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

// Validate date format (dd-mm-yyyy or dd/mm/yyyy)
function isValidDate(dateString) {
    if (!dateString) return false;
    
    const regex = /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/;
    if (!regex.test(dateString)) return false;
    
    const separator = dateString.includes('-') ? '-' : '/';
    const [day, month, year] = dateString.split(separator).map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.getFullYear() === year &&
           date.getMonth() === month - 1 &&
           date.getDate() === day;
}

// Get current date in dd-mm-yyyy format
function getCurrentDate() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
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

// Parse NCLT case number and extract components
function parseNCLTCaseNumber(caseNumber) {
    if (!caseNumber || typeof caseNumber !== 'string') {
        return {
            caseType: null,
            caseNumber: null,
            caseYear: null,
            fullCaseNumber: null
        };
    }
    
    // NCLT case number patterns:
    // "CP(IB) No. 123/2024"
    // "CP 123/2024"
    // "MA 456/2023"
    // "IA 789/2022"
    
    const patterns = [
        // Pattern: "CP(IB) No. 123/2024"
        /^CP\(IB\)\s*(?:No\.?)?\s*(\d+)\/(\d{4})$/i,
        // Pattern: "CP No. 123/2024" or "CP 123/2024"
        /^CP\s*(?:No\.?)?\s*(\d+)\/(\d{4})$/i,
        // Pattern: "MA 123/2024", "IA 123/2024", etc.
        /^([A-Z]+)\s*(?:No\.?)?\s*(\d+)\/(\d{4})$/i,
        // Pattern: "123/2024" (just number and year)
        /^(\d+)\/(\d{4})$/
    ];
    
    for (const pattern of patterns) {
        const match = caseNumber.trim().match(pattern);
        if (match) {
            if (pattern.source.includes('CP\\(IB\\)')) {
                return {
                    caseType: 'CP(IB)',
                    caseNumber: match[1],
                    caseYear: match[2],
                    fullCaseNumber: `CP(IB) No. ${match[1]}/${match[2]}`
                };
            } else if (match.length === 4) {
                // Has case type
                return {
                    caseType: match[1].toUpperCase(),
                    caseNumber: match[2],
                    caseYear: match[3],
                    fullCaseNumber: `${match[1].toUpperCase()} ${match[2]}/${match[3]}`
                };
            } else if (match.length === 3) {
                // No case type (just number/year)
                return {
                    caseType: 'CP',
                    caseNumber: match[1],
                    caseYear: match[2],
                    fullCaseNumber: `CP ${match[1]}/${match[2]}`
                };
            }
        }
    }
    
    return {
        caseType: null,
        caseNumber: null,
        caseYear: null,
        fullCaseNumber: caseNumber
    };
}

// Validate NCLT bench name
function validateNCLTBench(bench) {
    if (!bench || typeof bench !== 'string') {
        return false;
    }
    
    const validBenches = [
        'AHMEDABAD',
        'ALLAHABAD', 
        'BENGALURU',
        'CHANDIGARH',
        'CHENNAI',
        'GUWAHATI',
        'HYDERABAD',
        'KOLKATA',
        'MUMBAI',
        'NEW DELHI'
    ];
    
    return validBenches.some(validBench => 
        bench.toUpperCase().includes(validBench)
    );
}

// Transform NCLT scraped data to database format
function transformRowData(ncltItem, searchParams = {}) {
    const currentTimestamp = new Date().toISOString();
    const parsedCase = parseNCLTCaseNumber(ncltItem.caseNumber || ncltItem.DiaryNumber);
    
    return {
        SerialNumber: ncltItem.serialNumber || ncltItem.SerialNumber || '',
        DiaryNumber: ncltItem.caseNumber || ncltItem.DiaryNumber || '',
        case_type: parsedCase.caseType || searchParams.caseType || 'Nclt Court',
        JudgetmentDate: ncltItem.orderDate || ncltItem.JudgetmentDate || null,
        Bench: searchParams.bench || ncltItem.bench || ncltItem.Bench || '',
        Order: {
            href: ncltItem.orderUrl || ncltItem.Order?.href || '',
            text: ncltItem.orderText || ncltItem.Order?.text || 'ORDER'
        },
        city: '',
        petitioner: ncltItem.petitioner || '',
        respondent: ncltItem.respondent || '',
        parties: ncltItem.petitioner && ncltItem.respondent ? 
                `${ncltItem.petitioner} vs ${ncltItem.respondent}` : '',
        caseNumber: parsedCase.fullCaseNumber || ncltItem.caseNumber,
        orderType: ncltItem.orderText || 'ORDER',
        court: 'Nclt Court',
        date: currentTimestamp,
        created_at: currentTimestamp,
        updated_at: currentTimestamp
    };
}

// Filter valid rows from NCLT scraped data
function filterValidRows(ncltCases) {
    try {
        if (!Array.isArray(ncltCases)) {
            console.log('Cases data is not an array, converting...');
            return [];
        }
        
        return ncltCases.filter(caseItem => {
            // Must have a diary number or case number
            if (!caseItem.DiaryNumber && !caseItem.caseNumber && !caseItem.serialNumber) {
                return false;
            }
            
            // Must have bench information
            if (!caseItem.Bench && !caseItem.bench) {
                return false;
            }
            
            // Skip obvious header rows
            const serialNum = (caseItem.SerialNumber || caseItem.serialNumber || '').toString().toLowerCase();
            if (serialNum.includes('serial') ||
                serialNum.includes('s.no') ||
                serialNum.includes('sr.') ||
                serialNum.includes('no.')) {
                return false;
            }
            
            // Skip empty or invalid serial numbers
            if (!serialNum || serialNum.trim() === '' || serialNum === '0') {
                return false;
            }
            
            return true;
        });
    } catch (error) {
        console.error('[error] [filterValidRows] Failed to filter NCLT valid rows:', error.message);
        return [];
    }
}

// Process NCLT data for consistency
function processNCLTData(ncltData) {
    try {
        if (!Array.isArray(ncltData)) {
            throw new Error('NCLT data must be an array');
        }
        
        return ncltData.map(item => ({
            serialNumber: cleanText(item.serialNumber),
            caseNumber: cleanText(item.caseNumber),
            petitioner: cleanText(item.petitioner),
            respondent: cleanText(item.respondent),
            orderDate: cleanText(item.orderDate),
            bench: cleanText(item.bench),
            orderUrl: cleanUrl(item.orderUrl),
            orderText: cleanText(item.orderText)
        }));
    } catch (error) {
        console.error('[error] [processNCLTData] Failed to process NCLT data:', error.message);
        throw new Error(`Failed to process NCLT data: ${error.message}`);
    }
}

// Format date for NCLT forms (if needed in specific format)
function formatDateForNCLTForm(dateString) {
    if (!dateString) return '';
    
    if (dateString.includes('-')) {
        const [day, month, year] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    
    return dateString;
}

// Extract NCLT case type from full case string
function extractNCLTCaseType(caseString) {
    if (!caseString || typeof caseString !== 'string') {
        return 'NCLT';
    }
    
    const parsed = parseNCLTCaseNumber(caseString);
    return parsed.caseType || 'NCLT';
}

// Generate NCLT case number string
function generateNCLTCaseNumber(caseType, number, year) {
    if (!number || !year) return '';
    
    const cleanType = (caseType || 'CP').toUpperCase();
    return `${cleanType} ${number}/${year}`;
}

// Validate NCLT search parameters
function validateNCLTSearchParams(params) {
    const { bench, caseType, cpNo, year } = params;
    const errors = [];
    
    if (!bench || typeof bench !== 'string') {
        errors.push('Bench is required and must be a string');
    } else if (!validateNCLTBench(bench)) {
        errors.push(`Invalid NCLT bench: ${bench}`);
    }
    
    if (year && (isNaN(parseInt(year)) || parseInt(year) < 2000 || parseInt(year) > new Date().getFullYear())) {
        errors.push('Year must be between 2000 and current year');
    }
    
    if (cpNo && (typeof cpNo !== 'string' && typeof cpNo !== 'number')) {
        errors.push('CP Number must be a string or number');
    }
    
    if (!cpNo && !caseType && !year) {
        errors.push('At least one search parameter (cpNo, caseType, or year) is required');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// Transform NCLT data to database schema format
function transformToNCLTDatabaseSchema(ncltItem, searchParams = {}) {
    const currentTimestamp = new Date().toISOString();
    const parsedCase = parseNCLTCaseNumber(ncltItem.caseNumber || ncltItem.DiaryNumber);
    
    return {
        serial_number: ncltItem.serialNumber || '',
        diary_number: ncltItem.caseNumber || '',
        case_number: parsedCase.fullCaseNumber || ncltItem.caseNumber || '',
        parties: ncltItem.petitioner && ncltItem.respondent ? 
                `${ncltItem.petitioner} vs ${ncltItem.respondent}` : '',
        advocates: '', // Not typically available in NCLT data
        bench: searchParams.bench || ncltItem.bench || '',
        judgment_by: '', // Not typically available in NCLT data
        judgment_date: ncltItem.orderDate || '',
        court: 'NCLT',
        date: currentTimestamp,
        created_at: currentTimestamp,
        updated_at: currentTimestamp,
        judgment_url: ncltItem.orderUrl ? [ncltItem.orderUrl] : [],
        file_path: '',
        judgment_text: ncltItem.orderText ? [ncltItem.orderText] : [],
        case_type: parsedCase.caseType || searchParams.caseType || '',
        city: '',
        district: '',
        judgment_type: ncltItem.orderText || 'ORDER',
        petitioner: ncltItem.petitioner || '',
        respondent: ncltItem.respondent || ''
    };
}

// Clean NCLT specific data
function cleanNCLTData(data) {
    if (!data) return '';
    
    return cleanText(data)
        .replace(/\bNCLT\b/gi, 'NCLT') // Standardize NCLT
        .replace(/\bCP\(IB\)\b/gi, 'CP(IB)') // Standardize CP(IB)
        .replace(/\bNo\.\s*/gi, 'No. ') // Standardize "No."
        .replace(/\bVs\.?\b/gi, 'vs') // Standardize "vs"
        .replace(/\s+/g, ' ') // Clean multiple spaces
        .trim();
}

module.exports = {
    wait,
    cleanText,
    cleanUrl,
    isValidDate,
    getCurrentDate,
    getYesterday,
    parseNCLTCaseNumber,
    validateNCLTBench,
    transformRowData,
    filterValidRows,
    processNCLTData,
    formatDateForNCLTForm,
    extractNCLTCaseType,
    generateNCLTCaseNumber,
    validateNCLTSearchParams,
    transformToNCLTDatabaseSchema,
    cleanNCLTData,
    
    // Legacy functions for backward compatibility
    parseCaseNumber: parseNCLTCaseNumber,
    processCourtData: processNCLTData,
    formatDateForForm: formatDateForNCLTForm,
    extractCaseType: extractNCLTCaseType,
    transformToDatabaseSchema: transformToNCLTDatabaseSchema
};