const functions = require('firebase-functions');
const axios = require('axios');


const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey;


if (!KEY) { 
    console.error('🔴  OPENAI_API_KEY missing'); 
    process.exit(1); 
}

// Solve captcha using OpenAI Vision
async function solveCaptcha(buf) {
    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is a CAPTCHA image with exactly 6 alphanumeric characters (letters and numbers). The text may be distorted, rotated, or have noise. Look carefully at each character and provide ONLY the 6-character code. Ignore any background noise or lines. Focus on the main text characters. Reply with exactly 6 characters, no spaces or punctuation. The characters are not in capital case.'
                    },
                    { type: 'image_url', image_url: { url: dataURL } }
                ]
            }],
            max_tokens: 10,
            temperature: 0.1
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    const ans = r.data.choices[0].message.content.trim();
    
    if (!/^[a-zA-Z0-9]{6}$/.test(ans)) {
        console.log(`[captcha] Warning: GPT response "${ans}" doesn't match expected 6-character format`);
        const cleaned = ans.replace(/[^a-zA-Z0-9]/g, '');
        if (cleaned.length >= 5 && cleaned.length <= 7) {
            console.log(`[captcha] Using cleaned response: "${cleaned.substring(0, 6)}"`);
            return cleaned.substring(0, 6);
        }
        throw new Error('Non-alphanumeric answer or wrong length');
    }
    return ans;
}

module.exports = {
    solveCaptcha
}; 