/**
 * Transform NCLT cause list data to standardized format
 */

/**
 * Transform extracted NCLT data to standardized format
 * @param {Array} extractedData - Raw extracted data from page
 * @param {Object} metadata - Additional metadata (bench, date, etc.)
 * @returns {Object} Transformed data with standardized structure
 */
function transformNCLTData(extractedData, metadata = {}) {
    console.log('[transform] Starting NCLT data transformation...');
    
    try {
        if (!extractedData || !Array.isArray(extractedData)) {
            console.log('[transform] No valid data to transform');
            return {
                success: false,
                data: [],
                totalRecords: 0,
                message: 'No data to transform'
            };
        }
        
        console.log(`[transform] Transforming ${extractedData.length} raw entries`);
        
        const transformedData = extractedData.map((entry, index) => {
            // Standard NCLT case structure
            const benchName = metadata.bench?.name || metadata.name || 'unknown';
            const transformed = {
                id: `nclt_${benchName.replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}`,
                caseNumber: entry.caseNumber || entry.case_number || `Case ${index + 1}`,
                parties: entry.parties || entry.petitioner_respondent || 'Not specified',
                stage: entry.stage || entry.current_stage || 'Not specified',
                courtRoom: entry.courtRoom || entry.court_room || entry.court || 'Not specified',
                listingTime: entry.listingTime || entry.time || 'Not specified',
                bench: metadata.bench?.name || metadata.name || 'Not specified',
                causeListDate: metadata.causeListDate || new Date().toISOString().split('T')[0],
                
                // Additional NCLT specific fields
                caseType: entry.caseType || entry.case_type || 'Not specified',
                applicant: entry.applicant || entry.petitioner || 'Not specified',
                respondent: entry.respondent || 'Not specified',
                advocateDetails: entry.advocate || entry.counsel || 'Not specified',
                
                // Metadata
                scrapedAt: new Date().toISOString(),
                source: 'NCLT Official Website',
                rawData: entry // Keep original data for reference
            };
            
            return transformed;
        });
        
        console.log(`[transform] Successfully transformed ${transformedData.length} entries`);
        
        return {
            success: true,
            data: transformedData,
            totalRecords: transformedData.length,
            metadata: {
                bench: metadata.bench,
                causeListDate: metadata.causeListDate,
                scrapedAt: new Date().toISOString(),
                transformedAt: new Date().toISOString()
            },
            message: `Successfully transformed ${transformedData.length} NCLT cause list entries`
        };
        
    } catch (error) {
        console.error('[transform] Error transforming data:', error.message);
        return {
            success: false,
            data: [],
            totalRecords: 0,
            error: error.message,
            message: 'Failed to transform NCLT data'
        };
    }
}

/**
 * Transform PDF-based NCLT data
 * @param {Object} pdfData - Data extracted from PDF
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Transformed data
 */
function transformNCLTPdfData(pdfData, metadata = {}) {
    console.log('[transform] Transforming NCLT PDF data...');
    
    try {
        if (!pdfData || !pdfData.cases) {
            return {
                success: false,
                data: [],
                totalRecords: 0,
                message: 'No PDF data to transform'
            };
        }
        
        const transformedCases = pdfData.cases.map((caseItem, index) => ({
            id: `nclt_pdf_${(metadata.bench?.name || metadata.name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}`,
            caseNumber: caseItem.case_number || `PDF Case ${index + 1}`,
            parties: caseItem.parties || 'Not specified',
            stage: caseItem.stage || 'Not specified',
            courtRoom: caseItem.court_room || 'Not specified',
            listingTime: caseItem.time || 'Not specified',
            bench: metadata.bench?.name || metadata.name || pdfData.bench || 'Not specified',
            causeListDate: metadata.causeListDate || pdfData.date,
            
            // PDF specific fields
            caseType: caseItem.case_type || 'Not specified',
            applicant: caseItem.applicant || 'Not specified',
            respondent: caseItem.respondent || 'Not specified',
            
            // Metadata
            scrapedAt: new Date().toISOString(),
            source: 'NCLT PDF Document',
            extractionMethod: 'PDF + OpenAI',
            rawData: caseItem
        }));
        
        return {
            success: true,
            data: transformedCases,
            totalRecords: transformedCases.length,
            metadata: {
                ...metadata,
                pdfInfo: pdfData.metadata,
                transformedAt: new Date().toISOString()
            },
            message: `Successfully transformed ${transformedCases.length} cases from PDF`
        };
        
    } catch (error) {
        console.error('[transform] Error transforming PDF data:', error.message);
        return {
            success: false,
            data: [],
            totalRecords: 0,
            error: error.message,
            message: 'Failed to transform PDF data'
        };
    }
}

module.exports = {
    transformNCLTData,
    transformNCLTPdfData
};
