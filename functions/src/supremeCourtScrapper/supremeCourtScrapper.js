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

    await page.goto('https://www.sci.gov.in/judgements-judgement-date/', {
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
    const imgEl = await page.waitForSelector('.siwp_img, .captcha-img');
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
      await page.waitForFunction(
        () => {
          const links = document.querySelectorAll('a[href*=".pdf" i]');
          const error = document.querySelector('.error-message, .alert-danger');
          if (error) throw new Error(error.innerText);
          return links.length > 0;
        },
        { timeout: 120_000 }
      );
      
      const total = await page.evaluate(
        () => document.querySelectorAll('a[href*=".pdf" i]').length);
      console.log(`[info] [fetchSupremeCourtJudgments] Found ${total} judgment(s)`);

      // Wait for table to be fully loaded
      await wait(5000);

      // Extract table data
      const rows = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr');
        return Array.from(rows).map(tr => {
          const obj = {};
          tr.querySelectorAll('td').forEach(td => {
            const label = td.getAttribute('data-th');
            if (label) {
              obj[label.trim()] = td.textContent.trim().replace(/\s+/g, ' ') || null;
            }
          });
          obj.judgmentLinks = Array.from(
            tr.querySelectorAll('a[href*=".pdf" i]'),
            a => ({ text: a.textContent.trim(), url: a.href })
          );
          return obj;
        }).filter(row => Object.keys(row).length > 1);
      });

      if (rows.length === 0) {
        console.log('[warning] [fetchSupremeCourtJudgments] No table data found in website');
      } else {
        console.log(`[info] [fetchSupremeCourtJudgments] Successfully extracted ${rows.length} rows`);       
      }

      // Transform data to include required fields for new database schema
      const transformedRows = rows.map(row => ({
        ...row,
        // Add missing required fields
        "file_path": "",
        "case_type": "", // Supreme Court doesn't provide case type
        "city": "New Delhi", // Supreme Court is in New Delhi
        "district": "", // Not applicable for Supreme Court
        "judgment_type": "Judgment", // Default for Supreme Court
        "court": "Supreme Court", // Required for new schema
        "date": new Date().toISOString(),
        "created_at": new Date().toISOString(), 
        "updated_at": new Date().toISOString(),
        "judgment_date": date, // Use the input date as judgment_date
        "judgment_text": row["Judgment"] ? [row["Judgment"]] : [], // Convert to array
        "judgment_url": row.judgmentLinks ? row.judgmentLinks.map(link => link.url) : [] // Convert to array of URLs
      }));

      return transformedRows;

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
}; 