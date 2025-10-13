const functions = require('firebase-functions');
const axios = require('axios');

// Enhanced API key detection - check multiple locations
let openAiKey;
try {
    // First try the environment path (most recent)
    openAiKey = functions.config().environment?.openai_api_key;
    console.log(`[captcha-init] Environment config check: ${openAiKey ? 'FOUND' : 'NOT FOUND'}`);
    
    // If not found, try the openai path
    if (!openAiKey) {
        openAiKey = functions.config().openai?.api_key;
        console.log(`[captcha-init] OpenAI config check: ${openAiKey ? 'FOUND' : 'NOT FOUND'}`);
    }
} catch (error) {
    console.log(`[captcha-init] Firebase config error: ${error.message}`);
    openAiKey = null;
}

// Fallback to environment variable for local development
if (!openAiKey) {
    openAiKey = process.env.OPENAI_API_KEY;
    console.log(`[captcha-init] Environment variable check: ${openAiKey ? 'FOUND' : 'NOT FOUND'}`);
}

const KEY = openAiKey;

// Log the API key status (first 10 chars only for security)
if (KEY) {
    console.log(`[captcha-init] ✅ OpenAI API Key configured: ${KEY.substring(0, 10)}...${KEY.substring(KEY.length - 4)}`);
} else {
    console.log('[captcha-init] ❌ OPENAI_API_KEY missing - captcha solving will fail');
}

/**
 * Solve NCLT numeric captcha using OpenAI Vision (optimized for 4-digit numbers)
 * @param {Buffer} buf - Image buffer from captcha screenshot
 * @returns {Promise<string>} - Captcha answer (4-digit number)
 */
const solveCaptcha = async (buf) => {
    if (!KEY) {
        console.log('[captcha] ❌ No OpenAI API key available');
        throw new Error('OpenAI API key not configured');
    }

    console.log(`[captcha] 🧠 Solving NCLT numeric captcha...`);
    console.log(`[captcha] Image buffer size: ${buf.length} bytes`);

    // Validate image buffer
    if (buf.length < 200) {
        throw new Error(`Image buffer too small: ${buf.length} bytes - likely invalid screenshot`);
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    console.log(`[captcha] Base64 image length: ${dataURL.length}`);

    // Multiple prompts optimized for NCLT 4-digit captchas
    const prompts = [
        'This image shows a 4-digit number captcha like "1546". Read the digits and return ONLY the number. No text, just digits.',
        'Image contains 4 digits in a captcha. What are the 4 digits? Return only the numbers.',
        'Read the captcha number from this image. Reply with only the 4-digit number.',
        'What number do you see in this captcha image? Answer with just the digits.',
        'This is a numeric captcha. Extract the 4-digit number and return it.',
        'OCR this captcha image. Return only the number you see.'
    ];

    // Try multiple models for better success rate
    const models = [
        { name: 'gpt-4o', detail: 'high' },
        { name: 'gpt-4o-mini', detail: 'low' },
        { name: 'gpt-4-turbo', detail: 'high' }
    ];

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const model = models[modelIndex];
        console.log(`[captcha] 🎯 Trying model: ${model.name} with ${model.detail} detail`);

        for (let attempt = 0; attempt < prompts.length; attempt++) {
            try {
                console.log(`[captcha] 📝 Model ${model.name} - Attempt ${attempt + 1}/${prompts.length}`);
                console.log(`[captcha] Prompt: "${prompts[attempt].substring(0, 60)}..."`);

                const response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: model.name,
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: prompts[attempt] },
                                { 
                                    type: 'image_url', 
                                    image_url: { 
                                        url: dataURL,
                                        detail: model.detail
                                    } 
                                }
                            ]
                        }],
                        max_tokens: 10,
                        temperature: 0 // Most deterministic for number recognition
                    },
                    { 
                        headers: { 
                            'Authorization': `Bearer ${KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                const aiResponse = response.data.choices[0].message.content.trim();
                console.log(`[captcha] 🤖 AI response: "${aiResponse}"`);

                // Check if AI says it can't see the image
                if (aiResponse.toLowerCase().includes("unable to view") || 
                    aiResponse.toLowerCase().includes("can't see") ||
                    aiResponse.toLowerCase().includes("cannot see") ||
                    aiResponse.toLowerCase().includes("can't view") ||
                    aiResponse.toLowerCase().includes("i can't") ||
                    aiResponse.toLowerCase().includes("i'm unable") ||
                    aiResponse.length > 50) {
                    console.log(`[captcha] ⚠️ Model ${model.name} cannot view images, trying next...`);
                    continue;
                }

                // Extract 4-digit number - try multiple patterns
                const patterns = [
                    /\b\d{4}\b/,           // Exact 4 digits with word boundaries
                    /\d{4}/,               // Any 4 consecutive digits
                    /\b\d{3,5}\b/,         // 3-5 digits (in case of OCR errors)
                    /\d+/                  // Any digits
                ];

                let extractedNumber = null;

                for (const pattern of patterns) {
                    const numericMatch = aiResponse.match(pattern);
                    if (numericMatch) {
                        let candidate = numericMatch[0];
                        
                        // For NCLT captchas, prefer 4-digit numbers
                        if (candidate.length === 4) {
                            extractedNumber = candidate;
                            break;
                        } else if (candidate.length >= 3 && candidate.length <= 5 && !extractedNumber) {
                            extractedNumber = candidate;
                        }
                    }
                }

                if (extractedNumber) {
                    // Additional validation for NCLT captchas
                    if (extractedNumber.length >= 3 && extractedNumber.length <= 5) {
                        // If longer than 4 digits, take first 4
                        if (extractedNumber.length > 4) {
                            extractedNumber = extractedNumber.substring(0, 4);
                        }
                        
                        console.log(`[captcha] ✅ ${model.name} successfully extracted: "${extractedNumber}"`);
                        return extractedNumber;
                    }
                }

                console.log(`[captcha] ⚠️ ${model.name} attempt ${attempt + 1} - no valid number found in: "${aiResponse}"`);

            } catch (error) {
                console.log(`[captcha] ❌ ${model.name} attempt ${attempt + 1} failed: ${error.message}`);
                
                if (error.response) {
                    console.log(`[captcha] API Error Status: ${error.response.status}`);
                    console.log(`[captcha] API Error Data:`, JSON.stringify(error.response.data, null, 2));
                    
                    if (error.response.status === 401) {
                        throw new Error('OpenAI API key is invalid or expired');
                    } else if (error.response.status === 429) {
                        throw new Error('OpenAI API rate limit exceeded - please wait and try again');
                    }
                }
                
                // If it's the last attempt with the last model, throw the error
                if (modelIndex === models.length - 1 && attempt === prompts.length - 1) {
                    throw error;
                }
            }
        }
    }

    throw new Error('Failed to extract captcha number after trying all models and prompts');
};

/**
 * Alternative captcha solver with different approach (OCR-focused)
 * @param {Buffer} buf - Image buffer
 * @returns {Promise<string>} - Captcha answer
 */
const solveCaptchaOCR = async (buf) => {
    if (!KEY) {
        throw new Error('No API key for OCR approach');
    }

    console.log('[captcha] 🔍 Trying OCR-focused approach...');

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o',
                messages: [{
                    role: 'system',
                    content: 'You are an OCR system. You only extract text/numbers from images. Return only what you see, no explanations.'
                }, {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Extract the number from this captcha image. Return only digits.' },
                        { 
                            type: 'image_url', 
                            image_url: { 
                                url: dataURL,
                                detail: 'high'
                            } 
                        }
                    ]
                }],
                max_tokens: 5,
                temperature: 0
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const aiResponse = response.data.choices[0].message.content.trim();
        console.log(`[captcha] 🔍 OCR response: "${aiResponse}"`);

        // Extract numbers
        const numericMatch = aiResponse.match(/\d{3,5}/);
        if (numericMatch) {
            let extractedNumber = numericMatch[0];
            if (extractedNumber.length > 4) {
                extractedNumber = extractedNumber.substring(0, 4);
            }
            console.log(`[captcha] ✅ OCR extracted: "${extractedNumber}"`);
            return extractedNumber;
        }

        throw new Error(`OCR failed: no valid number in "${aiResponse}"`);

    } catch (error) {
        console.log(`[captcha] ❌ OCR approach failed: ${error.message}`);
        throw error;
    }
};

module.exports = {
    solveCaptcha,
    solveCaptchaOCR
};