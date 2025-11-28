/**
 * Form handling for NCLT cause list scraping
 */

/**
 * Fill the NCLT cause list form with provided data
 * @param {Object} page - Puppeteer page instance
 * @param {Object} formData - Form data containing bench, date, etc.
 * @returns {Promise<boolean>} - Success status
 */
async function fillForm(page, formData) {
    console.log('[info] [formHandler] Starting form filling with data:', formData);
    
    try {
        // Wait for the page to be fully loaded
        await page.waitForSelector('form', { timeout: 10000 });
        
        // Look specifically for the cause list form, not the search form
        const causeListFormFound = await page.evaluate(() => {
            // Find the form that contains the actual cause list fields
            const forms = document.querySelectorAll('form');
            for (let form of forms) {
                // Check if this form has the specific NCLT cause list fields
                const hasBenchField = !!form.querySelector('select[name*="field_nclt_benches_list"]');
                const hasDateField = !!form.querySelector('input[name*="field_cause_date_value"]');
                
                if (hasBenchField && hasDateField) {
                    console.log('[debug] Found cause list form with action:', form.action);
                    return true;
                }
            }
            return false;
        });
        
        if (!causeListFormFound) {
            console.log('[error] [formHandler] ❌ Could not find the cause list form with correct field names');
            
            // Debug: Log all forms and their fields
            const formsDebug = await page.evaluate(() => {
                const forms = document.querySelectorAll('form');
                const formsInfo = [];
                forms.forEach((form, index) => {
                    const inputs = Array.from(form.querySelectorAll('input')).map(inp => ({name: inp.name, type: inp.type}));
                    const selects = Array.from(form.querySelectorAll('select')).map(sel => ({name: sel.name}));
                    formsInfo.push({
                        index,
                        action: form.action,
                        method: form.method,
                        inputs,
                        selects
                    });
                });
                return formsInfo;
            });
            
            console.log('[debug] [formHandler] All forms on page:', JSON.stringify(formsDebug, null, 2));
            return false;
        }
        
        console.log('[info] [formHandler] ✅ Found cause list form with correct field names');
        
        // Fill bench/court selection using the correct field name
        if (formData.bench) {
            console.log(`[info] [formHandler] Selecting bench: ${formData.bench}`);
            
            // Target the specific NCLT bench field
            const benchSelector = 'select[name*="field_nclt_benches_list"]';
            
            try {
                await page.waitForSelector(benchSelector, { timeout: 5000 });
                
                const options = await page.evaluate(selector => {
                    const select = document.querySelector(selector);
                    if (!select) return [];
                    return Array.from(select.options).map(opt => ({
                        value: opt.value,
                        text: opt.text.trim()
                    }));
                }, benchSelector);
                
                console.log(`[debug] [formHandler] Found ${options.length} bench options`);
                console.log(`[debug] [formHandler] Looking for bench: "${formData.bench}"`);
                
                // Find exact matching bench option
                const matchingOption = options.find(opt => {
                    const optText = opt.text.toLowerCase().trim();
                    const searchBench = formData.bench.toLowerCase().trim();
                    
                    console.log(`[debug] [formHandler] Checking option: "${opt.text}" (value: ${opt.value})`);
                    
                    // First try exact match
                    if (optText === searchBench) {
                        console.log(`[debug] [formHandler] ✅ Exact match found: ${opt.text}`);
                        return true;
                    }
                    
                    // For Ahmedabad benches, check for exact court number match
                    if (searchBench.includes('ahmedabad') && optText.includes('ahmedabad')) {
                        // Extract court number from both strings
                        const searchCourtMatch = searchBench.match(/court-?(\w+)/i);
                        const optCourtMatch = optText.match(/court-?(\w+)/i);
                        
                        console.log(`[debug] [formHandler] Ahmedabad match - Search: ${searchCourtMatch?.[1]}, Option: ${optCourtMatch?.[1]}`);
                        
                        if (searchCourtMatch && optCourtMatch) {
                            const isMatch = searchCourtMatch[1].toLowerCase() === optCourtMatch[1].toLowerCase();
                            if (isMatch) {
                                console.log(`[debug] [formHandler] ✅ Court number match found: ${opt.text}`);
                            }
                            return isMatch;
                        }
                    }
                    
                    // Fallback to general matching
                    const fallbackMatch = optText.includes(searchBench);
                    if (fallbackMatch) {
                        console.log(`[debug] [formHandler] ⚠️ Fallback match found: ${opt.text}`);
                    }
                    return fallbackMatch;
                });
                
                if (matchingOption) {
                    await page.select(benchSelector, matchingOption.value);
                    
                    // Wait a bit and verify the selection
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Verify the selection took effect
                    const selectedValue = await page.evaluate(selector => {
                        const select = document.querySelector(selector);
                        return select ? select.value : null;
                    }, benchSelector);
                    
                    console.log(`[info] [formHandler] ✅ Selected bench: ${matchingOption.text} (value: ${selectedValue})`);
                    
                    if (selectedValue !== matchingOption.value) {
                        console.log(`[warn] [formHandler] ⚠️ Bench selection verification failed. Expected: ${matchingOption.value}, Got: ${selectedValue}`);
                        // Try selecting again
                        await page.select(benchSelector, matchingOption.value);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } else {
                    console.log(`[warn] [formHandler] ⚠️  Could not find matching bench for: ${formData.bench}`);
                    console.log('[debug] Available benches:', options.map(opt => `"${opt.text}" (${opt.value})`));
                    return false;
                }
            } catch (error) {
                console.log(`[error] [formHandler] ❌ Failed to select bench: ${error.message}`);
                return false;
            }
        }
        
        // Fill dates using the correct field names
        if (formData.causeListDate) {
            console.log(`[info] [formHandler] Filling dates with: ${formData.causeListDate}`);
            
            // Convert YYYY-MM-DD to MM/DD/YYYY format (US format for NCLT)
            const dateParts = formData.causeListDate.split('-');
            const formattedDate = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`;
            console.log(`[info] [formHandler] Converted date format: ${formattedDate}`);
            
            // Fill start date (field_cause_date_value)
            try {
                const startDateSelector = 'input[name*="field_cause_date_value"]:not([name*="field_cause_date_value_1"])';
                await page.waitForSelector(startDateSelector, { timeout: 5000 });
                
                // Clear field first
                await page.focus(startDateSelector);
                await page.evaluate((selector) => {
                    const field = document.querySelector(selector);
                    field.value = '';
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }, startDateSelector);
                
                // Wait a bit and then type the date
                await new Promise(resolve => setTimeout(resolve, 500));
                await page.type(startDateSelector, formattedDate, { delay: 100 });
                
                // Trigger change event
                await page.evaluate((selector) => {
                    const field = document.querySelector(selector);
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    field.dispatchEvent(new Event('blur', { bubbles: true }));
                }, startDateSelector);
                
                console.log(`[info] [formHandler] ✅ Start date filled: ${formattedDate}`);
            } catch (error) {
                console.log(`[error] [formHandler] ❌ Failed to fill start date: ${error.message}`);
                return false;
            }
            
            // Fill end date (field_cause_date_value_1)
            try {
                const endDateSelector = 'input[name*="field_cause_date_value_1"]';
                await page.waitForSelector(endDateSelector, { timeout: 5000 });
                
                // Clear field first
                await page.focus(endDateSelector);
                await page.evaluate((selector) => {
                    const field = document.querySelector(selector);
                    field.value = '';
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }, endDateSelector);
                
                // Wait a bit and then type the date
                await new Promise(resolve => setTimeout(resolve, 500));
                await page.type(endDateSelector, formattedDate, { delay: 100 });
                
                // Trigger change event
                await page.evaluate((selector) => {
                    const field = document.querySelector(selector);
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    field.dispatchEvent(new Event('blur', { bubbles: true }));
                }, endDateSelector);
                
                console.log(`[info] [formHandler] ✅ End date filled: ${formattedDate}`);
            } catch (error) {
                console.log(`[error] [formHandler] ❌ Failed to fill end date: ${error.message}`);
                return false;
            }
        }
        
        // Final verification of form fields before completion
        console.log('[info] [formHandler] 🔍 Verifying form fields before submission...');
        
        const verification = await page.evaluate(() => {
            const benchSelect = document.querySelector('select[name*="field_nclt_benches_list"]');
            const startDateInput = document.querySelector('input[name*="field_cause_date_value"]:not([name*="field_cause_date_value_1"])');
            const endDateInput = document.querySelector('input[name*="field_cause_date_value_1"]');
            
            return {
                benchValue: benchSelect ? benchSelect.value : null,
                benchText: benchSelect ? benchSelect.options[benchSelect.selectedIndex]?.text : null,
                startDate: startDateInput ? startDateInput.value : null,
                endDate: endDateInput ? endDateInput.value : null
            };
        });
        
        console.log('[debug] [formHandler] Form verification result:', verification);
        
        // Check if any critical fields are missing
        if (!verification.benchValue || verification.benchValue === 'All') {
            console.log('[error] [formHandler] ❌ Bench selection failed - value is "All" or null');
            return false;
        }
        
        if (!verification.startDate || !verification.endDate) {
            console.log('[error] [formHandler] ❌ Date fields are empty');
            return false;
        }
        
        console.log(`[info] [formHandler] ✅ Form verification passed - Bench: "${verification.benchText}" (${verification.benchValue}), Dates: ${verification.startDate} to ${verification.endDate}`);

        console.log('[info] [formHandler] ✅ Form filling completed successfully');
        return true;
        
    } catch (error) {
        console.error('[error] [formHandler] Form filling failed:', error.message);
        return false;
    }
}

/**
 * Submit form and wait for results
 * @param {Object} page - Puppeteer page instance
 * @returns {Promise<boolean>} - Success status
 */
async function submitFormAndWaitForResults(page) {
    console.log('[info] [formHandler] Submitting form and waiting for results');
    
    try {
        // Find and submit the correct cause list form (not the search form)
        const submitResult = await page.evaluate(() => {
            // Find the cause list form specifically
            const forms = document.querySelectorAll('form');
            let causeListForm = null;
            
            for (let form of forms) {
                const hasBenchField = !!form.querySelector('select[name*="field_nclt_benches_list"]');
                const hasDateField = !!form.querySelector('input[name*="field_cause_date_value"]');
                
                if (hasBenchField && hasDateField) {
                    causeListForm = form;
                    break;
                }
            }
            
            if (!causeListForm) {
                return { success: false, error: 'Cause list form not found' };
            }
            
            // Find submit button in the cause list form
            const submitButton = causeListForm.querySelector('input[type="submit"], button[type="submit"]');
            
            if (submitButton) {
                return { 
                    success: true, 
                    action: causeListForm.action,
                    method: causeListForm.method,
                    submitButtonText: submitButton.value || submitButton.textContent
                };
            }
            
            return { success: false, error: 'Submit button not found in cause list form' };
        });
        
        if (!submitResult.success) {
            console.log(`[error] [formHandler] ❌ ${submitResult.error}`);
            return false;
        }
        
        console.log(`[info] [formHandler] ✅ Found cause list form - Action: ${submitResult.action}, Method: ${submitResult.method}`);
        console.log(`[info] [formHandler] Submit button text: ${submitResult.submitButtonText}`);
        
        // Set up navigation promise before form submission
        const navigationPromise = page.waitForNavigation({ 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Click the submit button in the cause list form
        await page.evaluate(() => {
            const forms = document.querySelectorAll('form');
            let causeListForm = null;
            
            for (let form of forms) {
                const hasBenchField = !!form.querySelector('select[name*="field_nclt_benches_list"]');
                const hasDateField = !!form.querySelector('input[name*="field_cause_date_value"]');
                
                if (hasBenchField && hasDateField) {
                    causeListForm = form;
                    break;
                }
            }
            
            if (causeListForm) {
                const submitButton = causeListForm.querySelector('input[type="submit"], button[type="submit"]');
                if (submitButton) {
                    submitButton.click();
                    return true;
                }
            }
            return false;
        });
        
        console.log('[info] [formHandler] ✅ Clicked submit button, waiting for navigation...');
        
        // Wait for navigation to complete
        await navigationPromise;
        
        const currentUrl = page.url();
        console.log(`[info] [formHandler] Navigation completed - Current URL: ${currentUrl}`);
        
        // Check if we're on the correct results page
        if (currentUrl.includes('field_nclt_benches_list_target_id') || 
            currentUrl.includes('field_cause_date_value') ||
            currentUrl.includes('all-couse-list')) {
            console.log('[info] [formHandler] ✅ Successfully navigated to cause list results page');
            
            // Wait for results to load
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Add detailed debugging
            const pageInfo = await page.evaluate(() => {
                const title = document.title || 'No title';
                const hasTable = !!document.querySelector('table');
                const hasPDFs = !!document.querySelector('a[href*=".pdf"]');
                const hasViewContent = !!document.querySelector('.view-content');
                const tableRows = document.querySelectorAll('tbody tr').length;
                const pdfLinks = document.querySelectorAll('a[href*=".pdf"]').length;
                const allLinks = document.querySelectorAll('a').length;
                const hasErrorMessage = !!document.querySelector('.error, .message, .alert');
                
                return { 
                    title, 
                    hasTable, 
                    hasPDFs, 
                    hasViewContent, 
                    tableRows, 
                    pdfLinks,
                    allLinks,
                    hasErrorMessage
                };
            });
            
            console.log(`[debug] [formHandler] Results page analysis:`, pageInfo);
            
            return true;
        } else {
            console.log(`[error] [formHandler] ❌ Unexpected URL after submission: ${currentUrl}`);
            console.log('[error] [formHandler] Expected URL with parameters: field_nclt_benches_list_target_id, field_cause_date_value');
            return false;
        }
        
    } catch (error) {
        console.error('[error] [formHandler] Form submission failed:', error.message);
        return false;
    }
}

module.exports = {
    fillForm,
    submitFormAndWaitForResults
};
