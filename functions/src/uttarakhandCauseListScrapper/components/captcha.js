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
            model: 'gpt-4-turbo',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: 'This is a CAPTCHA image with exactly 4 numeric characters. Look carefully at each character and provide ONLY the 4-numeric code. Ignore any background noise or lines. Focus on the main numeric characters. Reply with exactly 4 numeric characters, no spaces or punctuation.'
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