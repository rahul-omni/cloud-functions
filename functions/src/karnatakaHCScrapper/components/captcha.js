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

    console.log('Solving CAPTCHA using OpenAI Vision...');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: "gpt-4o-mini",
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is a CAPTCHA image with exactly 6-digit numeric characters. Look carefully at each character and provide ONLY the 6-digit numeric code. Ignore any background noise or lines. Focus on the main numeric characters. Reply with exactly 6 numeric characters, no spaces or punctuation.'
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
    return ans;
}

module.exports = {
    solveCaptcha
}; 