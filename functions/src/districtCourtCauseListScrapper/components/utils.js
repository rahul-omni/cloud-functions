// Wait utility function
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Format date for form input (MM/DD/YYYY format)
function formatDateForForm(dateString) {
    try {
        let date;
        
        // Handle DD-MM-YYYY format (e.g., "22-09-2025")
        if (dateString.includes('-') && dateString.split('-').length === 3) {
            const parts = dateString.split('-');
            const day = parts[0];
            const month = parts[1];
            const year = parts[2];
            date = new Date(`${year}-${month}-${day}`);
        }
        // Handle YYYY-MM-DD format (e.g., "2025-09-22")
        else if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
            date = new Date(dateString);
        }
        // Handle other formats
        else {
            date = new Date(dateString);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
        
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    } catch (error) {
        console.error('[formatDateForForm] Error formatting date:', error.message);
        return '';
    }
}

// Parse case number and year from case details string
function parseCaseDetails(caseDetailsString) {
    try {
        if (!caseDetailsString || typeof caseDetailsString !== 'string') {
            return { caseNumber: '', caseYear: '', caseType: '' };
        }

        // Common patterns for case details:
        // "CA/1842/2014" or "EXE/291/2021" or "CM/296/2025"
        // "CS/123/2023" or "CS 123/2023" or "CS-123/2023"
        // "Civil Suit No. 123/2023"
        // "Criminal Case No. 456/2023"
        
        const patterns = [
            /^([A-Z]+)[\/\-\s]+(\d+)[\/\-\s]+(\d{4})$/i,  // CA/1842/2014, EXE/291/2021
            /^([A-Z\s]+)\s*No\.?\s*(\d+)[\/\-\s]+(\d{4})$/i,  // Civil Suit No. 123/2023
            /^([A-Z]+)\s+(\d+)[\/\-\s]+(\d{4})$/i,  // CS 123/2023
        ];

        for (const pattern of patterns) {
            const match = caseDetailsString.trim().match(pattern);
            if (match) {
                return {
                    caseType: match[1].trim(),
                    caseNumber: match[2].trim(),
                    caseYear: match[3].trim()
                };
            }
        }

        // Fallback: try to extract year from the string
        const yearMatch = caseDetailsString.match(/\b(\d{4})\b/);
        const year = yearMatch ? yearMatch[1] : '';

        return {
            caseType: '',
            caseNumber: '',
            caseYear: year
        };

    } catch (error) {
        console.error('[parseCaseDetails] Error parsing case details:', error.message);
        return { caseNumber: '', caseYear: '', caseType: '' };
    }
}

// Clean and validate case data
function cleanCaseData(caseData) {
    try {
        const cleaned = {
            serial_number: String(caseData.serial_number || '').trim(),
            case_details: String(caseData.case_details || '').trim(),
            petitioner: String(caseData.petitioner || '').trim(),
            respondent: String(caseData.respondent || '').trim(),
            advocate_petitioner: String(caseData.advocate_petitioner || '').trim(),
            advocate_respondent: String(caseData.advocate_respondent || '').trim(),
            case_status: String(caseData.case_status || '').trim(),
            next_hearing_date: caseData.next_hearing_date || null
        };

        // Parse case details to extract structured information
        const parsedDetails = parseCaseDetails(cleaned.case_details);
        cleaned.case_type = parsedDetails.caseType;
        cleaned.case_number = parsedDetails.caseNumber;
        cleaned.case_year = parsedDetails.caseYear;

        return cleaned;
    } catch (error) {
        console.error('[cleanCaseData] Error cleaning case data:', error.message);
        return caseData;
    }
}

// Filter valid case rows
function filterValidRows(cases) {
    try {
        return cases.filter(caseItem => {
            // Basic validation - must have case details
            if (!caseItem.case_details || caseItem.case_details.trim() === '') {
                return false;
            }

            // Must have at least petitioner or respondent
            if (!caseItem.petitioner && !caseItem.respondent) {
                return false;
            }

            return true;
        });
    } catch (error) {
        console.error('[filterValidRows] Error filtering rows:', error.message);
        return cases;
    }
}

// Process court data and clean it
function processCourtData(courtsData) {
    try {
        return courtsData.map(court => {
            const cleanedCases = court.cases.map(cleanCaseData);
            const validCases = filterValidRows(cleanedCases);

            return {
                ...court,
                cases: validCases,
                cases_in_current_page: validCases.length,
                total_cases_available: Math.max(court.total_cases_available || validCases.length, validCases.length)
            };
        });
    } catch (error) {
        console.error('[processCourtData] Error processing court data:', error.message);
        return courtsData;
    }
}

// Transform case data to database schema
function transformToDatabaseSchema(caseItem, courtData, searchData) {
    try {
        return {
            // Case information
            case_number: caseItem.case_number || '',
            case_year: caseItem.case_year || '',
            case_type: caseItem.case_type || '',
            case_title: caseItem.case_details || '',
            
            // Court information
            court_name: courtData.court_name || '',
            court_number: courtData.court_number || '',
            establishment_code: courtData.establishment_code || '',
            
            // Cause list information
            cause_list_date: new Date(searchData.causeListDate),
            cause_type: searchData.causeType || '',
            serial_number: caseItem.serial_number || '',
            
            // Party information
            petitioner: caseItem.petitioner || '',
            respondent: caseItem.respondent || '',
            advocate_petitioner: caseItem.advocate_petitioner || '',
            advocate_respondent: caseItem.advocate_respondent || '',
            
            // Case status
            case_status: caseItem.case_status || '',
            next_hearing_date: caseItem.next_hearing_date ? new Date(caseItem.next_hearing_date) : null,
            
            // Metadata
            scraped_at: new Date(),
            search_parameters: searchData,
            source_url: 'https://gurugram.dcourts.gov.in/cause-list-%e2%81%84-daily-board/'
        };
    } catch (error) {
        console.error('[transformToDatabaseSchema] Error transforming data:', error.message);
        throw error;
    }
}

// Determine search type based on input parameters
function determineSearchType(causeListDate, courtComplex, courtEstablishment, courtNumber, causeType) {
    try {
        const searchData = {
            causeListDate: causeListDate,
            courtComplex: courtComplex,
            courtEstablishment: courtEstablishment,
            courtNumber: courtNumber,
            causeType: causeType,
            searchTimestamp: new Date().toISOString()
        };

        return {
            searchType: 'cause_list',
            searchData: searchData
        };
    } catch (error) {
        console.error('[determineSearchType] Error determining search type:', error.message);
        throw error;
    }
}

// Validate search parameters
function validateSearchParameters(searchData) {
    try {
        const errors = [];

        if (!searchData.causeListDate) {
            errors.push('Cause list date is required');
        }

        if (!searchData.courtComplex && !searchData.courtEstablishment) {
            errors.push('Either court complex or court establishment must be specified');
        }

        if (!searchData.courtNumber) {
            errors.push('Court number is required');
        }

        if (!searchData.causeType || !['Civil', 'Criminal'].includes(searchData.causeType)) {
            errors.push('Cause type must be either "Civil" or "Criminal"');
        }

        if (errors.length > 0) {
            throw new Error(`Validation errors: ${errors.join(', ')}`);
        }

        return true;
    } catch (error) {
        console.error('[validateSearchParameters] Validation failed:', error.message);
        throw error;
    }
}

// Extract case information from cause list table row
function extractCaseFromRow(rowData) {
    try {
        // This function will be used to extract case information from table rows
        // The exact structure depends on the HTML table format
        
        return {
            serial_number: rowData.serial_number || '',
            case_details: rowData.case_details || '',
            petitioner: rowData.petitioner || '',
            respondent: rowData.respondent || '',
            advocate_petitioner: rowData.advocate_petitioner || '',
            advocate_respondent: rowData.advocate_respondent || '',
            case_status: rowData.case_status || '',
            next_hearing_date: rowData.next_hearing_date || null
        };
    } catch (error) {
        console.error('[extractCaseFromRow] Error extracting case from row:', error.message);
        return {};
    }
}

module.exports = {
    wait,
    formatDateForForm,
    parseCaseDetails,
    cleanCaseData,
    filterValidRows,
    processCourtData,
    transformToDatabaseSchema,
    determineSearchType,
    validateSearchParameters,
    extractCaseFromRow
};
