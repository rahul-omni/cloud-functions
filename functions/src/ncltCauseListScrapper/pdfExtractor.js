const { pdfScrapperNCLTCauseList } = require('./pdfScrapperCauseList');

/**
 * Extract all PDF URLs from NCLT scraper result
 * @param {Object} scraperResult - Result from ncltCauseListScrapper
 * @returns {Object} Object containing all PDF URLs and metadata
 */
function extractAllPdfUrls(scraperResult) {
    try {
        console.log(`[info] [extractAllPdfUrls] Starting PDF URL extraction`);
        
        if (!scraperResult.success || !scraperResult.data) {
            throw new Error('Invalid scraper result - no data found');
        }
        
        const pdfData = [];
        const pdfUrls = [];
        
        scraperResult.data.forEach((entry, index) => {
            if (entry.rawData && entry.rawData.pdfUrl) {
                const pdfInfo = {
                    index: index + 1,
                    title: entry.rawData.title,
                    court: entry.rawData.court,
                    numberOfEntries: entry.rawData.numberOfEntries,
                    pdfUrl: entry.rawData.pdfUrl,
                    pdfFileName: entry.rawData.pdfFileName,
                    fileSize: entry.rawData.fileSize,
                    causeDate: entry.rawData.causeDate,
                    extractionMethod: entry.rawData.extractionMethod
                };
                
                pdfData.push(pdfInfo);
                pdfUrls.push(entry.rawData.pdfUrl);
            }
        });
        
        const result = {
            success: true,
            totalPdfs: pdfUrls.length,
            pdfUrls: pdfUrls,
            pdfData: pdfData,
            metadata: {
                bench: scraperResult.metadata.bench,
                causeListDate: scraperResult.metadata.causeListDate,
                scrapedAt: scraperResult.metadata.scrapedAt,
                extractedAt: new Date().toISOString()
            }
        };
        
        console.log(`[success] [extractAllPdfUrls] Successfully extracted ${pdfUrls.length} PDF URLs`);
        console.log(`[info] [extractAllPdfUrls] PDF URLs:`, pdfUrls);
        
        return result;
        
    } catch (error) {
        console.error(`[error] [extractAllPdfUrls] Failed to extract PDF URLs:`, error);
        return {
            success: false,
            error: error.message,
            totalPdfs: 0,
            pdfUrls: [],
            pdfData: []
        };
    }
}

/**
 * Extract content from all PDFs in JSON format
 * @param {Object} scraperResult - Result from ncltCauseListScrapper
 * @param {Object} options - Extraction options
 * @returns {Object} Complete PDF content extraction results
 */
async function extractAllPdfContent(scraperResult, options = {}) {
    try {
        console.log(`[info] [extractAllPdfContent] Starting PDF content extraction`);
        
        // First extract all PDF URLs
        const pdfUrlsResult = extractAllPdfUrls(scraperResult);
        
        if (!pdfUrlsResult.success) {
            throw new Error(`Failed to extract PDF URLs: ${pdfUrlsResult.error}`);
        }
        
        console.log(`[info] [extractAllPdfContent] Found ${pdfUrlsResult.totalPdfs} PDFs to process`);
        
        const extractedContent = [];
        const errors = [];
        
        // Process each PDF
        for (let i = 0; i < pdfUrlsResult.pdfData.length; i++) {
            const pdfInfo = pdfUrlsResult.pdfData[i];
            
            try {
                console.log(`[info] [extractAllPdfContent] Processing PDF ${i + 1}/${pdfUrlsResult.totalPdfs}: ${pdfInfo.pdfFileName}`);
                
                // Extract content using the PDF scraper
                const pdfContent = await pdfScrapperNCLTCauseList(pdfInfo.pdfUrl);
                
                const extractedPdf = {
                    index: pdfInfo.index,
                    metadata: {
                        title: pdfInfo.title,
                        court: pdfInfo.court,
                        numberOfEntries: pdfInfo.numberOfEntries,
                        pdfUrl: pdfInfo.pdfUrl,
                        pdfFileName: pdfInfo.pdfFileName,
                        fileSize: pdfInfo.fileSize,
                        causeDate: pdfInfo.causeDate,
                        extractedAt: new Date().toISOString()
                    },
                    content: pdfContent,
                    success: true
                };
                
                extractedContent.push(extractedPdf);
                console.log(`[success] [extractAllPdfContent] Successfully processed PDF ${i + 1}: ${pdfInfo.pdfFileName}`);
                
                // Add delay between requests to avoid overwhelming the server
                if (i < pdfUrlsResult.pdfData.length - 1) {
                    console.log(`[info] [extractAllPdfContent] Waiting 2 seconds before next PDF...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error(`[error] [extractAllPdfContent] Failed to process PDF ${i + 1} (${pdfInfo.pdfFileName}):`, error);
                
                const failedPdf = {
                    index: pdfInfo.index,
                    metadata: {
                        title: pdfInfo.title,
                        court: pdfInfo.court,
                        pdfUrl: pdfInfo.pdfUrl,
                        pdfFileName: pdfInfo.pdfFileName,
                        extractedAt: new Date().toISOString()
                    },
                    content: null,
                    success: false,
                    error: error.message
                };
                
                extractedContent.push(failedPdf);
                errors.push({
                    pdfIndex: pdfInfo.index,
                    pdfFileName: pdfInfo.pdfFileName,
                    error: error.message
                });
            }
        }
        
        // Compile final result
        const result = {
            success: true,
            totalPdfs: pdfUrlsResult.totalPdfs,
            successfulExtractions: extractedContent.filter(pdf => pdf.success).length,
            failedExtractions: extractedContent.filter(pdf => !pdf.success).length,
            pdfUrls: pdfUrlsResult.pdfUrls,
            extractedContent: extractedContent,
            errors: errors,
            metadata: {
                bench: scraperResult.metadata.bench,
                causeListDate: scraperResult.metadata.causeListDate,
                originalScrapedAt: scraperResult.metadata.scrapedAt,
                contentExtractedAt: new Date().toISOString(),
                processingTime: new Date().toISOString()
            }
        };
        
        console.log(`[success] [extractAllPdfContent] PDF content extraction completed`);
        console.log(`[success] [extractAllPdfContent] Successfully processed: ${result.successfulExtractions}/${result.totalPdfs} PDFs`);
        
        if (errors.length > 0) {
            console.log(`[warning] [extractAllPdfContent] ${errors.length} PDFs failed to process:`, errors);
        }
        
        return result;
        
    } catch (error) {
        console.error(`[error] [extractAllPdfContent] Failed to extract PDF content:`, error);
        return {
            success: false,
            error: error.message,
            totalPdfs: 0,
            successfulExtractions: 0,
            failedExtractions: 0,
            pdfUrls: [],
            extractedContent: [],
            errors: [{ error: error.message }]
        };
    }
}

/**
 * Extract content from a single PDF by URL
 * @param {string} pdfUrl - URL of the PDF to extract
 * @param {Object} metadata - Optional metadata about the PDF
 * @returns {Object} Single PDF extraction result
 */
async function extractSinglePdfContent(pdfUrl, metadata = {}) {
    try {
        console.log(`[info] [extractSinglePdfContent] Extracting content from: ${pdfUrl}`);
        
        // Extract content using the PDF scraper
        const pdfContent = await pdfScrapperNCLTCauseList(pdfUrl);
        
        const result = {
            success: true,
            metadata: {
                pdfUrl: pdfUrl,
                extractedAt: new Date().toISOString(),
                ...metadata
            },
            content: pdfContent
        };
        
        console.log(`[success] [extractSinglePdfContent] Successfully extracted content from PDF`);
        return result;
        
    } catch (error) {
        console.error(`[error] [extractSinglePdfContent] Failed to extract PDF content:`, error);
        return {
            success: false,
            error: error.message,
            metadata: {
                pdfUrl: pdfUrl,
                extractedAt: new Date().toISOString(),
                ...metadata
            },
            content: null
        };
    }
}

module.exports = {
    extractAllPdfUrls,
    extractAllPdfContent,
    extractSinglePdfContent
};
