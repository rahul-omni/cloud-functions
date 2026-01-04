const { wait, convertDateFormat } = require('./utils');

/**
 * Fill the date in the datepicker field
 * @param {Object} page - Page instance
 * @param {string} date - Date in MM/DD/YYYY format
 * @returns {Promise<void>}
 */
const fillDate = async (page, date) => {
  try {
    console.log(`[info] [formHandler] Setting date using datepicker dropdown: ${date}`);
    
    // Check if form is hidden and show it if needed
    const formVisible = await page.evaluate(() => {
      const form = document.querySelector('#cause_list');
      if (form && form.style.display === 'none') {
        form.style.display = 'block';
        return true;
      }
      return false;
    });
    
    if (formVisible) {
      console.log('[info] [formHandler] Form was hidden, made it visible');
      await wait(1000);
    }
    
    // Wait for datepicker to be visible
    await page.waitForSelector('#datepicker', { visible: true, timeout: 120000 });
    await wait(2000); // Wait for datepicker to fully load
    
    // Wait for jQuery and datepicker to be ready
    console.log('[debug] [formHandler] Waiting for jQuery and datepicker to be ready...');
    await page.waitForFunction(() => {
      return typeof window.$ !== 'undefined' && 
             window.$('#datepicker').length > 0 &&
             window.$('#datepicker').datepicker !== undefined;
    }, { timeout: 120000 });
    
    console.log('[debug] [formHandler] jQuery and datepicker ready');
    
    // Convert date to DD/MM/YYYY format
    const formattedDate = convertDateFormat(date);
    console.log(`[debug] [formHandler] Original date: ${date}, Formatted date (DD/MM/YYYY): ${formattedDate}`);
    
    // Parse the date
    const dateParts = formattedDate.split('/');
    if (dateParts.length !== 3) {
      throw new Error(`Invalid date format: ${formattedDate}. Expected DD/MM/YYYY`);
    }
    
    const [day, month, year] = dateParts; // DD/MM/YYYY format
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    // Click on the datepicker to open the calendar dropdown
    console.log('[debug] [formHandler] Clicking on datepicker to open calendar...');
    await page.click('#datepicker');
    await wait(1000); // Wait for calendar to open
    
    // Wait for the calendar to appear
    await page.waitForSelector('.ui-datepicker-calendar', { visible: true, timeout: 10000 }).catch(() => {
      console.log('[warning] [formHandler] Calendar might not have opened, trying setDate API...');
    });
    
    // Use datepicker API to set the date (this will also open the calendar if needed)
    const dateSet = await page.evaluate((dayNum, monthNum, yearNum, formattedDate) => {
      const datepicker = document.getElementById('datepicker');
      if (!datepicker) return { success: false, reason: 'datepicker element not found' };
      
      // Use jQuery UI datepicker to set the date
      if (window.$ && window.$('#datepicker').datepicker) {
        try {
          // Create Date object (month is 0-indexed in JavaScript)
          const dateObj = new Date(yearNum, monthNum - 1, dayNum);
          
          // First, ensure we're on the correct month/year
          window.$('#datepicker').datepicker('setDate', dateObj);
          
          // Also update the hidden input field
          const t_f_date = document.querySelector('input[name="t_f_date"]');
          if (t_f_date) {
            t_f_date.value = formattedDate;
          }
          
          const setValue = datepicker.value;
          console.log('[page] Datepicker setDate result:', setValue);
          
          return { success: true, method: 'datepicker-api', value: setValue };
        } catch (e) {
          console.log('[page] Datepicker API error:', e.message);
          return { success: false, error: e.message };
        }
      }
      
      return { success: false, reason: 'jQuery or datepicker not available' };
    }, dayNum, monthNum, yearNum, formattedDate);
    
    // If API method didn't work, try clicking on the date in the calendar
    if (!dateSet.success || !dateSet.value || dateSet.value.trim() === '') {
      console.log('[debug] [formHandler] API method didn\'t work, trying to click date in calendar...');
      
      // Wait for calendar to be visible
      await page.waitForSelector('.ui-datepicker-calendar', { visible: true, timeout: 10000 });
      await wait(1000);
      
      // Navigate to the correct month/year if needed, then click the date
      const calendarClickResult = await page.evaluate((dayNum, monthNum, yearNum) => {
        // Find the calendar
        const calendar = document.querySelector('.ui-datepicker-calendar');
        if (!calendar) return { success: false, reason: 'Calendar not found' };
        
        // Check current month/year
        const monthYearHeader = document.querySelector('.ui-datepicker-month, .ui-datepicker-year');
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        // Navigate to correct month/year if needed
        if (monthNum !== currentMonth || yearNum !== currentYear) {
          // Click prev/next buttons to navigate
          // This is a simplified approach - might need more logic for year navigation
          const diff = (yearNum - currentYear) * 12 + (monthNum - currentMonth);
          // For now, use setDate API which handles navigation
          if (window.$ && window.$('#datepicker').datepicker) {
            const dateObj = new Date(yearNum, monthNum - 1, dayNum);
            window.$('#datepicker').datepicker('setDate', dateObj);
          }
        }
        
        // Find and click the date cell
        const dateCells = Array.from(calendar.querySelectorAll('td a, td.ui-state-default'));
        const targetCell = dateCells.find(cell => {
          const cellText = cell.textContent.trim();
          return cellText === String(dayNum) && !cell.classList.contains('ui-state-disabled');
        });
        
        if (targetCell) {
          targetCell.click();
          return { success: true, clicked: true };
        }
        
        return { success: false, reason: 'Date cell not found' };
      }, dayNum, monthNum, yearNum);
      
      console.log(`[debug] [formHandler] Calendar click result:`, JSON.stringify(calendarClickResult));
      await wait(1000);
    }
    
    console.log(`[debug] [formHandler] Date set result:`, JSON.stringify(dateSet));
    
    if (!dateSet.success) {
      throw new Error(`Failed to set date: ${dateSet.reason || dateSet.error}`);
    }
    
    // Wait for datepicker to process and sync
    console.log('[debug] [formHandler] Waiting 2 seconds for datepicker to sync...');
    await wait(2000);
    
    // Verify the date was set correctly in both fields
    const actualValues = await page.evaluate(() => {
      const datepicker = document.getElementById('datepicker');
      const t_f_date = document.querySelector('input[name="t_f_date"]');
      return {
        datepicker: datepicker ? datepicker.value : null,
        t_f_date: t_f_date ? t_f_date.value : null
      };
    });
    
    console.log(`[debug] [formHandler] Actual datepicker values:`, JSON.stringify(actualValues));
    
    // Ensure both fields have the correct value
    if (!actualValues.datepicker || actualValues.datepicker.trim() === '') {
      throw new Error('Date was not set in datepicker field');
    }
    
    // If t_f_date is missing or different, set it
    if (!actualValues.t_f_date || actualValues.t_f_date !== formattedDate) {
      console.log('[debug] [formHandler] Updating t_f_date field...');
      await page.evaluate((formattedDate) => {
        const t_f_date = document.querySelector('input[name="t_f_date"]');
        if (t_f_date) {
          t_f_date.value = formattedDate;
          if (window.$) {
            window.$(t_f_date).trigger('change');
          }
        }
      }, formattedDate);
      await wait(1000);
    }
    
    console.log(`[info] [formHandler] Date set successfully: ${formattedDate} (datepicker: ${actualValues.datepicker}, t_f_date: ${actualValues.t_f_date || 'N/A'})`);
    await wait(1000);
  } catch (error) {
    console.error('[error] [formHandler] Error filling date:', error.message);
    throw error;
  }
};

/**
 * Select list type from dropdown
 * @param {Object} page - Page instance
 * @param {string} listType - List type value (e.g., "All Cause Lists")
 * @returns {Promise<void>}
 */
const selectListType = async (page, listType = 'All Cause Lists') => {
  try {
    console.log(`[info] [formHandler] Selecting list type: ${listType}`);
    
    // Based on HTML source, the select name is "urg_ord" and "All Cause Lists" has value "1"
    // Try to find the select by name first
    const selectors = [
      'select[name="urg_ord"]',
      'select[name*="urg"]',
      'select[name*="ord"]',
      'select'
    ];
    
    let dropdownFound = false;
    for (const selector of selectors) {
      try {
        console.log(`[debug] [formHandler] Trying selector: ${selector}`);
        await page.waitForSelector(selector, { visible: true, timeout: 10000 }); // 10 seconds
        const element = await page.$(selector);
        if (element) {
          console.log(`[debug] [formHandler] Found element with selector: ${selector}`);
          // Try to select by visible text first
          try {
            await page.select(selector, listType);
            // Verify it was selected
            const selectedValue = await page.evaluate((sel) => {
              const select = document.querySelector(sel);
              return select ? select.value : null;
            }, selector);
            if (selectedValue) {
              dropdownFound = true;
              console.log(`[info] [formHandler] Selected list type using selector: ${selector} by text, value: ${selectedValue}`);
              break;
            }
          } catch (e) {
            // If that fails, try to find by option text and set value
            const selected = await page.evaluate((selector, text) => {
              const select = document.querySelector(selector);
              if (!select) return false;
              
              const options = Array.from(select.options);
              const matchingOption = options.find(opt => 
                opt.textContent.trim() === text || 
                opt.textContent.trim().includes(text) ||
                text.includes(opt.textContent.trim())
              );
              
              if (matchingOption) {
                select.value = matchingOption.value;
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
                // Also trigger jQuery change if available
                if (window.$) {
                  window.$(select).trigger('change');
                }
                return { success: true, value: matchingOption.value, text: matchingOption.textContent.trim() };
              }
              return false;
            }, selector, listType);
            
            if (selected && selected.success) {
              console.log(`[info] [formHandler] Selected list type: ${selected.text} (value: ${selected.value})`);
              dropdownFound = true;
              break;
            }
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
    
    if (!dropdownFound) {
      console.log('[warning] [formHandler] Could not find list type dropdown, will use default value "1" (All Cause Lists) in AJAX call');
      // Log all select elements on the page for debugging
      const allSelects = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(sel => ({
          name: sel.name,
          id: sel.id,
          className: sel.className,
          value: sel.value,
          options: Array.from(sel.options).map(opt => ({ text: opt.textContent.trim(), value: opt.value }))
        }));
      });
      console.log(`[debug] [formHandler] All select elements on page:`, JSON.stringify(allSelects, null, 2));
    }
    
    console.log('[debug] [formHandler] List type selected, waiting 1 second...');
    await wait(1000);
  } catch (error) {
    console.error('[error] [formHandler] Error selecting list type:', error.message);
    // Don't throw - list type might be optional
  }
};

/**
 * Click the "View CL" button
 * @param {Object} page - Page instance
 * @param {string} expectedDate - The date value that should be in the form
 * @returns {Promise<void>}
 */
const clickViewCLButton = async (page, expectedDate) => {
  try {
    console.log('[info] [formHandler] Submitting form via direct AJAX call...');
    
    // Don't set up request interception - it's already set up in browserManager
    // We'll use direct AJAX submission instead of clicking the button
    
    // Verify date is in the form before clicking
    const formCheck = await page.evaluate((date) => {
      const datepicker = document.getElementById('datepicker');
      const t_f_date = document.querySelector('input[name="t_f_date"]');
      const form = document.querySelector('#cause_list');
      
      // Ensure date is set
      if (datepicker && datepicker.value !== date) {
        datepicker.value = date;
        if (window.$) {
          window.$('#datepicker').trigger('change');
        }
      }
      
      if (t_f_date && t_f_date.value !== date) {
        t_f_date.value = date;
      }
      
      // Get serialized form data
      let serialized = '';
      if (form && window.$) {
        serialized = window.$(form).serialize();
      }
      
      return {
        datepickerValue: datepicker ? datepicker.value : null,
        t_f_dateValue: t_f_date ? t_f_date.value : null,
        serializedForm: serialized
      };
    }, expectedDate);
    
    console.log('[debug] [formHandler] Form values before button click:', JSON.stringify(formCheck, null, 2));
    
    if (!formCheck.datepickerValue || formCheck.datepickerValue.trim() === '') {
      throw new Error(`Date is empty in datepicker before button click. Expected: ${expectedDate}`);
    }
    
    // Instead of clicking the button, directly submit the form via AJAX with correct data
    console.log('[debug] [formHandler] Submitting form directly via AJAX...');
    const ajaxResult = await page.evaluate((date) => {
      return new Promise((resolve) => {
        const form = document.querySelector('#cause_list');
        const datepicker = document.getElementById('datepicker');
        const select = document.querySelector('select[name="urg_ord"]');
        
        // Ensure all fields are set
        if (datepicker) {
          datepicker.value = date;
          if (window.$) {
            window.$('#datepicker').trigger('change');
          }
        }
        
        // Get list type value - "All Cause Lists" has value "1"
        let listTypeValue = '1'; // Default to "All Cause Lists"
        if (select) {
          listTypeValue = select.value || '1';
          // If value is empty, find "All Cause Lists" option
          if (!listTypeValue || listTypeValue === '' || listTypeValue === '0') {
            const options = Array.from(select.options);
            const allCauseListsOption = options.find(opt => 
              opt.textContent.trim().includes('All Cause Lists') ||
              opt.textContent.trim() === 'All Cause Lists'
            );
            if (allCauseListsOption) {
              listTypeValue = allCauseListsOption.value || '1';
              select.value = listTypeValue;
            }
          }
        }
        
        console.log('[page] List type value to send:', listTypeValue);
        
        // Always use manual serialization to ensure both fields are included
        // Don't rely on form.serialize() as it might miss fields
        const formData = `t_f_date=${encodeURIComponent(date)}&urg_ord=${encodeURIComponent(listTypeValue)}`;
        const fullData = formData + '&action=show_causeList';
        console.log('[page] Full form data to send:', fullData);
        
        console.log('[page] Form data to send:', fullData);
        
        // Submit via AJAX directly
        if (window.$ && window.$.ajax) {
          window.$.ajax({
            url: 'view_causeList.php',
            type: 'POST',
            data: fullData,
            beforeSend: function() {
              const waitDiv = document.getElementById('wait');
              if (waitDiv) waitDiv.style.display = 'block';
            },
            complete: function() {
              const waitDiv = document.getElementById('wait');
              if (waitDiv) waitDiv.style.display = 'none';
            },
            success: function(result) {
              console.log('[page] AJAX success, result length:', result ? result.length : 0);
              const splitresponse = result.split('!~~!');
              if (splitresponse[0] == 1) {
                const formEl = document.querySelector('#cause_list');
                if (formEl) formEl.style.display = 'none';
                const mainLinks = document.querySelectorAll('.main_links');
                mainLinks.forEach(el => el.style.display = 'none');
                const showCauseList = document.getElementById('show_causeList');
                if (showCauseList) {
                  showCauseList.innerHTML = splitresponse[1];
                  showCauseList.style.display = 'block';
                }
              }
              resolve({ success: true, resultLength: result ? result.length : 0 });
            },
            error: function(xhr, status, error) {
              console.log('[page] AJAX error:', status, error);
              resolve({ success: false, error: error });
            }
          });
        } else {
          resolve({ error: 'jQuery not available' });
        }
      });
    }, expectedDate);
    
    console.log('[debug] [formHandler] Direct AJAX submission result:', JSON.stringify(ajaxResult, null, 2));
    
    if (!ajaxResult.success) {
      throw new Error(`Direct AJAX submission failed: ${ajaxResult.error || 'Unknown error'}`);
    }
    
    // Wait for AJAX to complete and DOM to update
    console.log('[debug] [formHandler] Waiting 5 seconds for AJAX response and DOM update...');
    await wait(5000);
    
    // Verify the form was submitted by checking if AJAX completed
    const ajaxStatus = await page.evaluate(() => {
      const showCauseList = document.querySelector('#show_causeList');
      return {
        exists: !!showCauseList,
        visible: showCauseList ? showCauseList.offsetParent !== null : false,
        contentLength: showCauseList ? showCauseList.innerHTML.length : 0,
        hasTable: showCauseList ? !!showCauseList.querySelector('table#tables11') : false
      };
    });
    
    console.log(`[debug] [formHandler] AJAX status after direct submission:`, JSON.stringify(ajaxStatus, null, 2));
    
    if (ajaxStatus.contentLength < 100) {
      console.log('[warning] [formHandler] AJAX response seems too short, might be an error message');
    } else {
      console.log('[info] [formHandler] Form submitted successfully via direct AJAX - waiting for results...');
    }
    // Note: The actual AJAX completion will be waited for in waitForResults()
  } catch (error) {
    console.error('[error] [formHandler] Error clicking View CL button:', error.message);
    throw error;
  }
};

/**
 * Fill the form with date and list type, then submit
 * @param {Object} page - Page instance
 * @param {Object} formData - Form data object containing date and listType
 * @returns {Promise<void>}
 */
const fillForm = async (page, formData) => {
  try {
    const { date, listType } = formData;
    
    // Fill date
    if (date) {
      await fillDate(page, date);
      
      // Verify date is set before proceeding
      const dateValue = await page.evaluate(() => {
        const datepicker = document.getElementById('datepicker');
        return datepicker ? datepicker.value : null;
      });
      
      if (!dateValue || dateValue.trim() === '') {
        throw new Error('Date was not set in datepicker field. Cannot proceed with form submission.');
      }
      
      console.log(`[debug] [formHandler] Verified date value in field: ${dateValue}`);
    } else {
      throw new Error('Date is required but not provided');
    }
    
    // Select list type if provided
    if (listType) {
      await selectListType(page, listType);
    }
    
    // Verify form data one more time before clicking
    // Also ensure the form field name="t_f_date" has the value
    // Get the current date value from the datepicker
    const currentDateValue = await page.evaluate(() => {
      const datepicker = document.getElementById('datepicker');
      return datepicker ? datepicker.value : null;
    });
    
    const formDataCheck = await page.evaluate((expectedDate) => {
      const datepicker = document.getElementById('datepicker');
      const t_f_date = document.querySelector('input[name="t_f_date"]');
      const select = document.querySelector('select[name="urg_ord"]');
      const form = document.querySelector('#cause_list');
      
      // Ensure both the datepicker and t_f_date field have the value
      if (datepicker && datepicker.value !== expectedDate) {
        datepicker.value = expectedDate;
        if (window.$) {
          window.$(datepicker).trigger('change');
        }
      }
      
      if (t_f_date && t_f_date !== datepicker && t_f_date.value !== expectedDate) {
        t_f_date.value = expectedDate;
        if (window.$) {
          window.$(t_f_date).trigger('change');
        }
      }
      
      // Test form serialization
      let serialized = '';
      if (form && window.$) {
        try {
          serialized = window.$(form).serialize();
        } catch (e) {
          serialized = 'serialize failed: ' + e.message;
        }
      }
      
      return {
        date: datepicker ? datepicker.value : null,
        t_f_date: t_f_date ? t_f_date.value : null,
        datepickerVisible: datepicker ? datepicker.offsetParent !== null : false,
        listType: select ? select.value : null,
        listTypeText: select ? select.options[select.selectedIndex]?.textContent : null,
        formVisible: form ? form.style.display !== 'none' : false,
        formSerialized: serialized
      };
    }, currentDateValue);
    
    console.log(`[debug] [formHandler] Form data before submission:`, JSON.stringify(formDataCheck, null, 2));
    
    // If date is still not set, throw an error
    if (!formDataCheck.date || formDataCheck.date.trim() === '') {
      throw new Error(`Date was not set in datepicker. Current value: "${formDataCheck.date}". Form visible: ${formDataCheck.formVisible}`);
    }
    
    // Log the serialized form data to see what will be sent
    if (formDataCheck.formSerialized) {
      console.log(`[debug] [formHandler] Form will serialize as: ${formDataCheck.formSerialized}`);
    }
    
    // Click View CL button (pass the date value - reuse currentDateValue from above)
    await clickViewCLButton(page, currentDateValue);
    
    console.log('[info] [formHandler] Form filled and submitted successfully');
  } catch (error) {
    console.error('[error] [formHandler] Error filling form:', error.message);
    throw error;
  }
};

module.exports = {
  fillForm,
  fillDate,
  selectListType,
  clickViewCLButton
};

