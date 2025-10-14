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
 * Parse PDF text using OpenAI to extract structured case data
 * @param {string} pdfText - Raw text extracted from PDF
 * @returns {Object} Parsed cause list data
 */
async function parseCauseListWithOpenAI(pdfText) {
    try {
        console.log('[debug] [parseCauseListWithOpenAI] Starting OpenAI parsing...');
        
        const estimatedTokens = estimateTokenCount(pdfText);
        console.log(`[debug] [parseCauseListWithOpenAI] Estimated tokens: ${estimatedTokens}`);
        
        // If text is too large, use chunking strategy
        if (estimatedTokens > 100000) { // 100k tokens threshold
            console.log('[debug] [parseCauseListWithOpenAI] Text too large, using chunking strategy');
            return await parseWithChunking(pdfText);
        }
        
        // Use single request for smaller texts
        return await parseSingleRequest(pdfText);
        
    } catch (error) {
        console.error('[error] [parseCauseListWithOpenAI] OpenAI parsing failed:', error);
        throw error;
    }
}

/**
 * Parse with single OpenAI request
 * @param {string} pdfText - PDF text to parse
 * @returns {Object} Parsed data
 */
async function parseSingleRequest(pdfText) {
    const prompt = `You are an expert at parsing Supreme Court cause list PDFs. Parse the following text and extract structured case data.

CRITICAL: You must respond with ONLY valid JSON. No explanations, no markdown formatting, no additional text.

IMPORTANT RULES:
1. Extract ALL cases with their serial numbers (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, etc.) - DO NOT MISS ANY CASES
2. Do NOT include connected cases (cases that say "Connected" or have decimal numbers like "1.1", "2.1")
3. Extract case numbers exactly as they appear (Diary No., SLP, MA, WP, W.P., CONMT.PET., ARBIT.PETITON, etc.)
4. Group cases by court (Chief Justice's Court, Court No. 1, Court No. 2, etc.)
5. Extract court date and other header information
6. Do NOT extract petitioner, respondent, advocate, or application information
7. ONLY extract serialNumber and caseNumber - NO applications field
8. Look for cases in ALL sections: FRESH, AFTER NOTICE, BAIL MATTERS, AD INTERIM STAY MATTERS, etc.
9. Count carefully - there should be many more than 11 cases in a typical cause list
10. CRITICAL: Identify courts consistently using these patterns:
    - "CHIEF JUSTICE'S COURT" → courtNumber: "1", courtName: "CHIEF JUSTICE'S COURT"
    - "COURT NO. : 2" → courtNumber: "2", courtName: "COURT NO. 2"
    - "COURT NO. : 3" → courtNumber: "3", courtName: "COURT NO. 3"
    - "COURT NO. : 4" → courtNumber: "4", courtName: "COURT NO. 4"
    - etc.

MOST CRITICAL: This is a MAIN CAUSE LIST that contains 15-20 courts. You MUST extract ALL courts, not just the first one. Look for:
- CHIEF JUSTICE'S COURT
- COURT NO. : 2, COURT NO. : 3, COURT NO. : 4, COURT NO. : 5, COURT NO. : 6, COURT NO. : 7, COURT NO. : 8, COURT NO. : 9, COURT NO. : 10, COURT NO. : 11, COURT NO. : 12, COURT NO. : 13, COURT NO. : 14, COURT NO. : 15, COURT NO. : 16, COURT NO. : 17, COURT NO. : 18
- Do NOT stop after extracting just one court - continue until you find ALL courts in the document

Return ONLY this exact JSON structure (no other text):
{
  "court": "SUPREME COURT OF INDIA",
  "date": "Date in DD-MM-YYYY format",
  "courts": [
    {
      "courtNumber": "1",
      "courtName": "CHIEF JUSTICE'S COURT",
      "cases": [
        {
          "serialNumber": "Serial number as string",
          "caseNumber": "Complete case number"
        }
      ]
    },
    {
      "courtNumber": "2", 
      "courtName": "COURT NO. 2",
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
    if (!result || !result.courts || result.courts.length === 0) {
        console.log('[debug] [parseSingleRequest] First attempt failed, trying simplified prompt');
    } else if (result.courts && result.courts.length < 5) {
        console.log(`[debug] [parseSingleRequest] First attempt only found ${result.courts.length} courts, trying simplified prompt for more courts`);
    }
    
    // If we have less than 5 courts, try the simplified prompt
    if (!result || !result.courts || result.courts.length < 5) {
        
        const simplifiedPrompt = `Extract case data from this Supreme Court cause list. Return ONLY valid JSON in this exact format:

{
  "court": "SUPREME COURT OF INDIA",
  "date": "04-09-2025",
  "courts": [
    {
      "courtNumber": "1",
      "courtName": "CHIEF JUSTICE'S COURT",
      "cases": [
        {
          "serialNumber": "1",
          "caseNumber": "Diary No. 11981-2025"
        }
      ]
    },
    {
      "courtNumber": "2",
      "courtName": "COURT NO. 2",
      "cases": [
        {
          "serialNumber": "26",
          "caseNumber": "SLP(C) No. 24823/2025"
        }
      ]
    },
    {
      "courtNumber": "3",
      "courtName": "COURT NO. 3",
      "cases": [
        {
          "serialNumber": "48",
          "caseNumber": "Diary No. 18533-2025"
        }
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
- This is a MAIN CAUSE LIST that should have 15-20 courts
- Look for ALL courts: COURT NO. : 1, COURT NO. : 2, COURT NO. : 3, COURT NO. : 4, etc.
- Extract ALL cases from EACH court
- Only extract serialNumber and caseNumber
- Identify courts consistently: "CHIEF JUSTICE'S COURT" = courtNumber "1", "COURT NO. : 2" = courtNumber "2", etc.
- The response must include ALL courts found in the document

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
                max_tokens: 6000 // Reduced to 6000 for faster processing, will use chunking for large docs
            });
            
            console.log('[debug] [parseSingleRequest] Retry response received');
            const retryContent = retryResponse.choices[0].message.content;
            console.log('[debug] [parseSingleRequest] Retry response length:', retryContent.length);
            console.log('[debug] [parseSingleRequest] Retry response preview:', retryContent.substring(0, 500));
            console.log('[debug] [parseSingleRequest] Retry response ending:', retryContent.substring(Math.max(0, retryContent.length - 500)));
            console.log('[debug] [parseSingleRequest] Full retry response:', retryContent);
            result = parseOpenAIResponse(retryContent);
        } catch (retryError) {
            console.error('[error] [parseSingleRequest] Retry also failed:', retryError.message);
        }
    }
    
    // If still not enough courts, try chunking approach for large documents
    if (result && result.courts && result.courts.length < 5) {
        console.log(`[debug] [parseSingleRequest] Still only ${result.courts.length} courts, trying chunking approach`);
        const estimatedTokens = estimateTokenCount(pdfText);
        if (estimatedTokens > 50000) { // Use chunking for large documents
            console.log('[debug] [parseSingleRequest] Document is large enough for chunking, switching to chunked approach');
            return await parseWithChunking(pdfText);
        }
    }
    
    // For Main Cause Lists with high token count, use chunking immediately to avoid timeout
    const estimatedTokens = estimateTokenCount(pdfText);
    if (estimatedTokens > 60000) { // Large documents - use chunking immediately to prevent timeout
        console.log(`[debug] [parseSingleRequest] Document is large (${estimatedTokens} tokens), using chunking to avoid timeout`);
        return await parseWithChunking(pdfText);
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
    
    const allCourts = [];
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
                courtsCount: chunkResult.courts ? chunkResult.courts.length : 0,
                totalCases: chunkResult.courts ? chunkResult.courts.reduce((total, court) => total + court.cases.length, 0) : 0
            });
            
            // Log courts found in this chunk
            if (chunkResult.courts && Array.isArray(chunkResult.courts)) {
                chunkResult.courts.forEach((court, courtIndex) => {
                    console.log(`[debug] [parseWithChunking] Chunk ${i + 1} Court ${courtIndex + 1}: ${court.courtName} (${court.courtNumber}) - ${court.cases.length} cases`);
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
            
            // Merge courts from this chunk
            if (chunkResult.courts && Array.isArray(chunkResult.courts)) {
                allCourts.push(...chunkResult.courts);
            }
        }
    }
    
    // Merge duplicate courts
    console.log(`[debug] [parseWithChunking] Before merging: ${allCourts.length} courts from all chunks`);
    const mergedCourts = mergeCourts(allCourts);
    console.log(`[debug] [parseWithChunking] After merging: ${mergedCourts.length} unique courts`);
    
    const result = {
        court: globalCourt || "SUPREME COURT OF INDIA",
        date: globalDate,
        courts: mergedCourts
    };
    
    // Log summary
    const totalCases = result.courts.reduce((total, court) => total + court.cases.length, 0);
    console.log(`[debug] [parseWithChunking] Successfully parsed ${result.courts.length} courts with ${totalCases} total cases`);
    
    // Detailed court breakdown
    result.courts.forEach((court, index) => {
        console.log(`[debug] [parseWithChunking] Final Court ${index + 1}: ${court.courtName} (${court.courtNumber}) - ${court.cases.length} cases`);
    });
    
    return result;
}

/**
 * Merge courts with same court number
 * @param {Array} courts - Array of court objects
 * @returns {Array} Merged courts
 */
function mergeCourts(courts) {
    console.log('[debug] [mergeCourts] Starting merge with', courts.length, 'courts');
    
    const courtMap = new Map();
    
    courts.forEach((court, index) => {
        console.log(`[debug] [mergeCourts] Processing court ${index + 1}:`, {
            courtNumber: court.courtNumber,
            courtName: court.courtName,
            casesCount: court.cases ? court.cases.length : 0
        });
        
        // Normalize court identification
        let key;
        if (court.courtNumber) {
            key = court.courtNumber.toString();
        } else if (court.courtName) {
            // Extract court number from court name if available
            const courtNumberMatch = court.courtName.match(/COURT NO\.?\s*:?\s*(\d+)/i);
            if (courtNumberMatch) {
                key = courtNumberMatch[1];
            } else if (court.courtName.includes("CHIEF JUSTICE")) {
                key = "1";
            } else {
                key = court.courtName;
            }
        } else {
            key = `unknown_${index}`;
        }
        
        console.log(`[debug] [mergeCourts] Using key: "${key}" for court:`, court.courtName);
        
        if (courtMap.has(key)) {
            // Merge cases
            const existingCourt = courtMap.get(key);
            console.log(`[debug] [mergeCourts] Merging ${court.cases.length} cases into existing court with ${existingCourt.cases.length} cases`);
            existingCourt.cases.push(...court.cases);
        } else {
            console.log(`[debug] [mergeCourts] Adding new court with key: "${key}"`);
            courtMap.set(key, { ...court });
        }
    });
    
    const mergedCourts = Array.from(courtMap.values());
    console.log(`[debug] [mergeCourts] Merge complete: ${mergedCourts.length} unique courts`);
    
    // Log summary of merged courts
    mergedCourts.forEach((court, index) => {
        console.log(`[debug] [mergeCourts] Final court ${index + 1}: ${court.courtName} (${court.courtNumber}) - ${court.cases.length} cases`);
    });
    
    return mergedCourts;
}

/**
 * Parse OpenAI response and extract JSON
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
            console.log('[debug] [parseOpenAIResponse] JSON match preview:', jsonMatch[0].substring(0, 200));
            console.log('[debug] [parseOpenAIResponse] JSON match ending:', jsonMatch[0].substring(Math.max(0, jsonMatch[0].length - 200)));
            parsedData = JSON.parse(jsonMatch[0]);
        } else {
            console.log('[debug] [parseOpenAIResponse] No JSON match found, trying direct parse');
            parsedData = JSON.parse(cleanedContent);
        }
    } catch (parseError) {
        console.error('[error] [parseOpenAIResponse] Failed to parse OpenAI response as JSON:', parseError);
        console.error('[error] [parseOpenAIResponse] Raw response (first 1000 chars):', parsedContent.substring(0, 1000));
        console.error('[error] [parseOpenAIResponse] Raw response (last 1000 chars):', parsedContent.substring(Math.max(0, parsedContent.length - 1000)));
        
        // Try to fix incomplete JSON by adding missing closing braces
        console.log('[debug] [parseOpenAIResponse] Attempting to fix incomplete JSON...');
        let fixedJson = cleanedContent;
        
        // Count opening and closing braces
        const openBraces = (fixedJson.match(/\{/g) || []).length;
        const closeBraces = (fixedJson.match(/\}/g) || []).length;
        console.log('[debug] [parseOpenAIResponse] Brace count - Open:', openBraces, 'Close:', closeBraces);
        
        // Add missing closing braces
        if (openBraces > closeBraces) {
            const missingBraces = openBraces - closeBraces;
            console.log('[debug] [parseOpenAIResponse] Adding', missingBraces, 'missing closing braces');
            fixedJson += '}'.repeat(missingBraces);
        }
        
        // Try parsing the fixed JSON
        try {
            parsedData = JSON.parse(fixedJson);
            console.log('[debug] [parseOpenAIResponse] Successfully parsed fixed JSON');
        } catch (fixError) {
            console.error('[error] [parseOpenAIResponse] Fixed JSON also failed:', fixError.message);
        }
        
        // Try to extract any JSON-like content
        const jsonCandidates = parsedContent.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (jsonCandidates && jsonCandidates.length > 0) {
            console.log('[debug] [parseOpenAIResponse] Found JSON candidates:', jsonCandidates.length);
            for (let i = 0; i < jsonCandidates.length; i++) {
                try {
                    const candidate = JSON.parse(jsonCandidates[i]);
                    console.log('[debug] [parseOpenAIResponse] Successfully parsed candidate', i);
                    parsedData = candidate;
                    break;
                } catch (e) {
                    console.log('[debug] [parseOpenAIResponse] Candidate', i, 'failed:', e.message);
                }
            }
        }
        
        // If still no valid JSON, try to extract case objects and build structure
        if (!parsedData) {
            console.log('[debug] [parseOpenAIResponse] Attempting to extract case objects from text');
            const caseMatches = parsedContent.match(/"serialNumber":\s*"[^"]*"[^}]*}/g);
            if (caseMatches && caseMatches.length > 0) {
                console.log('[debug] [parseOpenAIResponse] Found', caseMatches.length, 'case objects');
                const cases = [];
                for (const caseMatch of caseMatches) {
                    try {
                        const caseObj = JSON.parse(caseMatch);
                        cases.push(caseObj);
                    } catch (e) {
                        console.log('[debug] [parseOpenAIResponse] Failed to parse case:', e.message);
                    }
                }
                
                if (cases.length > 0) {
                    parsedData = {
                        court: "SUPREME COURT OF INDIA",
                        date: new Date().toLocaleDateString('en-GB'),
                        courts: [{
                            courtNumber: "1",
                            courtName: "CHIEF JUSTICE'S COURT",
                            cases: cases
                        }]
                    };
                    console.log('[debug] [parseOpenAIResponse] Built structure from', cases.length, 'cases');
                }
            }
        }
        
        if (!parsedData) {
            console.error('[error] [parseOpenAIResponse] All JSON parsing attempts failed');
            console.error('[error] [parseOpenAIResponse] Creating fallback response');
            
            // Create a minimal fallback response
            parsedData = {
                court: "SUPREME COURT OF INDIA",
                date: new Date().toLocaleDateString('en-GB'), // DD/MM/YYYY format
                courts: [{
                    courtNumber: "1",
                    courtName: "CHIEF JUSTICE'S COURT",
                    cases: []
                }]
            };
            
            console.log('[debug] [parseOpenAIResponse] Created fallback response');
        }
    }

    // Validate the parsed data structure
    if (!parsedData.courts || !Array.isArray(parsedData.courts)) {
        console.error('[error] [parseOpenAIResponse] Invalid data structure - missing courts array');
        console.error('[error] [parseOpenAIResponse] Parsed data keys:', Object.keys(parsedData));
        console.error('[error] [parseOpenAIResponse] Parsed data:', JSON.stringify(parsedData, null, 2));
        
        // Try to fix the structure if it has cases but no courts array
        if (parsedData.cases && Array.isArray(parsedData.cases)) {
            console.log('[debug] [parseOpenAIResponse] Attempting to fix structure - found cases array');
            parsedData = {
                court: parsedData.court || "SUPREME COURT OF INDIA",
                date: parsedData.date || new Date().toLocaleDateString('en-GB'),
                courts: [{
                    courtNumber: "1",
                    courtName: "CHIEF JUSTICE'S COURT",
                    cases: parsedData.cases
                }]
            };
            console.log('[debug] [parseOpenAIResponse] Fixed structure created');
        } else {
            throw new Error('Invalid data structure from OpenAI');
        }
    }

    // Post-process to remove applications and ensure only serialNumber and caseNumber
    parsedData.courts.forEach(court => {
        court.cases.forEach(case_ => {
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
    const totalCases = parsedData.courts.reduce((total, court) => total + court.cases.length, 0);
    console.log(`[debug] [parseOpenAIResponse] Successfully parsed ${parsedData.courts.length} courts with ${totalCases} total cases`);
    
    // Log all cases found
    parsedData.courts.forEach((court, courtIndex) => {
        console.log(`[debug] [parseOpenAIResponse] Court ${court.courtNumber} (${court.courtName}) has ${court.cases.length} cases:`);
        court.cases.slice(0, 5).forEach(case_ => {
            console.log(`[debug] [parseOpenAIResponse] - Case ${case_.serialNumber}: ${case_.caseNumber}`);
        });
        if (court.cases.length > 5) {
            console.log(`[debug] [parseOpenAIResponse] - ... and ${court.cases.length - 5} more cases`);
        }
    });
    
    // Check if we're missing courts (Main Cause List should have 18 courts)
    if (parsedData.courts.length < 5) {
        console.log(`[warning] [parseOpenAIResponse] Only found ${parsedData.courts.length} courts. Main Cause List should have ~18 courts.`);
        console.log(`[warning] [parseOpenAIResponse] This might indicate a parsing issue or the PDF only contains Chief Justice's Court.`);
    }

    return parsedData;
}

module.exports = {
    parseCauseListWithOpenAI
};
