const OpenAI = require('openai');
const { getOpenAiKeyFromSecretManager } = require('../config/getOpenAiKeyFromSecretManager');

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
function splitTextIntoChunks(text, maxChunkSize = 18000) {
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
 * Build extraction prompt — ONLY S.No + Case No. column (no parties, no IA lines).
 * @param {string} pdfText
 */
function buildCauseListExtractionPrompt(pdfText) {
    return `You extract ONLY the **Cause List table** rows from Supreme Court Daily / Supplementary Cause List PDF text.

CRITICAL: Respond with ONLY valid JSON. No markdown fences, no commentary.

WHAT TO EXTRACT (first two logical columns only):
- serialNumber: The list serial / S.No. (digits, or as printed before the case-type token). Examples: "1", "17", "301" — if the PDF glues serial to the case line like "17W.P.(C)", still put "17" in serialNumber and the full case line fragment in caseNumber as needed.
- caseNumber: The **full case identifier** exactly as in the PDF: e.g. "Diary No. 47853-2024", "T.P.(C) No. 1711/2024", "T.P.(Crl.) No. 719/2023", "SLP(Crl) No. 146/2025", "W.P.(C) No. 1252/2023", "C.A. No. 4585/2022", "IA No. ..." is NOT a main case row — do NOT use IA-only lines as caseNumber.

STRICTLY OMIT:
- "Connected" matters and decimal serials (e.g. "12.1", "13.2 Connected")
- Petitioner / Respondent / party names, "Versus", advocate names
- Any line that is ONLY "IA No. ..." (applications) — not a listed main case row
- Headers, footers, "NEW DELHI", page stamps

COURT GROUPING (in order of appearance):
- "CHIEF JUSTICE'S COURT" → courtNumber "1", courtName "CHIEF JUSTICE'S COURT"
- "COURT NO. : N" or "COURT NO. N" → courtNumber "N", courtName "COURT NO. N"
- "SUPPLEMENTARY LIST" is a label; assign following cases to the **next** court header that appears (same rules).

Extract cases from ALL sections (MISCELLANEOUS HEARING, BAIL MATTERS, FRESH, AFTER NOTICE, etc.). Do not stop after one court.

DATE: Use "DAILY CAUSE LIST FOR DATED : DD-MM-YYYY" from the text if present; else "".

Return ONLY this JSON shape:
{
  "court": "SUPREME COURT OF INDIA",
  "date": "DD-MM-YYYY or empty string",
  "courts": [
    {
      "courtNumber": "1",
      "courtName": "CHIEF JUSTICE'S COURT",
      "cases": [ { "serialNumber": "1", "caseNumber": "T.P.(Crl.) No. 719/2023" } ]
    }
  ]
}

PDF TEXT:
${pdfText}`;
}

/**
 * Single LLM pass for one chunk — never recurses into chunking (used by parseWithChunking).
 */
async function parseChunkOnly(pdfText, openai) {
    const prompt = buildCauseListExtractionPrompt(pdfText);
    let response;
    try {
        response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You extract cause-list rows as JSON only. No markdown. No parties or IA-only lines. serialNumber + caseNumber per non-connected matter.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.05,
            max_tokens: 16384,
        });
    } catch (e) {
        console.error("[error] [parseChunkOnly] gpt-4.1-mini failed:", e.message);
        response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "Return ONLY valid JSON. No other text." },
                { role: "user", content: prompt },
            ],
            temperature: 0.05,
            max_tokens: 4096,
        });
    }
    const parsedContent = response.choices?.[0]?.message?.content;
    return parseOpenAIResponse(parsedContent);
}

/**
 * Parse PDF text using OpenAI to extract structured case data
 * @param {string} pdfText - Raw text extracted from PDF
 * @returns {Object} Parsed cause list data
 */
async function parseCauseListWithOpenAI(pdfText) {
    try {
        console.log('[debug] [parseCauseListWithOpenAI] Starting OpenAI parsing...');
        const apiKey = await getOpenAiKeyFromSecretManager(undefined, undefined, 'openaiPdfParser');
        if (!apiKey) throw new Error('OpenAI API key not available from Secret Manager');
        const openai = new OpenAI({ apiKey });

        const estimatedTokens = estimateTokenCount(pdfText);
        console.log(`[debug] [parseCauseListWithOpenAI] Estimated tokens: ${estimatedTokens}`);
        
        // Large PDFs: chunk so JSON output is not truncated and courts are not missed
        if (estimatedTokens > 35000) {
            console.log("[debug] [parseCauseListWithOpenAI] Text large, using chunking strategy");
            return await parseWithChunking(pdfText, openai);
        }
        
        // Use single request for smaller texts
        return await parseSingleRequest(pdfText, openai);
        
    } catch (error) {
        console.error('[error] [parseCauseListWithOpenAI] OpenAI parsing failed:', error?.message || error);
        // Return a safe object so callers/cache never store parsed: null solely due to API/parse throws.
        // Subscription matching still uses rawText via flattenParsedCauseListForMatching.
        return {
            court: 'SUPREME COURT OF INDIA',
            date: '',
            courts: [],
        };
    }
}

/**
 * Parse with single OpenAI request
 * @param {string} pdfText - PDF text to parse
 * @param {OpenAI} openai - OpenAI client instance
 * @returns {Object} Parsed data
 */
async function parseSingleRequest(pdfText, openai) {
    const prompt = buildCauseListExtractionPrompt(pdfText);

    let response;
    try {
        response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You extract cause-list rows as JSON only. No markdown. Only serialNumber and caseNumber per non-connected matter. No parties.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.05,
            max_tokens: 16384,
        });
    } catch (error) {
        console.error("[error] [parseSingleRequest] gpt-4.1-mini failed, trying gpt-3.5-turbo:", error.message);

        response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content:
                        "You extract cause-list rows as JSON only. No markdown. Only serialNumber and caseNumber.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.05,
            max_tokens: 4096,
        });
    }

    const parsedContent = response.choices?.[0]?.message?.content;
    console.log(
        '[debug] [parseSingleRequest] OpenAI response length:',
        parsedContent != null ? parsedContent.length : 0
    );
    if (parsedContent) {
        console.log('[debug] [parseSingleRequest] Response preview:', parsedContent.substring(0, 800));
    }
    
    let result = parseOpenAIResponse(parsedContent);
    
    // If parsing failed, try with a simplified prompt
    if (!result || !result.courts || result.courts.length === 0) {
        console.log('[debug] [parseSingleRequest] First attempt failed, trying simplified prompt');
    } else if (result.courts && result.courts.length < 5) {
        console.log(`[debug] [parseSingleRequest] First attempt only found ${result.courts.length} courts, trying simplified prompt for more courts`);
    }
    
    // If we have less than 5 courts, retry once with truncated text (model context limits)
    if (!result || !result.courts || result.courts.length < 5) {
        const simplifiedPrompt = buildCauseListExtractionPrompt(pdfText.substring(0, 120000));
        try {
            const retryResponse = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Return ONLY valid JSON. No other text.",
                    },
                    {
                        role: "user",
                        content: simplifiedPrompt,
                    },
                ],
                temperature: 0.05,
                max_tokens: 4096,
            });

            const retryContent = retryResponse.choices?.[0]?.message?.content;
            console.log("[debug] [parseSingleRequest] Retry response length:", retryContent.length);
            result = parseOpenAIResponse(retryContent);
        } catch (retryError) {
            console.error("[error] [parseSingleRequest] Retry also failed:", retryError.message);
        }
    }

    // If still not enough courts, try chunking approach for large documents
    if (result && result.courts && result.courts.length < 5) {
        console.log(
            `[debug] [parseSingleRequest] Still only ${result.courts.length} courts, trying chunking approach`
        );
        const est = estimateTokenCount(pdfText);
        if (est > 25000) {
            console.log(`[debug] [parseSingleRequest] Document is large enough for chunking, switching to chunked approach`);
            return await parseWithChunking(pdfText, openai);
        }
    }

    const estimatedTokens = estimateTokenCount(pdfText);
    if (estimatedTokens > 35000) {
        console.log(
            `[debug] [parseSingleRequest] Document is large (${estimatedTokens} est. tokens), using chunking`
        );
        return await parseWithChunking(pdfText, openai);
    }
    
    return result;
}

/**
 * Parse with chunking strategy for very large PDFs
 * @param {string} pdfText - PDF text to parse
 * @param {OpenAI} openai - OpenAI client instance
 * @returns {Object} Parsed data
 */
async function parseWithChunking(pdfText, openai) {
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
            const chunkResult = await parseChunkOnly(chunk, openai);
            
            console.log(`[debug] [parseWithChunking] Chunk ${i + 1} result:`, {
                court: chunkResult.court,
                date: chunkResult.date,
                courtsCount: chunkResult.courts ? chunkResult.courts.length : 0,
                totalCases: chunkResult.courts
                    ? chunkResult.courts.reduce(
                          (total, court) => total + (court.cases?.length || 0),
                          0
                      )
                    : 0
            });
            
            // Log courts found in this chunk
            if (chunkResult.courts && Array.isArray(chunkResult.courts)) {
                chunkResult.courts.forEach((court, courtIndex) => {
                    console.log(
                        `[debug] [parseWithChunking] Chunk ${i + 1} Court ${courtIndex + 1}: ${court.courtName} (${court.courtNumber}) - ${court.cases?.length || 0} cases`
                    );
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
            // Merge cases (dedupe by serial + case number)
            const existingCourt = courtMap.get(key);
            const seen = new Set(
                (existingCourt.cases || []).map(
                    (c) => `${String(c.serialNumber || "").trim()}|${String(c.caseNumber || "").trim()}`
                )
            );
            for (const c of court.cases || []) {
                const k = `${String(c.serialNumber || "").trim()}|${String(c.caseNumber || "").trim()}`;
                if (!seen.has(k)) {
                    seen.add(k);
                    existingCourt.cases.push(c);
                }
            }
            console.log(
                `[debug] [mergeCourts] Merged into court ${key}, total cases: ${existingCourt.cases.length}`
            );
        } else {
            console.log(`[debug] [mergeCourts] Adding new court with key: "${key}"`);
            courtMap.set(key, { ...court });
        }
    });
    
    const mergedCourts = Array.from(courtMap.values()).map((c) => ({
        ...c,
        cases: Array.isArray(c.cases) ? c.cases : [],
    }));
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
    if (parsedContent == null || typeof parsedContent !== 'string') {
        console.error(
            '[error] [parseOpenAIResponse] Empty or non-string model content:',
            parsedContent === null ? 'null' : typeof parsedContent
        );
        return {
            court: 'SUPREME COURT OF INDIA',
            date: '',
            courts: [],
        };
    }

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
            console.error(
                '[error] [parseOpenAIResponse] Invalid structure — using empty courts (no throw)'
            );
            parsedData = {
                court: parsedData.court || 'SUPREME COURT OF INDIA',
                date: parsedData.date || '',
                courts: [],
            };
        }
    }

    // Ensure every court has a cases array (model sometimes omits it → was throwing here)
    parsedData.courts = (parsedData.courts || []).map((court) => ({
        ...court,
        cases: Array.isArray(court.cases) ? court.cases : [],
    }));

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

/**
 * Build a single searchable string for subscription matching: raw PDF text plus
 * every extracted case line from structured parse (helps when raw text is noisy).
 */
function flattenParsedCauseListForMatching(rawText, parsed) {
    let t = rawText || "";
    if (parsed && Array.isArray(parsed.courts)) {
        for (const ct of parsed.courts) {
            for (const row of ct.cases || []) {
                if (row.caseNumber) t += "\n" + row.caseNumber;
                if (row.serialNumber !== undefined && row.serialNumber !== null) {
                    t += "\n" + String(row.serialNumber);
                }
            }
        }
    }
    return t;
}

module.exports = {
    parseCauseListWithOpenAI,
    flattenParsedCauseListForMatching,
};
