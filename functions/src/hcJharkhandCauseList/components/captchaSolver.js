const functions = require('firebase-functions');
const axios = require('axios');

const openAiKey = functions.config().openai?.api_key || process.env.OPENAI_API_KEY;
const KEY = openAiKey;

if (!KEY) { 
  console.error('🔴  OPENAI_API_KEY missing'); 
  process.exit(1); 
}

/**
 * Solve arithmetic captcha using OpenAI Vision
 * @param {Buffer} buf - Image buffer
 * @returns {Promise<string>} - Captcha answer
 */
const solveCaptcha = async (buf) => {
  const dataURL = 'data:image/png;base64,' + buf.toString('base64');
  
  // Try multiple times with different prompts
  const prompts = [
    'Image shows a simple arithmetic task with + or - operations. Reply ONLY with the final integer result, no text.',
    'Solve this arithmetic problem. Return ONLY the numeric answer.',
    'What is the result of this calculation? Answer with just the number.',
    'Calculate the result. Respond with only the integer value.'
  ];
  
  for (let attempt = 0; attempt < prompts.length; attempt++) {
    try {
      console.log(`[debug] [captchaSolver] Attempt ${attempt + 1} with prompt: ${prompts[attempt].substring(0, 50)}...`);
      
      const r = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4-turbo',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompts[attempt] },
              { type: 'image_url', image_url: { url: dataURL } }
            ]
          }],
          max_tokens: 10,
          temperature: 0.1 // Lower temperature for more consistent numeric responses
        },
        { headers: { Authorization: `Bearer ${KEY}` } }
      );
      
      const ans = r.data.choices[0].message.content.trim();
      console.log(`[debug] [captchaSolver] Raw response: "${ans}"`);
      
      // Try to extract numeric value from response
      const numericMatch = ans.match(/-?\d+/);
      if (numericMatch) {
        const numericAnswer = numericMatch[0];
        console.log(`[debug] [captchaSolver] Extracted numeric answer: ${numericAnswer}`);
        return numericAnswer;
      }
      
      // If no numeric match found, try to evaluate simple expressions
      const cleanAns = ans.replace(/[^\d+\-()]/g, ''); // Keep only digits, +, -, and parentheses
      if (cleanAns && /^-?\d+$/.test(cleanAns)) {
        console.log(`[debug] [captchaSolver] Cleaned answer: ${cleanAns}`);
        return cleanAns;
      }
      
      console.log(`[debug] [captchaSolver] Attempt ${attempt + 1} failed, trying next prompt...`);
      
    } catch (error) {
      console.error(`[error] [captchaSolver] Attempt ${attempt + 1} failed:`, error.message);
      if (attempt === prompts.length - 1) {
        throw new Error(`All captcha solving attempts failed. Last error: ${error.message}`);
      }
    }
  }
  
  throw new Error('Failed to get numeric answer after all attempts');
};

module.exports = {
  solveCaptcha
};
