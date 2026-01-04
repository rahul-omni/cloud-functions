const { wait } = require('./utils');

/**
 * Fill date using dropdowns (day, month, year)
 * @param {Object} page - Page instance
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format
 * @returns {Promise<void>}
 */
const fillDate = async (page, date) => {
  console.log(`[info] [formHandler] Setting date: ${date}`);
  
  // Parse date
  let day, month, year;
  if (date.includes('/')) {
    [day, month, year] = date.split('/');
  } else if (date.includes('-')) {
    [day, month, year] = date.split('-');
  } else {
    throw new Error(`Invalid date format: ${date}. Expected DD/MM/YYYY or DD-MM-YYYY`);
  }
  
  // Remove leading zeros
  day = parseInt(day, 10).toString();
  month = parseInt(month, 10).toString();
  year = parseInt(year, 10).toString();
  
  console.log(`[debug] [formHandler] Parsed date - Day: ${day}, Month: ${month}, Year: ${year}`);
  
  // Wait for form to be ready
  await page.waitForSelector('#causelist-form', { visible: true, timeout: 120000 });
  await wait(1000);
  
  // Select day
  await page.waitForSelector('#day', { visible: true, timeout: 60000 });
  await page.select('#day', day);
  console.log(`[info] [formHandler] Selected day: ${day}`);
  await wait(500);
  
  // Select month
  await page.waitForSelector('#month', { visible: true, timeout: 60000 });
  await page.select('#month', month);
  console.log(`[info] [formHandler] Selected month: ${month}`);
  await wait(500);
  
  // Select year
  await page.waitForSelector('#year', { visible: true, timeout: 60000 });
  await page.select('#year', year);
  console.log(`[info] [formHandler] Selected year: ${year}`);
  await wait(1000);
  
  // Verify selections
  const selectedValues = await page.evaluate(() => {
    return {
      day: document.getElementById('day').value,
      month: document.getElementById('month').value,
      year: document.getElementById('year').value
    };
  });
  
  console.log(`[debug] [formHandler] Verified selections:`, JSON.stringify(selectedValues));
  
  if (selectedValues.day !== day || selectedValues.month !== month || selectedValues.year !== year) {
    throw new Error(`Date selection mismatch. Expected: ${day}/${month}/${year}, Got: ${selectedValues.day}/${selectedValues.month}/${selectedValues.year}`);
  }
  
  console.log(`[info] [formHandler] Date set successfully: ${day}/${month}/${year}`);
};

/**
 * Submit the form
 * @param {Object} page - Page instance
 * @returns {Promise<void>}
 */
const submitForm = async (page) => {
  console.log('[info] [formHandler] Submitting form...');
  
  // Wait for form and submit button
  await page.waitForSelector('#causelist-form', { visible: true, timeout: 60000 });
  await page.waitForSelector('button[type="submit"]', { visible: true, timeout: 60000 });
  
  // Submit form
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 300000 }), // Wait for navigation
    page.click('button[type="submit"]') // Click submit button
  ]);
  
  console.log('[info] [formHandler] Form submitted successfully');
  await wait(3000); // Wait for results to load
};

/**
 * Fill form and submit
 * @param {Object} page - Page instance
 * @param {Object} formData - Form data containing date
 * @returns {Promise<void>}
 */
const fillForm = async (page, formData) => {
  try {
    const { date } = formData;
    if (!date) {
      throw new Error('Date is required but not provided');
    }
    
    await fillDate(page, date);
    await submitForm(page);
    
    console.log('[info] [formHandler] Form filled and submitted successfully');
  } catch (error) {
    console.error('[error] [formHandler] Error filling form:', error.message);
    throw error;
  }
};

module.exports = { fillForm, fillDate, submitForm };

