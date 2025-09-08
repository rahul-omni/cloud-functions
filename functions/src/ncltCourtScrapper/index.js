const functions = require("firebase-functions");
const { NCLTCourtJudgmentsScrapper } = require('./ncltCourtScrapper');

// NCLT Court Judgments Scraper Function
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
      
      // Extract payload - FIXED TO HANDLE PARSING
      let {
        diaryNumber,
        year,
        court,
        caseType,
        bench
      } = request.body;
      
      // PARSE DIARY NUMBER AND YEAR IF THEY'RE COMBINED
      if (diaryNumber && diaryNumber.includes('/') && !year) {
        console.log(`[${requestId}] [debug] Parsing combined diaryNumber: ${diaryNumber}`);
        
        const parts = diaryNumber.split('/');
        if (parts.length === 2) {
          diaryNumber = parts[0].trim(); // Extract just the number part
          year = parts[1].trim();        // Extract the year part
          
          console.log(`[${requestId}] [debug] Parsed - diaryNumber: ${diaryNumber}, year: ${year}`);
        }
      }
      
      // If year is still missing, try to extract from caseType or set default
      if (!year) {
        console.log(`[${requestId}] [debug] Year still missing, checking other sources...`);
        
        // Try to extract year from request body as separate field
        if (request.body.year) {
          year = request.body.year.toString();
        } else {
          // Set current year as fallback
          year = new Date().getFullYear().toString();
          console.log(`[${requestId}] [debug] Using current year as fallback: ${year}`);
        }
      }
      
      console.log(`[${requestId}] [info] Processed Payload:`, {
        diaryNumber,
        year,
        court,
        caseType,
        bench
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
      
      // Call scraper with processed payload object
      const searchParams = {
        diaryNumber,  // Now this should be just "36"
        year,         // Now this should be "2022"
        court,
        caseType,
        bench
      };
      
      console.log(`[${requestId}] [info] Starting NCLT scraping with parameters:`, searchParams);
      
      const result = await NCLTCourtJudgmentsScrapper(searchParams);
      
      console.log(`[${requestId}] [success] [fetchNCLTCourtJudgments] Completed processing. Total records: ${result.total_records || result.totalRecords || 0}`);
      
      // Ensure response has the expected structure
      const finalResult = {
        success: true,
        total_records: result.total_records || result.totalRecords || 0,
        data: result.data || [],
        message: result.message || 'NCLT scraping completed successfully',
        search_parameters: {
          original_diaryNumber: request.body.diaryNumber, // Show original input
          parsed_diaryNumber: diaryNumber,                // Show parsed diary number
          parsed_year: year,                             // Show parsed year
          bench: bench,
          caseType: caseType
        },
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
        data: []
      });
      
      console.log(`[${requestId}] [end] [fetchNCLTCourtJudgments] NCLT Court Scraping completed with error`);
    }
  });