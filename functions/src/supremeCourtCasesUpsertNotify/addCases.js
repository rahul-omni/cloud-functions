const functions = require('firebase-functions');
const puppeteer = require('puppeteer-core');
const axios     = require('axios');
const chromium = require('chrome-aws-lambda');
const { setCaseTypeAndSetValue, enterDate } = require('./components/utils');


const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey

if (!KEY) { console.error('🔴  OPENAI_API_KEY missing'); process.exit(1); }

const wait  = ms => new Promise(r => setTimeout(r, ms));


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
const fetchSupremeCourtOTF = async (date) => {
  console.log(`[start] [fetchSupremeCourtOTF] Scraping judgments for: Date: ${date}`);

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
        console.log('[error] [fetchSupremeCourtOTF] Access forbidden (403)');
      }
    });

    await page.goto('https://www.sci.gov.in/daily-order-rop-date/');

    await wait(2000);

    await enterDate(page, date);
    
    // Handle captcha with 3 retries
    let captchaSolved = false;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[info] [fetchSupremeCourtOTF] Captcha attempt ${attempt}/3`);
        
        const imgEl = await page.waitForSelector('.siwp_captcha_image, .siwp_img, .captcha-img');
        const imgURL = await page.evaluate(el => el.src, imgEl);
        const { data } = await axios.get(imgURL, { responseType: 'arraybuffer' });

        const answer = await solveCaptcha(Buffer.from(data));
        console.log(`[info] [fetchSupremeCourtOTF] Captcha solved (attempt ${attempt}):`, answer);
        
        await page.type('#siwp_captcha_value_0', answer);
        await wait(600);
        
        // Submit form to check if captcha is correct
        await page.click('input[value="Search"]');
        await wait(3000);
        
        // Check for captcha error
        const captchaError = await page.$('#cnrResults .notfound');
        if (captchaError) {
          const errorText = await page.evaluate(el => el.textContent, captchaError);
          console.log(`[warning] [fetchSupremeCourtOTF] Captcha incorrect (attempt ${attempt}):`, errorText);
          continue;
          
        } else {
          // Captcha succeeded
          captchaSolved = true;
          break;
        }
        
      } catch (error) {
        console.log(`[error] [fetchSupremeCourtOTF] Captcha attempt ${attempt} failed:`, error.message);
        
      }
    }
    
    if (!captchaSolved) {
      throw new Error('Failed to solve captcha after 3 attempts');
    }

     // Check if it's a "no result found" case
    const noResultElement = await page.$('#cnrResults .distTableContent table tbody tr');
     if (noResultElement) {
       const rowContent = await page.evaluate(el => el.textContent.trim(), noResultElement);
       if (!rowContent || rowContent === '') {
         console.log('[info] [fetchSupremeCourtOTF] No results found for the given case details');
         return [];
       }
     }
     
     console.log('[info] [fetchSupremeCourtOTF] No results found for the given case details');

    // Wait for results (form already submitted during captcha verification)
    await wait(6000);

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
      console.log(`[info] [fetchSupremeCourtOTF] Found ${total} judgment(s)`);

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
        console.log('[warning] [fetchSupremeCourtOTF] No table data found in website');
      } else {
        console.log(`[info] [fetchSupremeCourtOTF] Successfully extracted ${rows.length} rows`);       
      }

      const transformedRows = rows.map(row => ({
        // Add missing required fields
        "serial_number": row["Serial Number"],
        "diary_number": row["Diary Number"],
        "case_number": row["Case Number"],
        "parties": row["Petitioner / Respondent"],
        "advocates": row["Petitioner/Respondent Advocate"],
        "judgmentLinks": row["judgmentLinks"],
        "bench": "",
        "file_path": "",
        "case_type": "", // Supreme Court doesn't provide case type
        "city": "", // Supreme Court is in New Delhi
        "district": "", // Not applicable for Supreme Court
        "judgment_type": "Pending", // Default for Supreme Court
        "court": "Supreme Court", // Required for new schema
        "date": new Date().toISOString(),
        "created_at": new Date().toISOString(), 
        "updated_at": new Date().toISOString(),
        "judgment_date": row["ROP"] ? row["ROP"].substring(0, 10) : "", // Use the input date as judgment_date
        "judgment_text": row["ROP"] ? [row["ROP"]] : [], // Convert to array
        "judgment_url": row.judgmentLinks ? row.judgmentLinks.map(link => link.url) : [] // Convert to array of URLs
      }));

      return transformedRows;

    } catch (error) {
      throw error;
    } 
  }catch (error) {
    console.error('[error] [fetchSupremeCourtOTF] Error during scraping service: ', error);
    throw error;

  } finally {
    await browser.close();
    console.log("[end] [fetchSupremeCourtOTF] Supreme Court Scraping completed successfully");
  }
}

module.exports = {
  fetchSupremeCourtOTF
}; 