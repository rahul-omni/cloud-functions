const functions = require('firebase-functions');
const axios = require('axios');

// Get OpenAI key from Firebase config
const getOpenAIKey = () => {
    // Try to get key from Firebase config
    const key = functions.config()?.environment?.openai_api_key;
    
    console.log('🔑 Captcha Solver - OpenAI Key status:', key ? '✅ Found' : '❌ Missing');
    
    if (!key) {
        console.error('🔴 OpenAI API key missing from Firebase config');
        console.log('💡 Set the key using: firebase functions:config:set environment.openai_api_key="YOUR_KEY"');
    }
    
    return key;
};

const KEY = getOpenAIKey();

// Solve captcha using OpenAI Vision API
async function solveCaptcha(buf) {
    if (!KEY) {
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
    const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o',  // Use latest GPT-4 Omni model for better vision
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: `Read the CAPTCHA text from this image. The CAPTCHA contains 4-6 alphanumeric characters that may be distorted or have noise/lines overlaid.

IMPORTANT: Respond with ONLY the exact characters you see, nothing else. No explanations, no quotes, no extra text.

Example correct responses:
- If you see "A3B7" → respond: A3B7
- If you see "Xy9K" → respond: Xy9K
- If you see "4mN2" → respond: 4mN2

Pay close attention to:
- Case sensitivity (uppercase vs lowercase)
- Similar looking characters: 0/O, 1/l/I, 5/S, 8/B, 2/Z
- Characters that might be partially obscured

Your response:`
                    },
                    { 
                        type: 'image_url', 
                        image_url: { 
                            url: dataURL,
                            detail: 'high'  // Request high detail analysis
                        } 
                    }
                ]
            }],
            max_tokens: 20,
            temperature: 0.0  // Use 0 for most deterministic output
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    let ans = r.data.choices[0].message.content.trim();
    console.log(`[captcha] Raw AI response: "${ans}"`);
    
    // Clean the response - remove any quotes, spaces, or common phrase patterns
    ans = ans.replace(/^["']|["']$/g, '')  // Remove surrounding quotes
             .replace(/the (text|captcha|code|characters?) (in the (image|captcha))?\s*(is|shows?|reads?):?\s*/gi, '')
             .replace(/^response:?\s*/gi, '')
             .replace(/^answer:?\s*/gi, '')
             .replace(/[^a-zA-Z0-9]/g, '')
             .trim();
             
    console.log(`[captcha] Cleaned response: "${ans}"`);
    
    if (ans.length < 3 || ans.length > 10) {
        console.log(`[captcha] Warning: Response length ${ans.length} seems unusual, expected 4-6 characters`);
    }
    
    return ans;
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
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    { 
                        type: 'text', 
                        text: `Extract the alphanumeric code from this CAPTCHA image. Look past any distortions, lines, or noise. Output ONLY the characters with no additional text.`
                    },
                    { 
                        type: 'image_url', 
                        image_url: { 
                            url: dataURL,
                            detail: 'high'
                        } 
                    }
                ]
            }],
            max_tokens: 15,
            temperature: 0.0
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
    );
    
    const ans = r.data.choices[0].message.content
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/[^a-zA-Z0-9]/g, '');
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

// const functions = require('firebase-functions');
// const axios = require('axios');

// // Try to get key from Firebase config first, then fall back to environment variable
// const openAiKey = functions.config().environment?.openai_api_key || process.env.OPENAI_API_KEY;

// const KEY = openAiKey;
// console.log('Captcha Solver - OpenAI Key status:', KEY ? '✅ Found' : '❌ Missing');

// if (!KEY) { 
//     console.error('🔴  OPENAI_API_KEY missing from both Firebase config and environment'); 
//     process.exit(1); 
// }

// // Solve captcha using OpenAI Vision API
// async function solveCaptcha(buf) {
//     if (!KEY) {
//         throw new Error('OpenAI API key not configured');
//     }

//     const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
//     const r = await axios.post(
//         'https://api.openai.com/v1/chat/completions',
//         {
//             model: 'gpt-4-turbo',
//             messages: [{
//                 role: 'user',
//                 content: [
//                     { 
//                         type: 'text', 
//                         text: 'This is a CAPTCHA image showing text that needs to be read. The text may be distorted with lines, noise, or other visual effects. Look carefully at the characters and provide ONLY the text you can see. Reply with the exact characters shown, typically 4-8 alphanumeric characters. Ignore background noise and focus on the main text.'
//                     },
//                     { type: 'image_url', image_url: { url: dataURL } }
//                 ]
//             }],
//             max_tokens: 15,
//             temperature: 0.1
//         },
//         { headers: { Authorization: `Bearer ${KEY}` } }
//     );
    
//     const ans = r.data.choices[0].message.content.trim().replace(/[^a-zA-Z0-9]/g, '');
//     console.log(`[captcha] AI response: "${ans}"`);
    
//     // Check for verbose response patterns and extract actual captcha
//     let captchaText = ans;
//     const lowerAns = ans.toLowerCase();
    
//     // Detect verbose responses like "thetextinthecaptchaimagereads60CN"
//     if (lowerAns.includes('thetextinthecaptchaimageread')) {
//         console.log('[captcha] Detected verbose AI response, extracting captcha text...');
        
//         // Find where the verbose part ends and actual captcha begins
//         const patterns = [
//             'thetextinthecaptchaimagereads',
//             'thetextinthecaptchaimageread',
//             'captchaimagereads',
//             'captcharead',
//             'imagereads'
//         ];
        
//         let extractedText = null;
//         for (const pattern of patterns) {
//             const index = lowerAns.indexOf(pattern);
//             if (index !== -1) {
//                 extractedText = ans.substring(index + pattern.length);
//                 break;
//             }
//         }
        
//         if (extractedText && extractedText.length >= 3 && extractedText.length <= 10) {
//             captchaText = extractedText;
//             console.log(`[captcha] Extracted captcha text: "${captchaText}"`);
//         } else {
//             console.log('[captcha] Could not extract valid captcha from verbose response, retrying AI call...');
//             // Retry with more specific prompt
//             return await solveCaptchaRetry(buf);
//         }
//     }
    
//     if (captchaText.length < 3 || captchaText.length > 10) {
//         console.log(`[captcha] Warning: Response length ${captchaText.length} seems unusual`);
//     }
    
//     return captchaText;
// }

// // Retry captcha solving with more specific prompt
// async function solveCaptchaRetry(buf) {
//     if (!KEY) {
//         throw new Error('OpenAI API key not configured');
//     }

//     const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    
//     const r = await axios.post(
//         'https://api.openai.com/v1/chat/completions',
//         {
//             model: 'gpt-4-turbo',
//             messages: [{
//                 role: 'user',
//                 content: [
//                     { 
//                         type: 'text', 
//                         text: 'Look at this CAPTCHA image. What are the letters and numbers shown? Reply with ONLY the characters, nothing else. For example, if you see "A3B7", reply exactly: A3B7'
//                     },
//                     { type: 'image_url', image_url: { url: dataURL } }
//                 ]
//             }],
//             max_tokens: 10,
//             temperature: 0.0
//         },
//         { headers: { Authorization: `Bearer ${KEY}` } }
//     );
    
//     const ans = r.data.choices[0].message.content.trim().replace(/[^a-zA-Z0-9]/g, '');
//     console.log(`[captcha] Retry AI response: "${ans}"`);
    
//     if (ans.length < 3 || ans.length > 10) {
//         console.log(`[captcha] Warning: Retry response length ${ans.length} seems unusual`);
//     }
    
//     return ans;
// }

// module.exports = {
//     solveCaptcha,
//     solveCaptchaRetry
// }; 