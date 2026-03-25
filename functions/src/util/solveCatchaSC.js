const axios = require('axios');
const { getOpenAiKeyFromSecretManager } = require('../config/getOpenAiKeyFromSecretManager');

/* ─── arithmetic captcha via OpenAI Vision ─── */
const solveCaptcha = async (buf) => {
    const KEY = await getOpenAiKeyFromSecretManager(undefined, undefined, 'solveCatchaSC');
    if (!KEY) throw new Error('OpenAI API key not available from Secret Manager');

    const dataURL = 'data:image/png;base64,' + buf.toString('base64');
    const r = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo',
        messages: [{
          role: 'user',
          content: [
            { type: 'text',
              text: 'Image shows a simple "+" or "-" arithmetic task; reply ONLY the integer result.' },
            { type: 'image_url', image_url: { url: dataURL } }
          ]
        }],
        max_tokens: 5
      },
      { headers: { Authorization: `Bearer ${KEY}` } }
    );
    const ans = r.data.choices[0].message.content.trim();
    if (!/^-?\d+$/.test(ans)) throw new Error('Non-numeric answer');
    return ans;
  }

  module.exports = { solveCaptcha };