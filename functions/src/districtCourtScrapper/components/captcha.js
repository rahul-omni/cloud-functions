const functions = require('firebase-functions');
const axios = require('axios');

const openAiKey = functions.config().environment?.openai_api_key;
const KEY = openAiKey;

if (!KEY) { 
    console.error('🔴  OPENAI_API_KEY missing'); 
    process.exit(1); 
}

// Solve captcha using OpenAI Vision API
async function solveCaptcha(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is a CAPTCHA image showing text that needs to be read. The text may be distorted with lines, noise, or other visual effects. Look carefully at the characters and provide ONLY the text you can see. Reply with the exact characters shown, typically 4-8 alphanumeric characters. Ignore background noise and focus on the main text.'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 15,
            temperature: 0.1
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    const ans = r.data.choices[0].message.content.trim().replace(/[^a-zA-Z0-9]/g, '');
    console.log(`[captcha] AI response: "${ans}"`);
    
    // Check for verbose response patterns and extract actual captcha
    let captchaText = ans;
    const lowerAns = ans.toLowerCase();
    
    // Detect verbose responses like "thetextinthecaptchaimagereads60CN"
    if (lowerAns.includes('thetextinthecaptchaimageread')) {
        console.log('[captcha] Detected verbose AI response, extracting captcha text...');
        
        // Find where the verbose part ends and actual captcha begins
        const patterns = [
            'thetextinthecaptchaimagereads',
            'thetextinthecaptchaimageread',
            'captchaimagereads',
            'captcharead',
            'imagereads'
        ];
        
        let extractedText = null;
        for (const pattern of patterns) {
            const index = lowerAns.indexOf(pattern);
            if (index !== -1) {
                extractedText = ans.substring(index + pattern.length);
                break;
            }
        }
        
        if (extractedText && extractedText.length >= 3 && extractedText.length <= 10) {
            captchaText = extractedText;
            console.log(`[captcha] Extracted captcha text: "${captchaText}"`);
        } else {
            console.log('[captcha] Could not extract valid captcha from verbose response, retrying AI call...');
            // Retry with more specific prompt
            return await solveCaptchaRetry(buf);
        }
    }
    
    if (captchaText.length < 3 || captchaText.length > 10) {
        console.log(`[captcha] Warning: Response length ${captchaText.length} seems unusual`);
    }
    
    return captchaText;
}

// Retry captcha solving with more specific prompt
async function solveCaptchaRetry(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'Look at this CAPTCHA image. What are the letters and numbers shown? Reply with ONLY the characters, nothing else. For example, if you see "A3B7", reply exactly: A3B7'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 10,
            temperature: 0.0
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    const ans = r.data.choices[0].message.content.trim().replace(/[^a-zA-Z0-9]/g, '');
    console.log(`[captcha] Retry AI response: "${ans}"`);
    
    if (ans.length < 3 || ans.length > 10) {
        console.log(`[captcha] Warning: Retry response length ${ans.length} seems unusual`);
    }
    
    return ans;
}

module.exports = {
    solveCaptcha,
    solveCaptchaRetry
}; 