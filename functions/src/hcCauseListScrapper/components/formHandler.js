const axios = require('axios');
const { wait, digits } = require('./utils');

/**
 * Fill the cause list form with provided parameters
 * @param {Object} page - Page instance
 * @param {Object} formData - Object containing all form data
 * @returns {Promise<void>}
 */
const fillForm = async (page, formData) => {
  try {
    // 1️⃣ Wait for State dropdown to exist
    await page.waitForSelector('#sess_state_code', { visible: true });

    // 2️⃣ Wait for State options to populate
    await page.waitForFunction(
      selector => document.querySelector(selector).options.length > 1,
      {},
      '#sess_state_code'
    );

    // 3️⃣ Select the desired state
    await page.select('#sess_state_code', formData.stateCourt);
    console.log(`[info] Selected Court State: ${formData.stateCourt}`);

    // 4️⃣ Wait for Bench dropdown to exist
    await page.waitForSelector('#court_complex_code', { visible: true });

    // 5️⃣ Wait for Bench options to populate after state selection
    await page.waitForFunction(
      (selector, value) => Array.from(document.querySelector(selector).options).some(opt => opt.value === value),
      {},
      '#court_complex_code',
      formData.courtBench
    );

    // 6️⃣ Select the desired bench
    await page.select('#court_complex_code', formData.courtBench);
    console.log(`[info] Selected Court Bench: ${formData.courtBench}`);

    // 7️⃣ Fill the Cause List Date
    await page.waitForSelector('#causelist_date', { visible: true });
    await page.$eval('#causelist_date', (el, value) => { el.value = value; }, formData.causelistDate);
    console.log(`[info] Set Cause List Date: ${formData.causelistDate}`);

  } catch (error) {
    console.error('[error] Error filling form:', error.message);
    throw error;
  }
};

/**
 * Handle dynamic fields that appear based on searchBy selection
 * @param {Object} page - Page instance
 * @param {Object} formData - Form data object
 * @returns {Promise<void>}
 */
const handleDynamicFields = async (page, formData) => {
  try {
    switch (formData.searchBy) {
      case 'court':
        if (formData.court) {
          await page.select('#court', formData.court);
          await wait(300);
          console.log(`[debug] [formHandler] Court number set to: ${formData.court}`);
        }
        break;
        
      case 'judge':
        if (formData.judge) {
          await page.select('#judge', formData.judge);
          await wait(300);
          console.log(`[debug] [formHandler] Judge set to: ${formData.judge}`);
        }
        break;
        
      case 'aor_code':
        if (formData.aorCode) {
          await page.type('#aor_code', formData.aorCode, { delay: 100 });
          await wait(300);
          console.log(`[debug] [formHandler] AOR Code set to: ${formData.aorCode}`);
        }
        break;
        
      case 'party_name':
        if (formData.partyName) {
          await page.type('#party_name', formData.partyName, { delay: 100 });
          await wait(300);
          console.log(`[debug] [formHandler] Party Name set to: ${formData.partyName}`);
        }
        break;
        
      case 'all_courts':
      default:
        // No additional fields needed
        console.log('[debug] [formHandler] No additional fields for searchBy: all_courts');
        break;
    }
  } catch (error) {
    console.log('[warning] [formHandler] Error handling dynamic fields:', error.message);
  }
};

/**
 * Validate form fields after filling
 * @param {Object} page - Page instance
 * @param {Object} formData - Form data object
 * @returns {Promise<boolean>} - Whether all fields are correct
 */
const validateFormFields = async (page, formData) => {
  try {
    // Fill Cause List Date
    await page.$eval('#causelist_date', (el, value) => { el.value = value; }, formData.causelistDate);
    console.log(`[info] [formHandler] Set Cause List Date: ${formData.causelistDate}`);
    // Select Cause List Type
    await page.select('#sess_state_code', formData.stateCourt);
    console.log(`[info] [formHandler] Selected Court State: ${formData.stateCourt}`);

    // Select Court Complex
    await page.select('#court_complex_code', formData.courtBench);
    console.log(`[info] [formHandler] Selected Court Bench: ${formData.courtBench}`);

  } catch (error) {
    console.error('[error] [formHandler] Error filling form:', error.message);
    throw error;
  }
};

/**
 * Handle captcha solving and submission
 * @param {Object} page - Page instance
 * @param {Function} solveCaptcha - Captcha solving function
 * @returns {Promise<void>}
 */
const handleCaptcha = async (page, solveCaptcha) => {
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[debug] [formHandler] Captcha attempt ${attempt}/${maxAttempts}`);
      
      // Handle captcha
      const imgEl = await page.waitForSelector('.siwp_captcha_image, .siwp_img, .captcha-img');
      
      const imgURL = await page.evaluate(el => el.src, imgEl);
      
      const { data } = await axios.get(imgURL, { responseType: 'arraybuffer' });

      const answer = await solveCaptcha(Buffer.from(data));
      console.log(`[info] [formHandler] Captcha solved: ${answer}`);
      
      console.log('[info] [formHandler] Typing captcha answer...');
      await page.type('#siwp_captcha_value_0', answer);
      await wait(600);
      console.log('[info] [formHandler] Captcha answer entered');
      
      // Try to submit and check if it worked
      await page.click('input[value="Search"]');
      await wait(3000);
      
      // Check if we got an error message or if the page reloaded with a new captcha
      const errorElement = await page.$('.notfound, .error, .alert-danger, .captcha-error');
      
      if (errorElement) {
        const errorText = await page.evaluate(el => el.textContent, errorElement);
        console.log(`[warning] [formHandler] Captcha error detected: ${errorText}`);
        if (attempt < maxAttempts) {
          console.log(`[info] [formHandler] Retrying captcha...`);
          continue;
        }
      }
      
      // If we reach here, captcha was successful
      console.log(`[success] [formHandler] Captcha solved successfully on attempt ${attempt}`);
      return;
      
    } catch (error) {
      console.error(`[error] [formHandler] Captcha attempt ${attempt} failed:`, error.message);
      if (attempt === maxAttempts) {
        throw new Error(`Captcha solving failed after ${maxAttempts} attempts: ${error.message}`);
      }
      await wait(2000); // Wait before retry
    }
  }
};

/**
 * Submit the form and wait for results
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const submitForm = async (page) => {
  // Form is already submitted in handleCaptcha, just wait for results
  console.log('[info] [formHandler] Form already submitted, waiting for results...');
  await wait(7000); // Reduced wait time since form was already submitted
  console.log('[info] [formHandler] Initial wait completed, checking for results...');
};

module.exports = {
  fillForm,
  validateFormFields,
  handleCaptcha,
  submitForm
};
