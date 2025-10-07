const functions = require("firebase-functions");

// NCLT Court Judgments Scraper Function - NO IMPORTS AT MODULE LEVEL
exports.fetchNCLTCourtJudgments = functions
  .region('asia-south1')
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .https.onRequest(async (request, response) => {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      console.log(`[${requestId}] [start] [fetchNCLTCourtJudgments] NCLT Court Scraping started`);
      
      // LAZY LOAD THE SCRAPER INSIDE THE FUNCTION
      console.log(`[${requestId}] [info] Loading NCLT scraper module...`);
      const { NCLTCourtJudgmentsScrapper } = require('./ncltCourtScrapper');
      console.log(`[${requestId}] [info] NCLT scraper module loaded successfully`);
      
      // Extract payload - FIXED TO HANDLE PARSING
      let {
        diaryNumber,
        year,
        court,
        caseType,
        bench,
        cp_no,
        case_type
      } = request.body;
      
      // Handle different parameter formats
      if (!diaryNumber && cp_no) {
        diaryNumber = cp_no;
      }
      if (!caseType && case_type) {
        caseType = case_type;
      }
      
      // PARSE DIARY NUMBER AND YEAR IF THEY'RE COMBINED
      if (diaryNumber && diaryNumber.includes('/') && !year) {
        console.log(`[${requestId}] [debug] Parsing combined diaryNumber: ${diaryNumber}`);
        const parts = diaryNumber.split('/');
        if (parts.length === 2) {
          diaryNumber = parts[0].trim();
          year = parts[1].trim();
        }
      }
      
      // If year is still missing, try to extract from request body as separate field
      if (!year) {
        console.log(`[${requestId}] [debug] Year still missing, checking other sources...`);
        if (request.body.year) {
          year = request.body.year.toString();
        } else {
          year = new Date().getFullYear().toString();
          console.log(`[${requestId}] [debug] Using default year: ${year}`);
        }
      }
      
      console.log(`[${requestId}] [info] Processed Payload:`, {
        diaryNumber, year, court, caseType, bench
      });
      
      // Validate required parameters
      if (!bench) {
        console.error(`[${requestId}] [error] Bench is required`);
        return response.status(400).json({
          success: false,
          error: 'Bench is required',
          message: 'Missing required parameter: bench'
        });
      }
      
      if (!diaryNumber && !caseType && !year) {
        console.error(`[${requestId}] [error] At least one search parameter is required`);
        return response.status(400).json({
          success: false,
          error: 'At least one search parameter is required',
          message: 'Provide diaryNumber, caseType, or year'
        });
      }
      
      // Prepare search parameters
      const searchParams = {
        diaryNumber,
        year,
        court,
        caseType,
        bench
      };
      
      console.log(`[${requestId}] [info] Starting NCLT scraping with parameters:`, searchParams);
      
      // Call the scraper function
      const result = await NCLTCourtJudgmentsScrapper(searchParams);
      
      console.log(`[${requestId}] [success] [fetchNCLTCourtJudgments] Completed processing. Total records: ${result.total_records || result.totalRecords || 0}`);
      
      // Ensure response has the expected structure
      const finalResult = {
        success: true,
        total_records: result.total_records || result.totalRecords || 0,
        data: result.data || [],
        message: result.message || 'NCLT scraping completed successfully',
        search_parameters: {
          original_diaryNumber: request.body.diaryNumber || request.body.cp_no,
          parsed_diaryNumber: diaryNumber,
          parsed_year: year,
          bench: bench,
          caseType: caseType
        },
        extraction_metadata: result.extraction_metadata || {},
        pdf_count: result.pdf_count || 0,
        ...result
      };
      
      response.status(200).json(finalResult);
      console.log(`[${requestId}] [end] [fetchNCLTCourtJudgments] NCLT Court Scraping completed`);
      
    } catch (error) {
      console.error(`[${requestId}] [error] [fetchNCLTCourtJudgments] Failed to scrape NCLT data:`, error.message);
      console.error(`[${requestId}] [error] Stack trace:`, error.stack);
      
      response.status(500).json({
        success: false,
        error: error.message,
        message: 'NCLT scraping failed',
        total_records: 0,
        data: [],
        error_type: error.name || 'UnknownError',
        timestamp: new Date().toISOString()
      });
      
      console.log(`[${requestId}] [end] [fetchNCLTCourtJudgments] NCLT Court Scraping completed with error`);
    }
  });