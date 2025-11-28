const axios = require('axios');
const pdf = require('pdf-parse');
const { parseNCLTCauseListWithOpenAI } = require('./openaiPdfParser');

/**
 * Download and parse PDF from URL using OpenAI for NCLT
 * @param {string} pdfUrl - URL of the PDF to download and parse
 * @returns {Object} Parsed cause list data
 */
async function pdfScrapperNCLTCauseList(pdfUrl) {
    try {
        console.log(`[debug] [pdfScrapperNCLTCauseList] Starting PDF download from: ${pdfUrl}`);
        
        // Extract filename to identify type
        const filename = pdfUrl.split('/').pop() || 'unknown';
        console.log(`[debug] [pdfScrapperNCLTCauseList] PDF filename: ${filename}`);
        
        // Download PDF
        const response = await axios.get(pdfUrl, {
            responseType: 'arraybuffer',
            timeout: 30000 // 30 second timeout
        });
        
        console.log(`[debug] [pdfScrapperNCLTCauseList] PDF downloaded successfully, size: ${response.data.length} bytes`);
        
        // Parse PDF to text
        const pdfData = await pdf(response.data);
        const pdfText = pdfData.text;
        
        console.log(`[debug] [pdfScrapperNCLTCauseList] PDF parsed to text, length: ${pdfText.length} characters`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] First 500 characters: ${pdfText.substring(0, 500)}`);
        
        // Check for NCLT indicators in the text
        const hasNCLT = pdfText.includes("NATIONAL COMPANY LAW TRIBUNAL") || pdfText.includes("NCLT");
        const hasAhmedabadBench = pdfText.includes("Ahmedabad Bench") || pdfText.includes("AHMEDABAD BENCH");
        const hasBenchCourt1 = pdfText.includes("Court-I") || pdfText.includes("COURT-I");
        const hasBenchCourt2 = pdfText.includes("Court-II") || pdfText.includes("COURT-II");
        
        console.log(`[debug] [pdfScrapperNCLTCauseList] NCLT indicators found:`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - NCLT: ${hasNCLT}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Ahmedabad Bench: ${hasAhmedabadBench}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Bench Court-I: ${hasBenchCourt1}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Bench Court-II: ${hasBenchCourt2}`);
        
        // Check for all possible bench patterns
        const benchPatterns = [
            /Ahmedabad Bench Court-I/gi,
            /Ahmedabad Bench Court-II/gi,
            /COURT-I/gi,
            /COURT-II/gi,
            /BENCH/gi
        ];
        
        const allBenchMatches = [];
        benchPatterns.forEach((pattern, index) => {
            const matches = [...pdfText.matchAll(pattern)];
            if (matches.length > 0) {
                console.log(`[debug] [pdfScrapperNCLTCauseList] Pattern ${index + 1} found ${matches.length} matches:`, matches.map(m => m[0]));
                allBenchMatches.push(...matches);
            }
        });
        
        // Show text around each bench header
        const benchHeaders = pdfText.match(/BENCH[^]*?(?=\n\n|\n[A-Z]|$)/gi);
        if (benchHeaders) {
            console.log(`[debug] [pdfScrapperNCLTCauseList] Found ${benchHeaders.length} bench sections:`);
            benchHeaders.forEach((header, index) => {
                console.log(`[debug] [pdfScrapperNCLTCauseList] Bench section ${index + 1}: ${header.substring(0, 300)}...`);
            });
        }
        
        // Check if text is large enough to trigger chunking
        const estimatedTokens = Math.ceil(pdfText.length / 4);
        console.log(`[debug] [pdfScrapperNCLTCauseList] Estimated tokens: ${estimatedTokens}, will use chunking: ${estimatedTokens > 100000}`);
        
        // Special debugging for NCLT Cause List
        console.log(`[debug] [pdfScrapperNCLTCauseList] NCLT CAUSE LIST DEBUGGING:`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Text length: ${pdfText.length} characters`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Estimated tokens: ${estimatedTokens}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Will use chunking: ${estimatedTokens > 100000}`);
        
        // Count bench references more specifically
        const benchCount = (pdfText.match(/Ahmedabad Bench Court-[I]+/gi) || []).length;
        const ncltCount = (pdfText.match(/NATIONAL COMPANY LAW TRIBUNAL/gi) || []).length;
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Bench references found: ${benchCount}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - NCLT references: ${ncltCount}`);
        
        // Show sample of text around bench headers
        const benchMatches = pdfText.match(/BENCH[^]*?(?=\n\n|\n[A-Z]|$)/gi);
        if (benchMatches && benchMatches.length > 0) {
            console.log(`[debug] [pdfScrapperNCLTCauseList] - Found ${benchMatches.length} bench sections in NCLT Cause List`);
            benchMatches.slice(0, 3).forEach((match, index) => {
                console.log(`[debug] [pdfScrapperNCLTCauseList] - Bench section ${index + 1}: ${match.substring(0, 200)}...`);
            });
        }
        
        // Use OpenAI to parse the text for NCLT
        console.log(`[debug] [pdfScrapperNCLTCauseList] Starting OpenAI parsing for NCLT...`);
        const parsedData = await parseNCLTCauseListWithOpenAI(pdfText);
        
        console.log(`[debug] [pdfScrapperNCLTCauseList] OpenAI parsing completed successfully`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] Final result summary:`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Benches found: ${parsedData.benches ? parsedData.benches.length : 0}`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Total cases: ${parsedData.benches ? parsedData.benches.reduce((total, bench) => total + bench.cases.length, 0) : 0}`);
        
        if (parsedData.benches) {
            parsedData.benches.forEach((bench, index) => {
                console.log(`[debug] [pdfScrapperNCLTCauseList] - Bench ${index + 1}: ${bench.benchName} (${bench.benchNumber}) - ${bench.cases.length} cases`);
            });
        }
        
        // Result analysis for NCLT
        console.log(`[debug] [pdfScrapperNCLTCauseList] NCLT CAUSE LIST RESULT ANALYSIS:`);
        console.log(`[debug] [pdfScrapperNCLTCauseList] - Expected: Multiple benches, Got: ${parsedData.benches ? parsedData.benches.length : 0} benches`);
        
        if (parsedData.benches && parsedData.benches.length === 0) {
            console.log(`[warning] [pdfScrapperNCLTCauseList] NCLT CAUSE LIST ISSUE: No benches found!`);
            console.log(`[warning] [pdfScrapperNCLTCauseList] This suggests either:`);
            console.log(`[warning] [pdfScrapperNCLTCauseList] 1. The PDF contains no cause list data`);
            console.log(`[warning] [pdfScrapperNCLTCauseList] 2. The format is different from expected`);
            console.log(`[warning] [pdfScrapperNCLTCauseList] 3. OpenAI is not parsing NCLT format correctly`);
        } else if (parsedData.benches && parsedData.benches.length >= 1) {
            console.log(`[success] [pdfScrapperNCLTCauseList] NCLT CAUSE LIST SUCCESS: Found ${parsedData.benches.length} benches - parsing working correctly!`);
        }
        
        return parsedData;
        
    } catch (error) {
        console.error(`[error] [pdfScrapperNCLTCauseList] Failed to process NCLT PDF:`, error);
        throw error;
    }
}

module.exports = {
    pdfScrapperNCLTCauseList
};
