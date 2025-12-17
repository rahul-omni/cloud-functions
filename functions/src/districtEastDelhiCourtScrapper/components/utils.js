
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
function determineSearchType(date, diaryNumber, caseTypeValue, courtComplex, courtName = '') {
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
                    courtComplex: courtComplex,
                    courtName: courtName, // Add courtName from payload
                    diaryNumber: diaryNumber, // Keep original diary number for database
                    diaryNumberFormatted: `${parsedCase.caseNumber}/${parsedCase.caseYear}` // Formatted as 212/2022
                }
            };
        }
    }
    
    // Default to date search
    
    return {
        searchType: 'order_date',
        searchData: {
            date: date || getYesterday(),
            courtComplex: courtComplex,
            courtName: courtName // Add courtName from payload
        }
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

// Extract case type from case_details (e.g., "BA" from "BA/1234/2022" or "CR Cases" from "CR Cases/212/2022")
function extractCaseType(caseDetails) {
    if (!caseDetails || typeof caseDetails !== 'string') {
        return '';
    }
    
    // Pattern 1: "TYPE/NUMBER/YEAR" (e.g., "BA/1234/2022")
    const pattern1 = caseDetails.match(/^([A-Z]+)\/(\d+)\/(\d{4})$/);
    if (pattern1) {
        return pattern1[1];
    }
    
    // Pattern 2: "TYPE WITH SPACES/NUMBER/YEAR" (e.g., "CR Cases/212/2022")
    const pattern2 = caseDetails.match(/^([A-Z\s]+)\/(\d+)\/(\d{4})$/);
    if (pattern2) {
        return pattern2[1].trim();
    }
    
    return '';
}

// Extract diary number from case_details (e.g., "1234/2022" from "BA/1234/2022" or "CR Cases/212/2022")
function extractDiaryNumber(caseDetails) {
    if (!caseDetails || typeof caseDetails !== 'string') {
        return '';
    }
    
    // Pattern 1: "TYPE/NUMBER/YEAR" (e.g., "BA/1234/2022")
    const pattern1 = caseDetails.match(/^([A-Z]+)\/(\d+)\/(\d{4})$/);
    if (pattern1) {
        return `${pattern1[2]}/${pattern1[3]}`;
    }
    
    // Pattern 2: "TYPE WITH SPACES/NUMBER/YEAR" (e.g., "CR Cases/212/2022")
    const pattern2 = caseDetails.match(/^([A-Z\s]+)\/(\d+)\/(\d{4})$/);
    if (pattern2) {
        return `${pattern2[2]}/${pattern2[3]}`;
    }
    
    return '';
}

// Transform scraped data to database schema format
function transformToDatabaseSchema(caseItem, court, searchData) {
    const currentTimestamp = new Date().toISOString();
    const caseType = extractCaseType(caseItem.case_type_number_year || caseItem.case_number);
    
    // Prioritize diary number from searchData (payload), then try extracting from case number
    let diaryNumber = searchData.diaryNumberFormatted || extractDiaryNumber(caseItem.case_type_number_year || caseItem.filing_number);
    
    console.log('[transform] Input caseItem keys:', Object.keys(caseItem));
    console.log('[transform] case_type_number_year:', caseItem.case_type_number_year);
    console.log('[transform] searchData:', searchData);
    console.log('[transform] diaryNumber from payload:', searchData.diaryNumberFormatted);
    console.log('[transform] diaryNumber final:', diaryNumber);
    console.log('[transform] Input all_parties count:', caseItem.all_parties?.length);
    console.log('[transform] courtName from payload:', searchData.courtName);
    
    // Build judgment_url array with order details as JSON objects
    const judgmentUrls = [];
    
    // Remove duplicates from order_details array by using a Set based on order_url
    const uniqueOrderDetails = [];
    const seenUrls = new Set();
    
    if (Array.isArray(caseItem.order_details)) {
        caseItem.order_details.forEach(order => {
            if (order.order_url && !seenUrls.has(order.order_url)) {
                seenUrls.add(order.order_url);
                uniqueOrderDetails.push({
                    order_number: order.order_number,
                    order_date: order.order_date,
                    order_details: order.order_details,
                    order_url: order.order_url,
                    is_final: order.is_final || false
                });
            }
        });
    }
    
    // Add unique order details to judgment_url array
    judgmentUrls.push(...uniqueOrderDetails);
    
    // Also add any standalone judgment URLs if they exist
    if (Array.isArray(caseItem.judgment_url)) {
        caseItem.judgment_url.forEach(url => {
            if (url && typeof url === 'string' && !seenUrls.has(url)) {
                seenUrls.add(url);
                judgmentUrls.push({
                    order_url: url,
                    order_details: 'COPY OF ORDER'
                });
            }
        });
    }
    
    console.log('[transform] Total unique orders:', judgmentUrls.length);
    
    // Get parties information
    const parties = caseItem.parties || '';
    
    // Get judgment by from the extracted data
    const judgmentBy = caseItem.judgment_by || '';
    
    // Get acts information
    const acts = Array.isArray(caseItem.acts) ? 
        caseItem.acts.map(a => `${a.act} Section ${a.section}`).join(', ') : '';
    
    // Extract case_status as string (it might be an object)
    let caseStatus = '';
    if (typeof caseItem.case_status === 'string') {
        caseStatus = caseItem.case_status;
    } else if (typeof caseItem.case_status === 'object' && caseItem.case_status !== null) {
        caseStatus = caseItem.case_status.case_status || '';
    }
    
    // Format case number as MACT/10/2022 from case_type_number_year
    // case_type_number_year is the full format we want to save
    const formattedCaseNumber = caseItem.case_type_number_year || `${caseType}/${diaryNumber}`;
    
    const transformedData = {
        serial_number: caseItem.serial_number || '',
        diary_number: diaryNumber  || '',
        case_number: formattedCaseNumber,  // This will be "MACT/10/2022"
        parties: parties,
        advocates: '', // Not extracted in current implementation
        bench: judgmentBy,
        judgment_by: judgmentBy,
        judgment_date: caseItem.judgment_date || '',
        court: searchData.court || 'District Court',  // From test payload: "District Court"
        date: currentTimestamp,
        created_at: currentTimestamp,
        updated_at: currentTimestamp,
        judgment_url: judgmentUrls,
        file_path: '',
        judgment_text: [],
        case_type: caseItem.case_type || caseType,
        city: caseItem.city || 'Delhi',
        district: searchData.courtName || caseItem.district || '',  // Prioritize courtName from payload, then extracted district
        judgment_type: caseItem.judgment_type || '',
        courtComplex: searchData.courtComplex || caseItem.court_complex || '',  // From test payload: "Karkardooma Court Complex"
        courtType: court.court_name || caseItem.courtComplex || '',
        
        // Additional metadata
        filing_number:  caseItem.filing_number || '',
        filing_date: caseItem.filing_date || '',
        registered_on: caseItem.registered_on || '',
        first_hearing_date: caseItem.first_hearing_date || '',
        case_status: caseStatus,
        acts: acts,
        
        // Deduplicate arrays for case_details_json
        // Remove duplicate parties by name
        case_details_json: JSON.stringify({
            all_parties: Array.from(new Map(
                (caseItem.all_parties || []).map(p => [p.name, p])
            ).values()),
            listing_history: Array.from(new Map(
                (caseItem.listing_history || []).map(h => [
                    `${h.business_date}_${h.hearing_date}_${h.purpose}`, 
                    h
                ])
            ).values()),
            order_details: uniqueOrderDetails,  // Already deduplicated above
            court_complex: caseItem.court_complex || '',
            case_status_details: caseItem.case_status || {}
        })
    };
    
    console.log('[transform] Output parties:', transformedData.parties);
    console.log('[transform] Output district:', transformedData.district);
    console.log('[transform] Output judgment_url count:', transformedData.judgment_url.length);
    console.log('[transform] Output case_status:', transformedData.case_status);
    
    return transformedData;
}

module.exports = {
    wait,
    cleanText,
    cleanUrl,
    isValidDate,
    getYesterday,
    parseCaseNumber,
    determineSearchType,
    filterValidRows,
    processCourtData,
    formatDateForForm,
    extractCaseType,
    extractDiaryNumber,
    transformToDatabaseSchema
}; 