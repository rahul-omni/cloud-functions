const functions = require('firebase-functions');
const axios = require('axios');

// Get OpenAI API key from Firebase config (production) or environment variable (local)
let openAiKey;
try {
    openAiKey = functions.config().environment?.openai_api_key;
} catch (error) {
    openAiKey = null;
}

if (!openAiKey) {
    openAiKey = process.env.OPENAI_API_KEY;
}

const KEY = openAiKey;

if (!KEY) { 
    console.log('🔴  OPENAI_API_KEY missing - will use manual captcha solving'); 
}

// Enhanced NCLT captcha solver with more direct approach
async function solveCaptcha(buf) {
    if (!KEY) {
        console.log('[captcha] ❌ OpenAI API key not available');
        throw new Error('OpenAI API key not configured');
    }

    try {
        console.log('[captcha] 🧠 Solving NCLT captcha with enhanced prompt...');

        const base64Image = buf.toString('base64');
        const dataURL = `data:image/png;base64,${base64Image}`;

        // More direct and assertive prompt for GPT-4
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { 
                            type: 'text', 
                            text: `You are an expert at reading distorted text. This image shows a 4-digit number CAPTCHA from an Indian government website (NCLT). The numbers are like "1477" but may have visual distortions, lines, or noise. 

Your task: Look at this image and identify the 4 digits shown. Return ONLY the 4 digits as a simple number, nothing else. No explanations, no refusals.

Example responses: 1477, 2358, 9012, 0456

Now look at the image and tell me the 4 digits:`
                        },
                        { 
                            type: 'image_url', 
                            image_url: { url: dataURL } 
                        }
                    ]
                }],
                max_tokens: 10,
                temperature: 0.1
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${KEY}`,
                    'Content-Type': 'application/json'
                } 
            }
        );

        const captchaText = response.data.choices[0].message.content.trim();
        console.log(`[captcha] AI raw response: "${captchaText}"`);

        // Extract digits from response
        const cleanedText = captchaText.replace(/[^0-9]/g, '');
        
        if (cleanedText.length >= 4) {
            const result = cleanedText.substring(0, 4);
            console.log(`[captcha] ✅ NCLT captcha solved: "${result}"`);
            return result;
        } else if (cleanedText.length > 0) {
            // Pad with leading zeros if needed
            const result = cleanedText.padStart(4, '0');
            console.log(`[captcha] ✅ NCLT captcha solved (padded): "${result}"`);
            return result;
        } else {
            console.log(`[captcha] ❌ No digits found in response: "${captchaText}"`);
            
            // Try one more time with even more direct prompt
            return await solveCaptchaFallback(buf);
        }

    } catch (error) {
        console.error('[captcha] ❌ Primary captcha solving failed:', error.message);
        
        // Try fallback approach
        try {
            return await solveCaptchaFallback(buf);
        } catch (fallbackError) {
            console.error('[captcha] ❌ Fallback also failed:', fallbackError.message);
            throw new Error('All captcha solving methods failed');
        }
    }
}

// Fallback captcha solver with very simple prompt
async function solveCaptchaFallback(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not available');
    }

    console.log('[captcha] 🔄 Trying fallback approach...');

    const base64Image = buf.toString('base64');
    const dataURL = `data:image/png;base64,${base64Image}`;

    const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'What 4 numbers do you see? Just give me the 4 digits like: 1234'
                    },
                    { 
                        type: 'image_url', 
                        image_url: { url: dataURL } 
                    }
                ]
            }],
            max_tokens: 15,
            temperature: 0.0
        },
        { 
            headers: { 
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json'
            } 
        }
    );

    const fallbackText = response.data.choices[0].message.content.trim();
    console.log(`[captcha] Fallback response: "${fallbackText}"`);

    const cleaned = fallbackText.replace(/[^0-9]/g, '');
    
    if (cleaned.length >= 4) {
        const result = cleaned.substring(0, 4);
        console.log(`[captcha] ✅ Fallback success: "${result}"`);
        return result;
    } else {
        throw new Error(`Fallback failed: only ${cleaned.length} digits found`);
    }
}

module.exports = {
    solveCaptcha
};