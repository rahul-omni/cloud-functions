const axios = require('axios');
const pdf = require('pdf-parse');
const { parseCauseListWithOpenAI } = require('./openaiPdfParser');

/**
 * Download and parse PDF from URL using OpenAI
 * @param {string} pdfUrl - URL of the PDF to download and parse
 * @returns {Object} Parsed cause list data
 */
async function pdfScrapperCauseList(pdfUrl) {
    try {
        console.log(`[debug] [pdfScrapperCauseList] Starting PDF download from: ${pdfUrl}`);
        
        // Extract filename to identify Main vs Supplementary
        const filename = pdfUrl.split('/').pop() || 'unknown';
        const isMainCauseList = filename.toLowerCase().includes('main');
        const isSupplementaryCauseList = filename.toLowerCase().includes('supplementary') || filename.toLowerCase().includes('supply');
        console.log(`[debug] [pdfScrapperCauseList] PDF type detection:`);
        console.log(`[debug] [pdfScrapperCauseList] - Filename: ${filename}`);
        console.log(`[debug] [pdfScrapperCauseList] - Is Main Cause List: ${isMainCauseList}`);
        console.log(`[debug] [pdfScrapperCauseList] - Is Supplementary Cause List: ${isSupplementaryCauseList}`);
        
        // Download PDF
        const response = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            timeout: 30000 // 30 second timeout
        });
        
        console.log(`[debug] [pdfScrapperCauseList] PDF downloaded successfully, size: ${response.data.length} bytes`);
        
        // Parse PDF to text
        const pdfData = await pdf(response.data);
        const pdfText = pdfData.text;
        
        console.log(`[debug] [pdfScrapperCauseList] PDF parsed to text, length: ${pdfText.length} characters`);
        console.log(`[debug] [pdfScrapperCauseList] First 500 characters: ${pdfText.substring(0, 500)}`);
        
        // Check for court indicators in the text
        const hasChiefJustice = pdfText.includes("CHIEF JUSTICE'S COURT");
        const hasCourt2 = pdfText.includes("COURT NO. : 2") || pdfText.includes("COURT NO. 2");
        const hasCourt3 = pdfText.includes("COURT NO. : 3") || pdfText.includes("COURT NO. 3");
        console.log(`[debug] [pdfScrapperCauseList] Court indicators found:`);
        console.log(`[debug] [pdfScrapperCauseList] - Chief Justice's Court: ${hasChiefJustice}`);
        console.log(`[debug] [pdfScrapperCauseList] - Court No. 2: ${hasCourt2}`);
        console.log(`[debug] [pdfScrapperCauseList] - Court No. 3: ${hasCourt3}`);
        
        // Check for all possible court patterns
        const courtPatterns = [
            /COURT NO\.?\s*:?\s*(\d+)/gi,
            /CHIEF JUSTICE'S COURT/gi,
            /COURT\s+NO\.?\s*(\d+)/gi
        ];
        
        const allCourtMatches = [];
        courtPatterns.forEach((pattern, index) => {
            const matches = [...pdfText.matchAll(pattern)];
            if (matches.length > 0) {
                console.log(`[debug] [pdfScrapperCauseList] Pattern ${index + 1} found ${matches.length} matches:`, matches.map(m => m[0]));
                allCourtMatches.push(...matches);
            }
        });
        
        // Show text around each court header
        const courtHeaders = pdfText.match(/COURT[^]*?(?=\n\n|\n[A-Z]|$)/gi);
        if (courtHeaders) {
            console.log(`[debug] [pdfScrapperCauseList] Found ${courtHeaders.length} court sections:`);
            courtHeaders.forEach((header, index) => {
                console.log(`[debug] [pdfScrapperCauseList] Court section ${index + 1}: ${header.substring(0, 300)}...`);
            });
        }
        
        // Check if text is large enough to trigger chunking
        const estimatedTokens = Math.ceil(pdfText.length / 4);
        console.log(`[debug] [pdfScrapperCauseList] Estimated tokens: ${estimatedTokens}, will use chunking: ${estimatedTokens > 100000}`);
        
        // Special debugging for Main Cause List
        if (isMainCauseList) {
            console.log(`[debug] [pdfScrapperCauseList] MAIN CAUSE LIST DEBUGGING:`);
            console.log(`[debug] [pdfScrapperCauseList] - Text length: ${pdfText.length} characters`);
            console.log(`[debug] [pdfScrapperCauseList] - Estimated tokens: ${estimatedTokens}`);
            console.log(`[debug] [pdfScrapperCauseList] - Will use chunking: ${estimatedTokens > 100000}`);
            
            // Count court references more specifically
            const courtCount = (pdfText.match(/COURT NO\.?\s*:?\s*\d+/gi) || []).length;
            const chiefJusticeCount = (pdfText.match(/CHIEF JUSTICE'S COURT/gi) || []).length;
            console.log(`[debug] [pdfScrapperCauseList] - Court references found: ${courtCount}`);
            console.log(`[debug] [pdfScrapperCauseList] - Chief Justice references: ${chiefJusticeCount}`);
            
            // Show sample of text around court headers
            const courtMatches = pdfText.match(/COURT[^]*?(?=\n\n|\n[A-Z]|$)/gi);
            if (courtMatches && courtMatches.length > 0) {
                console.log(`[debug] [pdfScrapperCauseList] - Found ${courtMatches.length} court sections in Main Cause List`);
                courtMatches.slice(0, 3).forEach((match, index) => {
                    console.log(`[debug] [pdfScrapperCauseList] - Court section ${index + 1}: ${match.substring(0, 200)}...`);
                });
            }
        }
        
        // Use OpenAI to parse the text
        console.log(`[debug] [pdfScrapperCauseList] Starting OpenAI parsing...`);
        const parsedData = await parseCauseListWithOpenAI(pdfText);
        
        console.log(`[debug] [pdfScrapperCauseList] OpenAI parsing completed successfully`);
        console.log(`[debug] [pdfScrapperCauseList] Final result summary:`);
        console.log(`[debug] [pdfScrapperCauseList] - Courts found: ${parsedData.courts ? parsedData.courts.length : 0}`);
        console.log(`[debug] [pdfScrapperCauseList] - Total cases: ${parsedData.courts ? parsedData.courts.reduce((total, court) => total + court.cases.length, 0) : 0}`);
        
        if (parsedData.courts) {
            parsedData.courts.forEach((court, index) => {
                console.log(`[debug] [pdfScrapperCauseList] - Court ${index + 1}: ${court.courtName} (${court.courtNumber}) - ${court.cases.length} cases`);
            });
        }
        
        // Special debugging for Main Cause List results
        if (isMainCauseList) {
            console.log(`[debug] [pdfScrapperCauseList] MAIN CAUSE LIST RESULT ANALYSIS:`);
            console.log(`[debug] [pdfScrapperCauseList] - Expected: ~18 courts, Got: ${parsedData.courts ? parsedData.courts.length : 0} courts`);
            
            if (parsedData.courts && parsedData.courts.length < 5) {
                console.log(`[warning] [pdfScrapperCauseList] MAIN CAUSE LIST ISSUE: Only found ${parsedData.courts.length} courts instead of expected ~18!`);
                console.log(`[warning] [pdfScrapperCauseList] This suggests either:`);
                console.log(`[warning] [pdfScrapperCauseList] 1. The PDF only contains Chief Justice's Court`);
                console.log(`[warning] [pdfScrapperCauseList] 2. Chunking is not working properly`);
                console.log(`[warning] [pdfScrapperCauseList] 3. OpenAI is not parsing all courts correctly`);
            } else if (parsedData.courts && parsedData.courts.length >= 5) {
                console.log(`[success] [pdfScrapperCauseList] MAIN CAUSE LIST SUCCESS: Found ${parsedData.courts.length} courts - parsing working correctly!`);
            }
        }
        
        return parsedData;
        
    } catch (error) {
        console.error(`[error] [pdfScrapperCauseList] Failed to process PDF:`, error);
        throw error;
    }
}

module.exports = {
    pdfScrapperCauseList
};