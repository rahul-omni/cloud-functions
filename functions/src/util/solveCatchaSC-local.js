const axios = require('axios');

const openAiKey = process.env.OPENAI_API_KEY;
const KEY = openAiKey;

if (!KEY) {
  console.error('🔴 OPENAI_API_KEY missing from environment variables');
  process.exit(1);
}

/* ─── arithmetic captcha via OpenAI Vision ─── */
const solveCaptchaWithAI = async (buf) => {
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
};

module.exports = { solveCaptchaWithAI };