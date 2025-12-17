const functions = require('firebase-functions');
const puppeteer = require('puppeteer-core');
const axios     = require('axios');
const chromium = require('chrome-aws-lambda');


const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey

if (!KEY) { console.error('🔴  OPENAI_API_KEY missing'); process.exit(1); }

const wait  = ms => new Promise(r => setTimeout(r, ms));
const digits = d => d.replace(/-/g, '');          // 01-01-2025 → 01012025

/* ─── arithmetic captcha via OpenAI Vision ─── */
const solveCaptcha = async (buf) => {
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


/* ─── main routine ─── */
const fetchSupremeCourtJudgments = async (date) => {
  console.log(`[start] [fetchSupremeCourtJudgments] Scraping judgments for: ${date}`);

  const browser = await puppeteer.launch({  args: chromium.args,
    executablePath: await chromium.executablePath,  // ✅ Required
    headless: chromium.headless});

  const page = await browser.newPage();
  
  // Set a proper user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // Enable request interception
    await page.setRequestInterception(true);
    
    // Only log critical errors
    page.on('request', request => request.continue());
    page.on('response', async response => {
      if (response.status() === 403) {
        console.log('[error] [fetchSupremeCourtJudgments] Access forbidden (403)');
      }
    });

    await page.goto('https://www.sci.gov.in/daily-order-rop-date/', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    // Wait for the form to be ready
    await page.waitForSelector('#from_date', { visible: true, timeout: 30000 });
    
    // Fill the form
    await page.click('#from_date', { clickCount: 3 });
    await page.type('#from_date', digits(date), { delay: 100 });
    await page.click('#to_date', { clickCount: 3 });
    await page.type('#to_date', digits(date), { delay: 100 });
    await wait(800);

    // Handle captcha
    const imgEl = await page.waitForSelector('.siwp_captcha_image, .siwp_img, .captcha-img');
    const imgURL = await page.evaluate(el => el.src, imgEl);
    const { data } = await axios.get(imgURL, { responseType: 'arraybuffer' });

    const answer = await solveCaptcha(Buffer.from(data));
    console.log('[info] [fetchSupremeCourtJudgments] Captcha solved:', answer);
    await page.type('#siwp_captcha_value_0', answer);
    await wait(600);

    // Submit and wait for results
    await page.click('input[value="Search"]');
    await wait(9000);

    try {
      const results = await page.$$eval('.distTableContent table tbody tr', rows =>
        rows.map(row => ({
          id: row.id,
          diary: row.querySelector('td[data-th="Diary Number"] .bt-content')?.innerText.trim(),
          caseNo: row.querySelector('td[data-th="Case Number"] .bt-content')?.innerText.trim(),
          petitioner: row.querySelector('.petitioners .bt-content')?.innerText.trim(),
          respondent: row.querySelector('.respondents .bt-content')?.innerText.trim(),
          ropDate: row.querySelector('td[data-th="ROP"] a')?.innerText.trim(),
          ropURL: row.querySelector('td[data-th="ROP"] a')?.href || null
        }))
      );

      console.log("Total rows found:", results.length);
      return results

    } catch (error) {
      console.error('[error] Failed to get results:', error.message);
      throw error;
    } 

  } finally {
    await browser.close();
    console.log("[end] [fetchSupremeCourtJudgments] Supreme Court Scraping completed successfully");
  }
}

module.exports = {
  fetchSupremeCourtJudgments
}