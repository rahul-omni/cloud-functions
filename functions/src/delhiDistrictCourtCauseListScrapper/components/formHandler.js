const axios = require('axios');
const { wait, digits } = require('./utils');

/**
 * Fill the cause list form with provided parameters
 * @param {Object} page - Page instance
 * @param {Object} formData - Object containing all form data
 * @param {string} type - Type of cause list (civil or criminal)
 * @returns {Promise<void>}
 */
const fillForm = async (page, formData) => {
  console.log("[info] Filling form…");

  try {
    // 1. Select Court Complex + trigger API load
    if (formData.courtComplex) {
      await page.evaluate((text) => {
        const select = document.querySelector("#est_code");
        if (!select) return;

        const option = [...select.options].find(opt =>
          opt.text.trim().includes(text.trim())
        );

        if (option) {
          select.value = option.value;

          // 🔥 very important (loads court list from API)
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, formData.courtComplex);

      console.log("[debug] Court Complex selected:", formData.courtComplex);
    }

    // 2. WAIT for court list to refresh AFTER complex selection
    await page.waitForFunction(() => {
      const courtSelect = document.querySelector("#court");
      return courtSelect && !courtSelect.disabled && courtSelect.options.length > 1;
    }, { timeout: 8000 });

    console.log("[debug] Court dropdown updated after selecting complex");

    // 3. Select Court
    if (formData.courtNumber) {
      await page.evaluate(({ selector, text }) => {
        const sel = document.querySelector(selector);
        if (!sel) return;

        const option = [...sel.options].find(opt =>
          opt.text.trim().includes(text.trim())
        );

        if (option) sel.value = option.value;
      }, { selector: "#court", text: formData.courtNumber });

      console.log("[debug] Court selected:", formData.courtNumber);
    }

    // 4. Date field
    if (formData.causeListDate) {

      // Try clicking & clearing first
      await page.click("#date", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");

      // Now set via JS (works even for read-only fields)
      await page.evaluate((val) => {
        const el = document.querySelector("#date");
        if (!el) return;

        el.value = val;

        // 🔥 Trigger necessary events so site accepts the date
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }, formData.causeListDate);

      console.log("[debug] Date filled:", formData.causeListDate);
    }

  } catch (err) {
    console.log("[error] Failed to fill form:", err);
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
    // Check List Type
    const selectedListType = await page.evaluate(() => {
      const checkedRadio = document.querySelector('input[name="list_type"]:checked');
      return checkedRadio ? checkedRadio.value : null;
    });
    console.log(`[debug] [formHandler] List Type verification: ${selectedListType} (expected: ${formData.listType})`);

    // Check Search By
    const selectedSearchBy = await page.evaluate(() => {
      const select = document.querySelector('#search_by');
      return select ? select.value : null;
    });
    console.log(`[debug] [formHandler] Search By verification: ${selectedSearchBy} (expected: ${formData.searchBy})`);

    // Check Causelist Type
    const selectedCauselistType = await page.evaluate(() => {
      const select = document.querySelector('#causelist_type');
      return select ? select.value : null;
    });
    console.log(`[debug] [formHandler] Causelist Type verification: ${selectedCauselistType} (expected: ${formData.causelistType})`);

    // Check Main/Supplementary
    const selectedMsb = await page.evaluate(() => {
      const checkedRadio = document.querySelector('input[name="msb"]:checked');
      return checkedRadio ? checkedRadio.value : null;
    });
    console.log(`[debug] [formHandler] Main/Supplementary verification: ${selectedMsb} (expected: ${formData.mainAndSupplementry})`);

    // Check Date field
    const selectedDate = await page.evaluate(() => {
      const input = document.querySelector('#listing_date');
      return input ? input.value : null;
    });
    console.log(`[debug] [formHandler] Date verification: ${selectedDate} (expected: ${formData.listingDate})`);

    // Validate dynamic fields based on searchBy
    let dynamicFieldsCorrect = true;
    if (formData.searchBy === 'court' && formData.court) {
      const selectedCourt = await page.evaluate(() => {
        const select = document.querySelector('#court');
        return select ? select.value : null;
      });
      dynamicFieldsCorrect = selectedCourt === formData.court;
      console.log(`[debug] [formHandler] Court verification: ${selectedCourt} (expected: ${formData.court})`);
    }

    // Overall validation
    const allFieldsCorrect =
      selectedListType === formData.listType &&
      selectedSearchBy === formData.searchBy &&
      selectedCauselistType === formData.causelistType &&
      selectedMsb === formData.mainAndSupplementry &&
      selectedDate === formData.listingDate &&
      dynamicFieldsCorrect;

    if (allFieldsCorrect) {
      console.log('[success] [formHandler] All form fields are correctly set!');
    } else {
      console.log('[warning] [formHandler] Some form fields may not be set correctly');
    }

    return allFieldsCorrect;

  } catch (error) {
    console.log('[warning] [formHandler] Error during field validation:', error.message);
    return false;
  }
};

/**
 * Handle captcha solving and submission
 * @param {Object} page - Page instance
 * @param {Function} solveCaptcha - Captcha solving function
 * @returns {Promise<void>}
 */
const handleCaptcha = async (page, solveCaptcha) => {
  const maxAttempts = 5;

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
      const errorElement = await page.$('.error, .alert-danger, .captcha-error');

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
