const functions = require('firebase-functions');
const axios = require('axios');

const KEY = functions.config().environment?.openai_api_key;

if (!KEY) { 
  console.error("🔴 Missing OPENAI_API_KEY"); 
  process.exit(1);
}

const solveCaptcha = async (buf) => {
  const dataURL = "data:image/png;base64," + buf.toString("base64");

  // MUCH more accurate prompt
  const prompt = `
You must solve a CAPTCHA containing exactly **5 characters**, made of lowercase letters (a–z) or digits (0–9).

Follow these rules STRICTLY:

1. Extract ONLY the 5 *foreground* characters.
2. Ignore all background noise, distortion lines, dots, curves, overlays, or artifacts.
3. Focus on the SHAPE of each character — NOT color or thickness.
4. Characters may be rotated or warped; infer them by typical lowercase/digit structure.
5. If a character is unclear, choose the MOST LIKELY valid alphanumeric shape.

IMPORTANT OUTPUT RULES:
- Output **exactly 5 characters**.
- No spaces.
- No punctuation.
- No explanation.
- No quotes.
- ONLY the solved 5-character CAPTCHA code.

Before responding, internally verify the output length is exactly 5.
If not, correct yourself silently and output exactly 5 characters.

Now read the CAPTCHA image and solve it.
`;

  try {
    console.log("[debug] Sending CAPTCHA to OpenAI Vision…");

    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",  // MUCH better at OCR
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataURL } }
            ]
          }
        ],
        max_tokens: 10,
        temperature: 0.0
      },
      {
        headers: { Authorization: `Bearer ${KEY}` }
      }
    );

    let ans = r.data.choices[0].message.content.trim();
    console.log(`[debug] Raw model output: "${ans}"`);

    // Sanitize: extract first 5 alphanumeric chars ONLY
    ans = ans.replace(/[^a-z0-9]/gi, "").slice(0, 5);

    console.log(`[info] Final CAPTCHA extracted → ${ans}`);

    if (ans.length !== 5) {
      throw new Error("Model returned invalid length");
    }

    return ans;

  } catch (err) {
    console.error("[error] CAPTCHA solving failed:", err.message);
    throw err;
  }
};

module.exports = { solveCaptcha };
