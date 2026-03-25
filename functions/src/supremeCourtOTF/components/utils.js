
const getCaseTypeValue = (caseTypeText) => {
    const caseTypeMap = {
      'SPECIAL LEAVE PETITION (CIVIL)': '1',
      'SPECIAL LEAVE PETITION (CRIMINAL)': '2',
      'CIVIL APPEAL': '3',
      'CRIMINAL APPEAL': '4',
      'WRIT PETITION (CIVIL)': '5',
      'WRIT PETITION(CRIMINAL)': '6',
      'TRANSFER PETITION (CIVIL)': '7',
      'TRANSFER PETITION (CRIMINAL)': '8',
      'REVIEW PETITION (CIVIL)': '9',
      'REVIEW PETITION (CRIMINAL)': '10',
      'TRANSFERRED CASE (CIVIL)': '11',
      'TRANSFERRED CASE (CRIMINAL)': '12',
      'SPECIAL LEAVE TO PETITION (CIVIL)...': '13',
      'SPECIAL LEAVE TO PETITION (CRIMINAL)...': '14',
      'WRIT TO PETITION (CIVIL)...': '15',
      'WRIT TO PETITION (CRIMINAL)...': '16',
      'ORIGINAL SUIT': '17',
      'DEATH REFERENCE CASE': '18',
      'CONTEMPT PETITION (CIVIL)': '19',
      'CONTEMPT PETITION (CRIMINAL)': '20',
      'TAX REFERENCE CASE': '21',
      'SPECIAL REFERENCE CASE': '22',
      'ELECTION PETITION (CIVIL)': '23',
      'ARBITRATION PETITION': '24',
      'CURATIVE PETITION(CIVIL)': '25',
      'CURATIVE PETITION(CRL)': '26',
      'REF. U/A 317(1)': '27',
      'MOTION(CRL)': '28',
      'DIARYNO AND DIARYYR': '31',
      'SUO MOTO WRIT PETITION(CIVIL)': '32',
      'SUO MOTO WRIT PETITION(CRIMINAL)': '33',
      'SUO MOTO CONTEMPT PETITION(CIVIL)': '34',
      'SUO MOTO CONTEMPT PETITION(CRIMINAL)': '35',
      'REF. U/S 14 RTI': '37',
      'REF. U/S 17 RTI': '38',
      'MISCELLANEOUS APPLICATION': '39',
      'SUO MOTO TRANSFER PETITION(CIVIL)': '40',
      'SUO MOTO TRANSFER PETITION(CRIMINAL)': '41'
    };
    
    return caseTypeMap[caseTypeText] || caseTypeText;
  };

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function setCaseTypeAndSetValue(page, caseType, caseNumber, caseYear) {
    const caseTypeValue = getCaseTypeValue(caseType);
    
    // Wait for the new form to be ready
    await page.waitForSelector('#case_type', { visible: true, timeout: 30000 });
    
    console.log(`[info] [fetchSupremeCourtOTF] Attempting to set case type: ${caseType}`);
    
    // Debug: Check available case type options
    const availableOptions = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('#case_type option'));
      return options.map(opt => ({ value: opt.value, text: opt.textContent.trim() }));
    });
    console.log(`[info] [fetchSupremeCourtOTF] Available case type options:`, availableOptions);
    
    // Fill the new form fields
    // Select case type - directly set select2 value using JavaScript
    await page.evaluate((caseTypeValue) => {
      // Find the hidden select element
      const select = document.querySelector('#case_type');
      if (select) {
        // Set the value
        select.value = caseTypeValue;
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        select.dispatchEvent(changeEvent);
        
        // Update the select2 display
        const select2Container = select.nextElementSibling;
        if (select2Container && select2Container.classList.contains('select2')) {
          const rendered = select2Container.querySelector('.select2-selection__rendered');
          if (rendered) {
            // Find the selected option text
            const option = select.querySelector(`option[value="${caseTypeValue}"]`);
            if (option) {
              rendered.textContent = option.textContent;
              rendered.title = option.textContent;
            }
          }
        }
      }
    }, caseTypeValue);
    await wait(1000); // Give time to update    
    // Fill case number
    await page.click('#case_no', { clickCount: 3 });
    await page.type('#case_no', caseNumber, { delay: 100 });
    await wait(500);
    
    // Select year - use same JavaScript approach as case type
    await page.evaluate((caseYear) => {
      // Find the hidden select element
      const select = document.querySelector('#year');
      if (select) {
        // Set the value
        select.value = caseYear;
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        select.dispatchEvent(changeEvent);
        
        // Update the select2 display
        const select2Container = select.nextElementSibling;
        if (select2Container && select2Container.classList.contains('select2')) {
          const rendered = select2Container.querySelector('.select2-selection__rendered');
          if (rendered) {
            // Find the selected option text
            const option = select.querySelector(`option[value="${caseYear}"]`);
            if (option) {
              rendered.textContent = option.textContent;
              rendered.title = option.textContent;
            }
          }
        }
      }
    }, caseYear);
    await wait(1000); // Give time to update

    // Debug: Check form values after setting them
    const debugValues = await page.evaluate(() => {
      const caseTypeSelect = document.querySelector('#case_type');
      const caseNoInput = document.querySelector('#case_no');
      const yearSelect = document.querySelector('#year');
      
      return {
        caseType: caseTypeSelect ? caseTypeSelect.value : 'NOT_FOUND',
        caseNo: caseNoInput ? caseNoInput.value : 'NOT_FOUND',
        year: yearSelect ? yearSelect.value : 'NOT_FOUND'
      };
    });
    console.log(`[debug] [fetchSupremeCourtOTF] Form values after setting:`, debugValues);

    // Verify form fields are properly filled
    const caseTypeValue1 = await page.$eval('#case_type', el => el.value);
    const caseNoValue = await page.$eval('#case_no', el => el.value);
    const yearValue = await page.$eval('#year', el => el.value);
    
    console.log(`[info] [fetchSupremeCourtOTF] Form filled - Case Type: ${caseTypeValue1}, Case No: ${caseNoValue}, Year: ${yearValue}`);
    
    if (!caseTypeValue1 || !caseNoValue || !yearValue) {
      throw new Error('Form fields not properly filled');
    }
}

async function enterDiaryNumber(page, diaryNumber) {
    console.log(`[info] [enterDiaryNumber] Processing diary number: ${diaryNumber}`);
    
    // Extract diary number and year from format "1234/2025"
    const parts = diaryNumber.split('/');
    if (parts.length !== 2) {
        throw new Error(`Invalid diary number format. Expected format: "1234/2025", got: "${diaryNumber}"`);
    }
    
    const diaryNo = parts[0].trim();
    const year = parts[1].trim();
    
    console.log(`[info] [enterDiaryNumber] Extracted - Diary Number: ${diaryNo}, Year: ${year}`);
    
    // Wait for the form to be ready
    await page.waitForSelector('#diary_no', { visible: true, timeout: 30000 });
    await page.waitForSelector('#year', { visible: true, timeout: 30000 });
    
    // Fill diary number
    await page.click('#diary_no', { clickCount: 3 });
    await page.type('#diary_no', diaryNo, { delay: 100 });
    await page.waitForTimeout(500);
    
    // Set year using the same approach as case type selection
    await page.evaluate((year) => {
        // Find the hidden select element
        const select = document.querySelector('#year');
        if (select) {
            // Set the value
            select.value = year;
            
            // Trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            select.dispatchEvent(changeEvent);
            
            // Update the select2 display
            const select2Container = select.nextElementSibling;
            if (select2Container && select2Container.classList.contains('select2')) {
                const rendered = select2Container.querySelector('.select2-selection__rendered');
                if (rendered) {
                    // Find the selected option text
                    const option = select.querySelector(`option[value="${year}"]`);
                    if (option) {
                        rendered.textContent = option.textContent;
                        rendered.title = option.textContent;
                    }
                }
            }
        }
    }, year);
    
    await page.waitForTimeout(1000); // Give time to update
    
    console.log(`[info] [enterDiaryNumber] Form filled - Diary Number: ${diaryNo}, Year: ${year}`);
}

async function transformResults(results) {
    console.log(`[debug] [transformResults] Starting transformation of ${results.length} results`);
    
    const transformedRows = [];
    let globalSerialNumber = 1; // Global counter for unique serial numbers
    
    results.forEach((result, resultIndex) => {
        console.log(`[debug] [transformResults] Processing result ${resultIndex + 1} with ${result.judgmentLinks?.length || 0} judgment links`);
        
        if (!result.judgmentLinks || result.judgmentLinks.length === 0) {
            // If no judgment links, create one row with empty judgment data
            console.log(`[debug] [transformResults] Result ${resultIndex + 1} has no judgment links, creating single row`);
            const singleRow = {
                ...result,
                serial_number: globalSerialNumber.toString(), // Assign unique serial number
                judgment_url: [],
                judgment_text: []
            };
            transformedRows.push(singleRow);
            globalSerialNumber++; // Increment for next row
            return;
        }
        
        // Create a separate row for each judgment link
        result.judgmentLinks.forEach((link, linkIndex) => {
            console.log(`[debug] [transformResults] Creating row for judgment link ${linkIndex + 1}: ${link.text}`);
            
            const transformedRow = {
                ...result,
                serial_number: globalSerialNumber.toString(), // Assign unique serial number
                // Override judgment_url and judgment_text for this specific link
                judgment_date: link.text,
                judgment_url: [link.url],
                judgment_text: [link.text]
            };
            
            // Remove the original judgmentLinks array since we're now creating separate rows
            delete transformedRow.judgmentLinks;
            
            transformedRows.push(transformedRow);
            globalSerialNumber++; // Increment for next row
        });
    });
    
    console.log(`[debug] [transformResults] Transformation completed. Input: ${results.length} results, Output: ${transformedRows.length} rows with serial numbers 1 to ${globalSerialNumber - 1}`);
    
    return transformedRows;
}

module.exports = {
    setCaseTypeAndSetValue,
    enterDiaryNumber,
    transformResults
}