const puppeteer = require('puppeteer');

// Load modules
const browserModule = require('./components/browser');
const { navigateToNCLTPage, fillNCLTForm } = browserModule;

async function debugFormSubmission() {
  console.log('🔍 NCLT Form Submission Debug');
  console.log('==============================');
  
  let browser = null;
  let page = null;
  
  try {
    // Create browser
    browser = await puppeteer.launch({
      headless: false,
      slowMo: 1000,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    console.log('✅ Browser created');
    
    // Navigate and fill form
    await navigateToNCLTPage(page);
    await fillNCLTForm(page, 'mumbai', '16', '90', '2021');
    
    console.log('\n🔍 ANALYZING ALL FORMS AND BUTTONS ON PAGE...');
    
    // Analyze all forms on the page
    const formsAnalysis = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      
      return forms.map((form, index) => {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
        const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
        
        return {
          index: index + 1,
          action: form.action || 'No action',
          method: form.method || 'GET',
          id: form.id || 'No ID',
          className: form.className || 'No class',
          inputCount: inputs.length,
          submitButtonCount: submitButtons.length,
          hasFileInputs: inputs.some(input => input.type === 'file'),
          hasBenchSelect: inputs.some(input => input.name === 'bench'),
          hasCaseTypeSelect: inputs.some(input => input.name === 'case_type'),
          hasCpNoInput: inputs.some(input => input.name === 'cp_no'),
          hasYearSelect: inputs.some(input => input.name === 'year'),
          hasCaptchaInput: inputs.some(input => input.name === 'txtInput' || input.placeholder?.toLowerCase().includes('captcha')),
          submitButtons: submitButtons.map(btn => ({
            type: btn.type,
            value: btn.value || btn.textContent?.trim() || 'No text',
            name: btn.name || 'No name',
            id: btn.id || 'No ID',
            className: btn.className || 'No class'
          })),
          firstFewInputs: inputs.slice(0, 5).map(input => ({
            type: input.type,
            name: input.name || 'No name',
            placeholder: input.placeholder || 'No placeholder',
            value: input.value || 'No value'
          }))
        };
      });
    });
    
    console.log(`\n📋 Found ${formsAnalysis.length} form(s):`);
    
    formsAnalysis.forEach((form, i) => {
      console.log(`\n  📄 Form ${form.index}:`);
      console.log(`    Action: ${form.action}`);
      console.log(`    Method: ${form.method}`);
      console.log(`    ID: ${form.id}`);
      console.log(`    Class: ${form.className}`);
      console.log(`    Input Count: ${form.inputCount}`);
      console.log(`    Submit Buttons: ${form.submitButtonCount}`);
      console.log(`    Has Bench Select: ${form.hasBenchSelect}`);
      console.log(`    Has Case Type Select: ${form.hasCaseTypeSelect}`);
      console.log(`    Has CP No Input: ${form.hasCpNoInput}`);
      console.log(`    Has Year Select: ${form.hasYearSelect}`);
      console.log(`    Has Captcha Input: ${form.hasCaptchaInput}`);
      
      if (form.submitButtons.length > 0) {
        console.log(`    Submit Button Details:`);
        form.submitButtons.forEach((btn, btnIndex) => {
          console.log(`      Button ${btnIndex + 1}: "${btn.value}" (name: ${btn.name}, id: ${btn.id})`);
        });
      }
      
      console.log(`    First Few Inputs:`);
      form.firstFewInputs.forEach((input, inputIndex) => {
        console.log(`      Input ${inputIndex + 1}: ${input.type} "${input.name}" = "${input.value}"`);
      });
    });
    
    // Identify the correct form
    const caseSearchForm = formsAnalysis.find(form => 
      form.hasBenchSelect && form.hasCaseTypeSelect && form.hasCpNoInput && form.hasYearSelect
    );
    
    if (caseSearchForm) {
      console.log(`\n✅ IDENTIFIED CASE SEARCH FORM: Form ${caseSearchForm.index}`);
      console.log(`   Action: ${caseSearchForm.action}`);
      console.log(`   Method: ${caseSearchForm.method}`);
      
      // Now let's try the correct submission
      console.log('\n🎯 MANUAL CAPTCHA STEP:');
      console.log('   Please fill the captcha in the browser window');
      console.log('   Then press ENTER in this terminal to continue...');
      
      // Wait for user input
      await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
      });
      
      console.log('\n🚀 Attempting CORRECT form submission...');
      
      // Method 1: Submit the specific form
      const correctSubmissionResult = await page.evaluate((formIndex) => {
        const forms = document.querySelectorAll('form');
        const targetForm = forms[formIndex - 1]; // Convert to 0-based index
        
        if (targetForm) {
          console.log('[page] Submitting form with action:', targetForm.action);
          
          // Try to find and click the submit button within this form
          const submitBtn = targetForm.querySelector('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            console.log('[page] Found submit button in correct form, clicking...');
            submitBtn.click();
            return { method: 'button-click', action: targetForm.action };
          } else {
            console.log('[page] No submit button found, calling form.submit()');
            targetForm.submit();
            return { method: 'form-submit', action: targetForm.action };
          }
        }
        
        return { method: 'failed', action: 'none' };
      }, caseSearchForm.index);
      
      console.log('📤 Submission result:', correctSubmissionResult);
      
      // Wait for navigation
      try {
        await page.waitForNavigation({ 
          waitUntil: 'domcontentloaded', 
          timeout: 15000 
        });
        console.log('✅ Navigation completed');
      } catch (navError) {
        console.log('⚠️ No navigation detected');
      }
      
      // Check final URL and page
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const finalUrl = page.url();
      console.log(`🔍 Final URL: ${finalUrl}`);
      
      // Take screenshot
      await page.screenshot({ path: 'debug-correct-submission.png', fullPage: true });
      console.log('📸 Screenshot saved: debug-correct-submission.png');
      
      // Analyze final page
      const finalPageAnalysis = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          hasTable: !!document.querySelector('table'),
          tableCount: document.querySelectorAll('table').length,
          bodyText: document.body.textContent.substring(0, 500),
          hasErrorMessage: document.body.textContent.toLowerCase().includes('error') ||
                          document.body.textContent.toLowerCase().includes('invalid') ||
                          document.body.textContent.toLowerCase().includes('incorrect')
        };
      });
      
      console.log('\n📊 Final Page Analysis:');
      console.log(`  Title: ${finalPageAnalysis.title}`);
      console.log(`  URL: ${finalPageAnalysis.url}`);
      console.log(`  Has Table: ${finalPageAnalysis.hasTable}`);
      console.log(`  Table Count: ${finalPageAnalysis.tableCount}`);
      console.log(`  Has Error: ${finalPageAnalysis.hasErrorMessage}`);
      
      if (finalPageAnalysis.hasTable) {
        console.log('\n🎉 SUCCESS! Tables found on results page');
      } else {
        console.log('\n❌ Still no tables found');
        console.log('First 500 chars of page:', finalPageAnalysis.bodyText);
      }
      
    } else {
      console.log('\n❌ Could not identify the case search form');
    }
    
    console.log('\n⏸️ Browser will stay open for inspection...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'debug-error.png', fullPage: true });
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('✅ Browser closed');
    }
  }
}

// Run the debug
if (require.main === module) {
  debugFormSubmission()
    .then(() => console.log('\n✅ Debug completed'))
    .catch(error => {
      console.error('\n❌ Debug failed:', error.message);
      process.exit(1);
    });
}