const functions = require('firebase-functions');
const { extractAllPdfUrls, extractAllPdfContent, extractSinglePdfContent } = require('./pdfExtractor');
const { ncltCauseListScrapper } = require('./ncltCauseListScrapper');

/**
 * Cloud Function for NCLT PDF extraction
 * Supports multiple modes:
 * 1. Extract PDF URLs only
 * 2. Extract single PDF content  
 * 3. Extract all PDF content from a cause list date
 */
const ncltPdfExtractor = functions
    .region('asia-south1')
    .runWith({
        timeoutSeconds: 540,
        memory: '2GB'
    })
    .https
    .onRequest(async (req, res) => {
        // Set CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.status(200).send();
            return;
        }

        try {
            const startTime = Date.now();
            
            // Get parameters
            const {
                mode = 'urls', // 'urls', 'single', 'all'
                bench = 'Ahmedabad Bench Court-II',
                causeListDate,
                pdfUrl
            } = req.method === 'GET' ? req.query : req.body;

            console.log(`[info] [ncltPdfExtractor] Starting extraction with mode: ${mode}`);
            console.log(`[info] [ncltPdfExtractor] Parameters:`, { mode, bench, causeListDate, pdfUrl });

            let result;

            switch (mode) {
                case 'urls':
                    // Mode 1: Extract PDF URLs only
                    if (!causeListDate) {
                        return res.status(400).json({
                            success: false,
                            error: 'causeListDate is required for urls mode'
                        });
                    }

                    console.log(`[info] [ncltPdfExtractor] Mode: URLs extraction for ${bench} on ${causeListDate}`);
                    
                    // First scrape the cause list
                    const scraperResult = await ncltCauseListScrapper({
                        bench: bench,
                        causeListDate: causeListDate
                    });

                    if (!scraperResult.success) {
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to scrape cause list',
                            details: scraperResult
                        });
                    }

                    // Extract PDF URLs
                    result = extractAllPdfUrls(scraperResult);
                    break;

                case 'single':
                    // Mode 2: Extract single PDF content
                    if (!pdfUrl) {
                        return res.status(400).json({
                            success: false,
                            error: 'pdfUrl is required for single mode'
                        });
                    }

                    console.log(`[info] [ncltPdfExtractor] Mode: Single PDF extraction for ${pdfUrl}`);
                    
                    result = await extractSinglePdfContent(pdfUrl, {
                        bench: bench,
                        causeListDate: causeListDate
                    });
                    break;

                case 'all':
                    // Mode 3: Extract all PDF content
                    if (!causeListDate) {
                        return res.status(400).json({
                            success: false,
                            error: 'causeListDate is required for all mode'
                        });
                    }

                    console.log(`[info] [ncltPdfExtractor] Mode: Complete PDF content extraction for ${bench} on ${causeListDate}`);
                    
                    // First scrape the cause list
                    const allScraperResult = await ncltCauseListScrapper({
                        bench: bench,
                        causeListDate: causeListDate
                    });

                    if (!allScraperResult.success) {
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to scrape cause list',
                            details: allScraperResult
                        });
                    }

                    // Extract all PDF content
                    result = await extractAllPdfContent(allScraperResult);
                    break;

                default:
                    return res.status(400).json({
                        success: false,
                        error: `Invalid mode: ${mode}. Valid modes are: urls, single, all`
                    });
            }

            const processingTime = Date.now() - startTime;
            
            // Add processing metadata
            const response = {
                ...result,
                processingTime: `${processingTime}ms`,
                timestamp: new Date().toISOString(),
                mode: mode,
                parameters: { bench, causeListDate, pdfUrl }
            };

            console.log(`[success] [ncltPdfExtractor] ${mode} extraction completed in ${processingTime}ms`);
            
            res.status(200).json(response);

        } catch (error) {
            console.error(`[error] [ncltPdfExtractor] PDF extraction failed:`, error);
            
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

module.exports = {
    ncltPdfExtractor
};
