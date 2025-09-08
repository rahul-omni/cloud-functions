const functions = require('firebase-functions');
const axios = require('axios');

// Get OpenAI API key from Firebase config (production) or environment variable (local)
let openAiKey;
try {
    // Try Firebase functions config first (production)
    openAiKey = functions.config().environment?.openai_api_key;
} catch (error) {
    // Fallback to environment variable (local development)
    openAiKey = null;
}

// If Firebase config didn't work, try environment variable
if (!openAiKey) {
    openAiKey = process.env.OPENAI_API_KEY;
}

const KEY = openAiKey;

if (!KEY) { 
    console.error('🔴  OPENAI_API_KEY missing nclt court'); 
    console.log('💡 For local testing, set environment variable: $env:OPENAI_API_KEY="your-key"');
    console.log('💡 For production, use: firebase functions:config:set environment.openai_api_key="your-key"');
    process.exit(1); 
}

// Solve NCLT captcha using OpenAI Vision API
async function solveCaptcha(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    console.log('[captcha] Solving NCLT captcha...');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is an NCLT (National Company Law Tribunal) website captcha. Look at the image and tell me the exact numbers or letters shown. The captcha typically shows 4-5 alphanumeric characters in a simple format like "4382". Respond with ONLY the characters you see, nothing else. Example: if you see "4382", respond exactly: 4382'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 10,
            temperature: 0.0
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    const rawResponse = r.data.choices[0].message.content.trim();
    console.log(`[captcha] Raw AI response: "${rawResponse}"`);
    
    // Check if ChatGPT says there's no captcha or can't see one
    if (rawResponse.toLowerCase().includes('no captcha') || 
        rawResponse.toLowerCase().includes('does not contain') ||
        rawResponse.toLowerCase().includes('cannot see') ||
        rawResponse.toLowerCase().includes('unable to') ||
        rawResponse.toLowerCase().includes('not visible')) {
        console.log('[captcha] ⚠️ ChatGPT says no captcha detected in image');
        throw new Error('ChatGPT could not detect captcha in image - image capture may be incorrect');
    }
    
    // Clean the response - remove any non-alphanumeric characters
    const cleanedResponse = rawResponse.replace(/[^a-zA-Z0-9]/g, '');
    console.log(`[captcha] Cleaned response: "${cleanedResponse}"`);
    
    // Validate response length (NCLT captchas can be 2-6 characters)
    if (cleanedResponse.length < 2 || cleanedResponse.length > 6) {
        console.log(`[captcha] Warning: Response length ${cleanedResponse.length} is unusual for NCLT captcha, retrying...`);
        return await solveCaptchaRetry(buf);
    }
    
    // If response is only 2 characters, double-check with retry
    if (cleanedResponse.length === 2) {
        console.log(`[captcha] Short response detected (${cleanedResponse}), verifying with retry...`);
        try {
            const retryResult = await solveCaptchaRetry(buf);
            // If retry gives a similar short result, accept it
            if (retryResult && retryResult.length >= 2) {
                return retryResult;
            }
        } catch (error) {
            console.log('[captcha] Retry failed, using original short response');
        }
    }
    
    console.log(`[captcha] Final NCLT captcha solution: "${cleanedResponse}"`);
    return cleanedResponse;
}

// Retry NCLT captcha solving with more specific prompt
async function solveCaptchaRetry(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    console.log('[captcha] Retrying NCLT captcha with specific prompt...');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'Look at this NCLT captcha image. I need you to identify the exact alphanumeric characters shown. The characters are usually 4-5 digits or letters in a simple font. Please respond with ONLY those characters, no explanations. Example: if you see numbers like "4382", respond: 4382'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 8,
            temperature: 0.0
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    const rawResponse = r.data.choices[0].message.content.trim();
    console.log(`[captcha] Retry raw response: "${rawResponse}"`);
    
    // Check if ChatGPT says there's no captcha or can't see one
    if (rawResponse.toLowerCase().includes('no captcha') || 
        rawResponse.toLowerCase().includes('does not contain') ||
        rawResponse.toLowerCase().includes('cannot see') ||
        rawResponse.toLowerCase().includes('unable to') ||
        rawResponse.toLowerCase().includes('not visible')) {
        console.log('[captcha] ⚠️ ChatGPT retry also says no captcha detected in image');
        throw new Error('ChatGPT retry could not detect captcha in image - image capture is definitely incorrect');
    }
    
    const cleanedResponse = rawResponse.replace(/[^a-zA-Z0-9]/g, '');
    console.log(`[captcha] Retry cleaned response: "${cleanedResponse}"`);
    
    // Additional validation for NCLT format
    if (cleanedResponse.length >= 3 && cleanedResponse.length <= 6) {
        console.log(`[captcha] ✅ Valid NCLT captcha solved: "${cleanedResponse}"`);
        return cleanedResponse;
    } else {
        console.log(`[captcha] ⚠️ Invalid NCLT captcha format, length: ${cleanedResponse.length}`);
        // Return best attempt even if not ideal length
        return cleanedResponse;
    }
}

module.exports = {
    solveCaptcha,
    solveCaptchaRetry
};