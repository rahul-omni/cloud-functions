const functions = require('firebase-functions');
const axios = require('axios');

// Import all components from index
const {
  launchBrowser,
  createPage,
  navigateToPage,
  closeBrowser,
  fillForm,
  validateFormFields,
  submitForm,
  waitForResults,
  extractTableData,
  transformData
} = require('./components');
const { setupDialogHandler } = require('../highCourtScrapper/components/browser');

const openAiKey = functions.config().environment.openai_api_key;
const KEY = openAiKey;


const wait = ms => new Promise(r => setTimeout(r, ms));
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
                        text: 'This is a CAPTCHA image with exactly 6 alphanumeric characters (letters and numbers). The text may be distorted, rotated, or have noise. Look carefully at each character and provide ONLY the 6-character code. Ignore any background noise or lines. Focus on the main text characters. Reply with exactly 6 characters, no spaces or punctuation. The characters are not in capital case.'
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
    
    if (!/^[a-zA-Z0-9]{6}$/.test(ans)) {
        console.log(`[captcha] Warning: GPT response "${ans}" doesn't match expected 6-character format`);
        const cleaned = ans.replace(/[^a-zA-Z0-9]/g, '');
        if (cleaned.length >= 5 && cleaned.length <= 7) {
            console.log(`[captcha] Using cleaned response: "${cleaned.substring(0, 6)}"`);
            return cleaned.substring(0, 6);
        }
        throw new Error('Non-alphanumeric answer or wrong length');
    }
    return ans;
}

async function handleCaptcha(page, captchaRetries = 3) {
    let success = false;
    
    for (let attempt = 1; attempt <= captchaRetries; attempt++) {
        console.log(`[captcha] Attempt ${attempt}/${captchaRetries}`);
        
        // Wait for the captcha input to be visible
        await page.waitForSelector('#captcha_image', { visible: true });

        // Clear the captcha field first (for retry attempts)
        await page.click('input#captcha.captchaClass[name="captcha"]', { clickCount: 3 });
        await page.keyboard.press('Delete');
        await wait(500);

        // Get the captcha image directly from the page
        await wait(500);
        console.log('[captcha] Capturing captcha image from page...');
        
        const captchaImg = await page.$('img[alt="CAPTCHA Image"]');
        if (!captchaImg) {
            throw new Error('Captcha image not found');
        }
        
        // Take a screenshot of just the captcha element
        const captchaBuffer = await captchaImg.screenshot();
        
        const answer = await solveCaptcha(captchaBuffer);
        console.log('[captcha] GPT says:', answer);

        // Click and type the answer
        await page.click('input#captcha.captchaClass[name="captcha"]');
        await wait(500);
        await page.type('input#captcha.captchaClass[name="captcha"]', answer);
        console.log('[captcha] Typed captcha into the unique input#captcha.captchaClass[name="captcha"]');
        await wait(1000);

        console.log('[click] Clicking Go button...');
        await page.click('#butCivil');
        await wait(3000);

        // Check for invalid captcha error
        console.log('[check] Checking for captcha error...');
        try {
            const errorDiv = await page.$('#div_Causelist');
            if (errorDiv) {
                const isVisible = await page.evaluate(el => el.style.display !== 'none', errorDiv);
                if (isVisible) {
                    const errorText = await page.evaluate(el => el.textContent, errorDiv);
                    if (errorText.includes('Invalid Captcha')) {
                        console.log(`[retry] Invalid captcha detected: ${errorText.trim()}`);
                        if (attempt < captchaRetries) {
                            console.log('[retry] Refreshing captcha and trying again...');
                            // Refresh the captcha by clicking on it
                            try {
                                await captchaImg.click();
                                await wait(2000);
                            } catch (e) {
                                console.log('[retry] Could not refresh captcha image, continuing...');
                            }
                            continue; // Go to next attempt
                        } else {
                            console.error('[error] All captcha attempts failed. Exiting.');
                            throw new Error('All captcha attempts failed');
                        }
                    }
                }
            }
            
            // If we get here, no error was found - captcha was successful
            console.log('[success] Captcha accepted, proceeding...');
            success = true;
            break;
            
        } catch (error) {
            console.log('[check] Error checking for captcha error, assuming success');
            success = true;
            break;
        }
    }

    if (!success) {
        console.error('[error] Failed to solve captcha after 3 attempts. Exiting.');
        throw new Error('Failed to solve captcha after 3 attempts');
    }
}

/* ─── main routine ─── */
const fetchhighCourtCauseList = async (formData) => {
  console.log(`[start] [fetchSupremeCourtCauseList] Scraping cause list with parameters:`);

  let browser;
  try {
    // Launch and configure browser
    browser = await launchBrowser();
    const page = await createPage(browser);

    const modalHandled = setupDialogHandler(page);

    // Navigate to the page
    const { cookies, cookieHeader } = await navigateToPage(page, modalHandled);

    // Fill and validate form with the new form data structure
    await fillForm(page, formData);
    // await validateFormFields(page, formData);
    
    // // Handle captcha and submit
    await handleCaptcha(page);
    await submitForm(page);
    
    // // Wait for results and extract data
    const rows = await waitForResults(page);
    console.log('[info] [fetchSupremeCourtCauseList] Scraped rows:', rows);
    return { results: rows, cookies, cookieHeader };

    } catch (error) {
      console.error('[error] [fetchSupremeCourtCauseList] Failed to get results:', error.message);
      console.log('[debug] [fetchSupremeCourtCauseList] Error details:', error);
      throw error;
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
    console.log("[end] [fetchSupremeCourtCauseList] Supreme Court Cause List Scraping completed successfully");
  }
};


module.exports = {
  fetchhighCourtCauseList,
}; 