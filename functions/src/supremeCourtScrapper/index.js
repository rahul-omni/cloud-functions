// const functions = require("firebase-functions");
// const regionFunctions = functions.region('asia-south1');
// const { solveCaptcha } = require('../util/solveCatcha');
// const puppeteer = require('puppeteer');
// const axios = require('axios');

// const openAiKey = functions.config().environment.openai_api_key;
// const KEY = openAiKey
// if (!KEY) { console.error('🔴  OPENAI_API_KEY missing'); process.exit(1); }

// const wait = ms => new Promise(r => setTimeout(r, ms));
// const digits = d => d.replace(/-/g, '');          // 01-01-2025 → 01012025

// // Runtime options for the function
// const runtimeOpts = {
//   timeoutSeconds: 540,
//   memory: '2GB',
//   minInstances: 0,
//   maxInstances: 10
// };

// /**
//  * HTTP Cloud Function for scraping Supreme Court cases
//  */
// exports.scrapeSupremeCourtCases = regionFunctions.runWith(runtimeOpts).https
//   .onRequest(async (req, res) => {

//     const now = new Date();
//     console.log("Scraping for Supreme Court started at:", now.toISOString());

//     try {
//       // Get date from request or use current date
//       const date = req.query.date || formatDate(new Date());

//       console.log(`🔍  Scraping judgments for: ${date}`);

//       const browser = await puppeteer.launch({
//         headless: 'new',
//         args: [
//           '--no-sandbox',
//           '--disable-setuid-sandbox',
//           '--disable-web-security',
//           '--disable-features=IsolateOrigins,site-per-process',
//           '--window-size=1920,1080'
//         ]
//       });

//       const page = await browser.newPage();

//       // Set a proper user agent
//       await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
//       await page.setViewport({ width: 1920, height: 1080 });

//       try {
//         // Enable request interception
//         await page.setRequestInterception(true);

//         // Only log critical errors
//         page.on('request', request => request.continue());
//         page.on('response', async response => {
//           if (response.status() === 403) {
//             console.error('[error] Access forbidden (403)');
//           }
//         });

//         await page.goto('https://www.sci.gov.in/judgements-judgement-date/', {
//           waitUntil: 'networkidle0',
//           timeout: 60000
//         });

//         // Wait for the form to be ready
//         await page.waitForSelector('#from_date', { visible: true, timeout: 30000 });

//         // Fill the form
//         await page.click('#from_date', { clickCount: 3 });
//         await page.type('#from_date', digits(date), { delay: 100 });
//         await page.click('#to_date', { clickCount: 3 });
//         await page.type('#to_date', digits(date), { delay: 100 });
//         await wait(800);

//         // Handle captcha
//         const imgEl = await page.waitForSelector('.siwp_img, .captcha-img');
//         const imgURL = await page.evaluate(el => el.src, imgEl);
//         const { data } = await axios.get(imgURL, { responseType: 'arraybuffer' });

//         const answer = await solveCaptcha(Buffer.from(data));
//         console.log('[captcha] Solved:', answer);
//         await page.type('#siwp_captcha_value_0', answer);
//         await wait(600);

//         // Submit and wait for results
//         await page.click('input[value="Search"]');
//         await wait(9000);

//         try {
//           await page.waitForFunction(
//             () => {
//               const links = document.querySelectorAll('a[href*=".pdf" i]');
//               const error = document.querySelector('.error-message, .alert-danger');
//               if (error) throw new Error(error.innerText);
//               return links.length > 0;
//             },
//             { timeout: 120_000 }
//           );

//           const total = await page.evaluate(
//             () => document.querySelectorAll('a[href*=".pdf" i]').length);
//           console.log(`[info] Found ${total} judgment(s)`);

//           // Wait for table to be fully loaded
//           await wait(5000);

//           // Extract table data
//           const rows = await page.evaluate(() => {
//             const rows = document.querySelectorAll('table tr');
//             return Array.from(rows).map(tr => {
//               const obj = {};
//               tr.querySelectorAll('td').forEach(td => {
//                 const label = td.getAttribute('data-th');
//                 if (label) {
//                   obj[label.trim()] = td.textContent.trim().replace(/\s+/g, ' ') || null;
//                 }
//               });
//               obj.judgmentLinks = Array.from(
//                 tr.querySelectorAll('a[href*=".pdf" i]'),
//                 a => ({ text: a.textContent.trim(), url: a.href })
//               );
//               return obj;
//             }).filter(row => Object.keys(row).length > 1);
//           });

//           if (rows.length === 0) {
//             console.warn('[warning] No table data found');
//           } else {
//             console.log(`[info] Successfully extracted ${rows.length} rows`);
//           }

//           res.status(200).json({
//             success: true,
//             message: "Supreme Court Scraping completed successfully",
//             date: date,
//             count: rows.length,
//             data: rows
//           });

//         } catch (error) {
//           console.error('[error] Failed to get supreme court results:', error.message);
//           throw error;
//         }

//       } finally {
//         await browser.close();
//       }

//     } catch (error) {
//       console.error('Error during scraping:', error);
//       res.status(500).json({
//         success: false,
//         error: error.message
//       });
//     }
//   });

// // Helper function to format date as DD-MM-YYYY
// function formatDate(date) {
//   const day = String(date.getDate()).padStart(2, '0');
//   const month = String(date.getMonth() + 1).padStart(2, '0');
//   const year = date.getFullYear();
//   return `${day}-${month}-${year}`;
// } 