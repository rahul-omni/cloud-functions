const axios = require('axios');
const { wait, digits } = require('./utils');

/**
 * Fill the cause list form with provided parameters
 * @param {Object} page - Page instance
 * @param {Object} formData - Object containing all form data
 * @returns {Promise<void>}
 */
const fillForm = async (page, formData) => {
  console.log('[info] [formHandler] Starting form field population...');
  
  try {
    // 1. List Type - affects which causelist_type options are shown
    if (formData.listType) {
      await page.click(`input[name="list_type"][value="${formData.listType}"]`);
      await wait(300);
      console.log(`[debug] [formHandler] List Type set to: ${formData.listType}`);
    }
    
    // 2. Search By - determines which additional fields are shown
    if (formData.searchBy) {
      await page.select('#search_by', formData.searchBy);
      await wait(500); // Wait for dynamic fields to appear
      console.log(`[debug] [formHandler] Search By set to: ${formData.searchBy}`);
    }
    
    // 3. Handle dynamic fields based on searchBy selection
    await handleDynamicFields(page, formData);
    
    // 4. Causelist Type - handle different options based on listType
    if (formData.causelistType) {
      if (formData.listType === 'daily') {
        await page.select('.daily #causelist_type', formData.causelistType);
      } else {
        await page.select('.other #causelist_type', formData.causelistType);
      }
      await wait(300);
      console.log(`[debug] [formHandler] Causelist Type set to: ${formData.causelistType}`);
    }
    
    // 5. Main/Supplementary
    if (formData.mainAndSupplementry) {
      await page.click(`input[name="msb"][value="${formData.mainAndSupplementry}"]`);
      await wait(300);
      console.log(`[debug] [formHandler] Main/Supplementary set to: ${formData.mainAndSupplementry}`);
    }
    
    // 6. Date field
    if (formData.listingDate) {
      await page.click('#listing_date', { clickCount: 3 });
      await page.type('#listing_date', digits(formData.listingDate), { delay: 100 });
      await wait(800);
      console.log(`[debug] [formHandler] Date set to: ${formData.listingDate}`);
    }
    
    // 7. Handle date range fields if they exist
    if (formData.listingDateFrom) {
      await page.click('#listing_date_from', { clickCount: 3 });
      await page.type('#listing_date_from', digits(formData.listingDateFrom), { delay: 100 });
      await wait(300);
      console.log(`[debug] [formHandler] From Date set to: ${formData.listingDateFrom}`);
    }
    
    if (formData.listingDateTo) {
      await page.click('#listing_date_to', { clickCount: 3 });
      await page.type('#listing_date_to', digits(formData.listingDateTo), { delay: 100 });
      await wait(300);
      console.log(`[debug] [formHandler] To Date set to: ${formData.listingDateTo}`);
    }
    
    console.log('[success] [formHandler] Form fields filled successfully');
    
  } catch (formError) {
    console.log('[warning] [formHandler] Some form fields could not be filled, continuing with defaults:', formError.message);
    console.log('[debug] [formHandler] Form error details:', formError);
    
    // Continue with just the date field if other fields fail
    if (formData.listingDate) {
      console.log('[debug] [formHandler] Attempting to set only the date field...');
      await page.click('#listing_date', { clickCount: 3 });
      await page.type('#listing_date', digits(formData.listingDate), { delay: 100 });
      await wait(800);
      console.log('[debug] [formHandler] Date field set as fallback');
    }
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
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[debug] [formHandler] Captcha attempt ${attempt}/${maxAttempts}`);
      
      // Handle captcha
      const imgEl = await page.waitForSelector('.siwp_img, .captcha-img');
      
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
