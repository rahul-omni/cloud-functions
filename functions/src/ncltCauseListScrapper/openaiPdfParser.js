const OpenAI = require('openai');
const functions = require('firebase-functions');

// Initialize OpenAI with API key from Firebase Functions config
const openai = new OpenAI({
    apiKey: functions.config().environment?.openai_pdf_parser_key || process.env.OPENAI_API_KEY
});

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks for processing
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum chunk size in characters
 * @returns {Array} Array of text chunks
 */
function splitTextIntoChunks(text, maxChunkSize = 30000) { // ~8k tokens per chunk for much faster processing
    const lines = text.split('\n');
    const chunks = [];
    let currentChunk = '';
    
    for (const line of lines) {
        if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

/**
 * Parse PDF text using OpenAI to extract structured NCLT case data
 * @param {string} pdfText - Raw text extracted from PDF
 * @returns {Object} Parsed cause list data
 */
async function parseNCLTCauseListWithOpenAI(pdfText) {
    try {
        console.log('[debug] [parseNCLTCauseListWithOpenAI] Starting OpenAI parsing...');
        
        const estimatedTokens = estimateTokenCount(pdfText);
        console.log(`[debug] [parseNCLTCauseListWithOpenAI] Estimated tokens: ${estimatedTokens}`);
        
        // If text is too large, use chunking strategy
        if (estimatedTokens > 100000) { // 100k tokens threshold
            console.log('[debug] [parseNCLTCauseListWithOpenAI] Text too large, using chunking strategy');
            return await parseWithChunking(pdfText);
        }
        
        // Use single request for smaller texts
        return await parseSingleRequest(pdfText);
        
    } catch (error) {
        console.error('[error] [parseNCLTCauseListWithOpenAI] OpenAI parsing failed:', error);
        throw error;
    }
}

/**
 * Parse with single OpenAI request for NCLT data
 * @param {string} pdfText - PDF text to parse
 * @returns {Object} Parsed data
 */
async function parseSingleRequest(pdfText) {
    const prompt = `You are an expert at parsing NCLT (National Company Law Tribunal) cause list PDFs. Parse the following text and extract structured case data.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no markdown formatting, no additional text.

IMPORTANT RULES FOR NCLT:
1. Extract ALL cases with their serial numbers (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, etc.) - DO NOT MISS ANY CASES
2. Extract case numbers exactly as they appear (CP, MA, IA, IB, NCLT, etc.)
3. Group cases by NCLT bench (Ahmedabad Bench Court-I, Ahmedabad Bench Court-II, etc.)
4. Extract court date and other header information
5. Do NOT extract petitioner, respondent, advocate, or application information
6. ONLY extract serialNumber and caseNumber - NO applications field
7. Look for cases in different sections and categories
8. Count carefully - extract all listed cases
9. CRITICAL: Identify benches consistently using these patterns:
    - "Ahmedabad Bench Court-I" → benchNumber: "1", benchName: "Ahmedabad Bench Court-I"
    - "Ahmedabad Bench Court-II" → benchNumber: "2", benchName: "Ahmedabad Bench Court-II"
    - etc.

NCLT SPECIFIC: This is an NCLT CAUSE LIST that may contain multiple benches and case types. You MUST extract ALL benches and cases.

Return ONLY this exact JSON structure (no other text):
{
  "court": "NATIONAL COMPANY LAW TRIBUNAL",
  "date": "Date in DD-MM-YYYY format",
  "benches": [
    {
      "benchNumber": "1",
      "benchName": "Ahmedabad Bench Court-I",
      "cases": [
        {
          "serialNumber": "Serial number as string",
          "caseNumber": "Complete case number"
        }
      ]
    },
    {
      "benchNumber": "2", 
      "benchName": "Ahmedabad Bench Court-II",
      "cases": [
        {
          "serialNumber": "Serial number as string",
          "caseNumber": "Complete case number"
        }
      ]
    }
  ]
}

PDF TEXT TO PARSE:
${pdfText}`;

    let response;
    try {
        response = await openai.chat.completions.create({
            model: "gpt-4.1-mini", // Use mini for higher token limit (128k vs 30k)
            messages: [
                {
                    role: "system",
                    content: "You are an expert at parsing legal documents and extracting structured data. You must respond with ONLY valid JSON. No explanations, no markdown, no additional text. The JSON must be complete and properly formatted."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 8000 // Reduced to 8000 for faster processing, will use chunking for large docs
        });
    } catch (error) {
        console.error('[error] [parseSingleRequest] GPT-4o-mini failed, trying gpt-3.5-turbo:', error.message);
        
        // Fallback to gpt-3.5-turbo if gpt-4o-mini fails
        response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are an expert at parsing legal documents and extracting structured data. You must respond with ONLY valid JSON. No explanations, no markdown, no additional text. The JSON must be complete and properly formatted."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 6000 // Reduced to 6000 for faster processing, will use chunking for large docs
        });
    }

    const parsedContent = response.choices[0].message.content;
    console.log('[debug] [parseSingleRequest] OpenAI response received');
    console.log('[debug] [parseSingleRequest] Response length:', parsedContent.length);
    console.log('[debug] [parseSingleRequest] Response preview:', parsedContent.substring(0, 500));
    console.log('[debug] [parseSingleRequest] Response ending:', parsedContent.substring(Math.max(0, parsedContent.length - 500)));
    console.log('[debug] [parseSingleRequest] Full response length:', parsedContent.length);
    console.log('[debug] [parseSingleRequest] Full response:', parsedContent);
    
    let result = parseOpenAIResponse(parsedContent);
    
    // If parsing failed, try with a simplified prompt
    if (!result || !result.benches || result.benches.length === 0) {
        console.log('[debug] [parseSingleRequest] First attempt failed, trying simplified prompt');
        
        const simplifiedPrompt = `Extract case data from this NCLT cause list. Return ONLY valid JSON in this exact format:

{
  "court": "NATIONAL COMPANY LAW TRIBUNAL",
  "date": "17-09-2025",
  "benches": [
    {
      "benchNumber": "1",
      "benchName": "Ahmedabad Bench Court-I",
      "cases": [
        {
          "serialNumber": "1",
          "caseNumber": "CP(IB) No. 123/2025"
        }
      ]
    },
    {
      "benchNumber": "2",
      "benchName": "Ahmedabad Bench Court-II",
      "cases": [
        {
          "serialNumber": "1",
          "caseNumber": "MA No. 456/2025"
        }
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
- Extract ALL benches from the NCLT cause list
- Extract ALL cases from EACH bench
- Only extract serialNumber and caseNumber
- The response must include ALL benches found in the document

Text: ${pdfText.substring(0, 50000)}`; // Limit text size for retry
        
        try {
            const retryResponse = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Return ONLY valid JSON. No other text."
                    },
                    {
                        role: "user",
                        content: simplifiedPrompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 6000
            });
            
            console.log('[debug] [parseSingleRequest] Retry response received');
            const retryContent = retryResponse.choices[0].message.content;
            console.log('[debug] [parseSingleRequest] Retry response length:', retryContent.length);
            console.log('[debug] [parseSingleRequest] Retry response preview:', retryContent.substring(0, 500));
            console.log('[debug] [parseSingleRequest] Full retry response:', retryContent);
            result = parseOpenAIResponse(retryContent);
        } catch (retryError) {
            console.error('[error] [parseSingleRequest] Retry also failed:', retryError.message);
        }
    }
    
    // If still no benches, try chunking approach for large documents
    if (result && result.benches && result.benches.length === 0) {
        console.log(`[debug] [parseSingleRequest] Still no benches found, trying chunking approach`);
        const estimatedTokens = estimateTokenCount(pdfText);
        if (estimatedTokens > 50000) { // Use chunking for large documents
            console.log('[debug] [parseSingleRequest] Document is large enough for chunking, switching to chunked approach');
            return await parseWithChunking(pdfText);
        }
    }
    
    return result;
}

/**
 * Parse with chunking strategy for very large PDFs
 * @param {string} pdfText - PDF text to parse
 * @returns {Object} Parsed data
 */
async function parseWithChunking(pdfText) {
    console.log('[debug] [parseWithChunking] Starting chunked parsing...');
    
    const chunks = splitTextIntoChunks(pdfText);
    console.log(`[debug] [parseWithChunking] Split into ${chunks.length} chunks`);
    
    const allBenches = [];
    let globalCourt = null;
    let globalDate = null;
    
    // Process chunks in parallel for faster execution
    const chunkPromises = chunks.map(async (chunk, i) => {
        console.log(`[debug] [parseWithChunking] Processing chunk ${i + 1}/${chunks.length}`);
        console.log(`[debug] [parseWithChunking] Chunk ${i + 1} length: ${chunk.length} characters`);
        console.log(`[debug] [parseWithChunking] Chunk ${i + 1} preview: ${chunk.substring(0, 200)}...`);
        
        try {
            const chunkResult = await parseSingleRequest(chunk);
            
            console.log(`[debug] [parseWithChunking] Chunk ${i + 1} result:`, {
                court: chunkResult.court,
                date: chunkResult.date,
                benchesCount: chunkResult.benches ? chunkResult.benches.length : 0,
                totalCases: chunkResult.benches ? chunkResult.benches.reduce((total, bench) => total + bench.cases.length, 0) : 0
            });
            
            // Log benches found in this chunk
            if (chunkResult.benches && Array.isArray(chunkResult.benches)) {
                chunkResult.benches.forEach((bench, benchIndex) => {
                    console.log(`[debug] [parseWithChunking] Chunk ${i + 1} Bench ${benchIndex + 1}: ${bench.benchName} (${bench.benchNumber}) - ${bench.cases.length} cases`);
                });
            }
            
            return { chunkResult, chunkIndex: i };
            
        } catch (error) {
            console.error(`[error] [parseWithChunking] Failed to process chunk ${i + 1}:`, error);
            return { chunkResult: null, chunkIndex: i };
        }
    });
    
    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    
    // Process results
    for (const { chunkResult, chunkIndex } of chunkResults) {
        if (chunkResult) {
            // Extract global info from first successful chunk
            if (chunkIndex === 0) {
                globalCourt = chunkResult.court;
                globalDate = chunkResult.date;
            }
            
            // Merge benches from this chunk
            if (chunkResult.benches && Array.isArray(chunkResult.benches)) {
                allBenches.push(...chunkResult.benches);
            }
        }
    }
    
    // Merge duplicate benches
    console.log(`[debug] [parseWithChunking] Before merging: ${allBenches.length} benches from all chunks`);
    const mergedBenches = mergeBenches(allBenches);
    console.log(`[debug] [parseWithChunking] After merging: ${mergedBenches.length} unique benches`);
    
    const result = {
        court: globalCourt || "NATIONAL COMPANY LAW TRIBUNAL",
        date: globalDate,
        benches: mergedBenches
    };
    
    // Log summary
    const totalCases = result.benches.reduce((total, bench) => total + bench.cases.length, 0);
    console.log(`[debug] [parseWithChunking] Successfully parsed ${result.benches.length} benches with ${totalCases} total cases`);
    
    // Detailed bench breakdown
    result.benches.forEach((bench, index) => {
        console.log(`[debug] [parseWithChunking] Final Bench ${index + 1}: ${bench.benchName} (${bench.benchNumber}) - ${bench.cases.length} cases`);
    });
    
    return result;
}

/**
 * Merge benches with same bench number
 * @param {Array} benches - Array of bench objects
 * @returns {Array} Merged benches
 */
function mergeBenches(benches) {
    console.log('[debug] [mergeBenches] Starting merge with', benches.length, 'benches');
    
    const benchMap = new Map();
    
    benches.forEach((bench, index) => {
        console.log(`[debug] [mergeBenches] Processing bench ${index + 1}:`, {
            benchNumber: bench.benchNumber,
            benchName: bench.benchName,
            casesCount: bench.cases ? bench.cases.length : 0
        });
        
        // Normalize bench identification
        let key;
        if (bench.benchNumber) {
            key = bench.benchNumber.toString();
        } else if (bench.benchName) {
            // Extract bench identifier from bench name
            key = bench.benchName;
        } else {
            key = `unknown_${index}`;
        }
        
        console.log(`[debug] [mergeBenches] Using key: "${key}" for bench:`, bench.benchName);
        
        if (benchMap.has(key)) {
            // Merge cases
            const existingBench = benchMap.get(key);
            console.log(`[debug] [mergeBenches] Merging ${bench.cases.length} cases into existing bench with ${existingBench.cases.length} cases`);
            existingBench.cases.push(...bench.cases);
        } else {
            console.log(`[debug] [mergeBenches] Adding new bench with key: "${key}"`);
            benchMap.set(key, { ...bench });
        }
    });
    
    const mergedBenches = Array.from(benchMap.values());
    console.log(`[debug] [mergeBenches] Merge complete: ${mergedBenches.length} unique benches`);
    
    // Log summary of merged benches
    mergedBenches.forEach((bench, index) => {
        console.log(`[debug] [mergeBenches] Final bench ${index + 1}: ${bench.benchName} (${bench.benchNumber}) - ${bench.cases.length} cases`);
    });
    
    return mergedBenches;
}

/**
 * Parse OpenAI response and extract JSON for NCLT
 * @param {string} content - OpenAI response content
 * @returns {Object} Parsed data
 */
function parseOpenAIResponse(parsedContent) {
    console.log('[debug] [parseOpenAIResponse] Raw OpenAI response length:', parsedContent.length);
    console.log('[debug] [parseOpenAIResponse] First 500 chars:', parsedContent.substring(0, 500));
    console.log('[debug] [parseOpenAIResponse] Last 500 chars:', parsedContent.substring(Math.max(0, parsedContent.length - 500)));
    
    // Clean the response - remove markdown formatting and extra text
    let cleanedContent = parsedContent.trim();
    
    // Remove markdown code blocks
    cleanedContent = cleanedContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remove any text before the first {
    const firstBraceIndex = cleanedContent.indexOf('{');
    if (firstBraceIndex > 0) {
        cleanedContent = cleanedContent.substring(firstBraceIndex);
    }
    
    // Remove any text after the last }
    const lastBraceIndex = cleanedContent.lastIndexOf('}');
    if (lastBraceIndex > 0 && lastBraceIndex < cleanedContent.length - 1) {
        cleanedContent = cleanedContent.substring(0, lastBraceIndex + 1);
    }
    
    console.log('[debug] [parseOpenAIResponse] Cleaned content length:', cleanedContent.length);
    console.log('[debug] [parseOpenAIResponse] Cleaned first 200 chars:', cleanedContent.substring(0, 200));
    
    // Parse the JSON response
    let parsedData;
    try {
        // Try to find JSON object in the response
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            console.log('[debug] [parseOpenAIResponse] Found JSON match, length:', jsonMatch[0].length);
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            console.log('[debug] [parseOpenAIResponse] No JSON match found, trying direct parse');
            parsedData = JSON.parse(cleanedContent);
        }
    } catch (parseError) {
        console.error('[error] [parseOpenAIResponse] Failed to parse OpenAI response as JSON:', parseError);
        console.error('[error] [parseOpenAIResponse] Raw response (first 1000 chars):', parsedContent.substring(0, 1000));
        
        // Create a minimal fallback response for NCLT
        parsedData = {
            court: "NATIONAL COMPANY LAW TRIBUNAL",
            date: new Date().toLocaleDateString('en-GB'), // DD/MM/YYYY format
            benches: [{
                benchNumber: "1",
                benchName: "Ahmedabad Bench Court-I",
                cases: []
            }]
        };
        
        console.log('[debug] [parseOpenAIResponse] Created fallback response');
    }

    // Validate the parsed data structure for NCLT
    if (!parsedData.benches || !Array.isArray(parsedData.benches)) {
        console.error('[error] [parseOpenAIResponse] Invalid data structure - missing benches array');
        console.error('[error] [parseOpenAIResponse] Parsed data keys:', Object.keys(parsedData));
        
        // Try to fix the structure if it has cases but no benches array
        if (parsedData.cases && Array.isArray(parsedData.cases)) {
            console.log('[debug] [parseOpenAIResponse] Attempting to fix structure - found cases array');
            parsedData = {
                court: parsedData.court || "NATIONAL COMPANY LAW TRIBUNAL",
                date: parsedData.date || new Date().toLocaleDateString('en-GB'),
                benches: [{
                    benchNumber: "1",
                    benchName: "Ahmedabad Bench Court-I",
                    cases: parsedData.cases
                }]
            };
            console.log('[debug] [parseOpenAIResponse] Fixed structure created');
        } else {
            throw new Error('Invalid data structure from OpenAI');
        }
    }

    // Post-process to remove applications and ensure only serialNumber and caseNumber
    parsedData.benches.forEach(bench => {
        bench.cases.forEach(case_ => {
            // Remove applications field if it exists
            if (case_.applications) {
                delete case_.applications;
            }
            // Remove any other unwanted fields
            const allowedFields = ['serialNumber', 'caseNumber'];
            Object.keys(case_).forEach(key => {
                if (!allowedFields.includes(key)) {
                    delete case_[key];
                }
            });
        });
    });

    // Log summary
    const totalCases = parsedData.benches.reduce((total, bench) => total + bench.cases.length, 0);
    console.log(`[debug] [parseOpenAIResponse] Successfully parsed ${parsedData.benches.length} benches with ${totalCases} total cases`);
    
    // Log all cases found
    parsedData.benches.forEach((bench, benchIndex) => {
        console.log(`[debug] [parseOpenAIResponse] Bench ${bench.benchNumber} (${bench.benchName}) has ${bench.cases.length} cases:`);
        bench.cases.slice(0, 5).forEach(case_ => {
            console.log(`[debug] [parseOpenAIResponse] - Case ${case_.serialNumber}: ${case_.caseNumber}`);
        });
        if (bench.cases.length > 5) {
            console.log(`[debug] [parseOpenAIResponse] - ... and ${bench.cases.length - 5} more cases`);
        }
    });

    return parsedData;
}

module.exports = {
    parseNCLTCauseListWithOpenAI
};
