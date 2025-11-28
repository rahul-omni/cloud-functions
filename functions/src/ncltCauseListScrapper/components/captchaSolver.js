// Use the same working captcha solver as SC scrapper
let solveCaptcha;
try {
    // Try to use the working SC captcha solver first
    const scCaptchaSolver = require('../../util/solveCatchaSC');
    solveCaptcha = scCaptchaSolver.solveCaptcha;
    console.log('📝 Using production CAPTCHA solver from util/solveCatchaSC');
} catch (error) {
    // If Firebase functions not available, use local version
    console.log('📝 Production CAPTCHA solver not available, using local version for testing...');
    const { solveCaptchaWithAI } = require('../../util/solveCatchaSC-local');
    solveCaptcha = solveCaptchaWithAI;
}

/**
 * Handle captcha solving for NCLT cause list page - TEXT-BASED MATH CAPTCHA
 * @param {Object} page - Puppeteer page instance
 * @param {string} providedCaptcha - Pre-solved captcha text (optional)
 * @returns {boolean} Success status
 */
async function handleCaptcha(page, providedCaptcha = null) {
    try {
        console.log('[captcha] Starting NCLT captcha handling...');
        
        // NCLT uses text-based math CAPTCHA, not image CAPTCHA
        const captchaInfo = await page.evaluate(() => {
            const captchaInput = document.querySelector('input[name="captcha_response"]');
            const captchaContainer = document.querySelector('#captcha');
            
            if (!captchaInput || !captchaContainer) {
                return { found: false };
            }
            
            // Get all text content from CAPTCHA section
            const captchaText = captchaContainer.textContent || '';
            console.log(`[captcha] Full CAPTCHA text: "${captchaText}"`);
            
            // Extract just the math equation part from the full text
            // Look for patterns like "Math question * 16 + 4 =" or "4 + 8 =" anywhere in the text
            const mathPatterns = [
                // Pattern for "Math question * 16 + 4 ="
                /Math\s+question\s*\*\s*(\d+)\s*\+\s*(\d+)\s*=?/i,
                /Math\s+question\s*\*\s*(\d+)\s*-\s*(\d+)\s*=?/i,
                /Math\s+question\s*\*\s*(\d+)\s*\*\s*(\d+)\s*=?/i,
                /Math\s+question\s*\*\s*(\d+)\s*÷\s*(\d+)\s*=?/i,
                /Math\s+question\s*\*\s*(\d+)\s*\/\s*(\d+)\s*=?/i,
                
                // Standard patterns for "16 + 4 =" anywhere in text
                /(\d+)\s*\+\s*(\d+)\s*=?/,             // "16 + 4 =" anywhere
                /(\d+)\s*-\s*(\d+)\s*=?/,              // "5 - 2 =" anywhere
                /(\d+)\s*\*\s*(\d+)\s*=?/,             // "3 * 4 =" anywhere
                /(\d+)\s*×\s*(\d+)\s*=?/,              // "3 × 4 =" anywhere
                /(\d+)\s*÷\s*(\d+)\s*=?/,              // "8 ÷ 2 =" anywhere
                /(\d+)\s*\/\s*(\d+)\s*=?/,             // "8 / 2 =" anywhere
                
                // Word-based patterns
                /(\d+)\s*plus\s*(\d+)/i,               // "4 plus 12"
                /(\d+)\s*minus\s*(\d+)/i,              // "5 minus 2"
                /(\d+)\s*times\s*(\d+)/i,              // "3 times 4"
                /(\d+)\s*divided\s+by\s*(\d+)/i,       // "8 divided by 2"
            ];
            
            let mathMatch = null;
            let operation = null;
            
            for (const pattern of mathPatterns) {
                const match = captchaText.match(pattern);
                if (match) {
                    console.log(`[captcha] Pattern matched: ${pattern}`);
                    console.log(`[captcha] Match groups: [${match[1]}, ${match[2]}]`);
                    mathMatch = match;
                    
                    // Determine operation from pattern
                    const patternStr = pattern.toString();
                    if (patternStr.includes('\\+') || patternStr.includes('plus')) {
                        operation = 'add';
                    } else if (patternStr.includes('-') || patternStr.includes('minus')) {
                        operation = 'subtract';
                    } else if (patternStr.includes('\\*') || patternStr.includes('×') || patternStr.includes('times')) {
                        operation = 'multiply';
                    } else if (patternStr.includes('÷') || patternStr.includes('\\/') || patternStr.includes('divided')) {
                        operation = 'divide';
                    }
                    break;
                }
            }
            
            return {
                found: true,
                captchaText: captchaText.trim(),
                mathMatch,
                operation,
                inputSelector: 'input[name="captcha_response"]'
            };
        });
        
        if (!captchaInfo.found) {
            console.log('[captcha] No NCLT text-based captcha found, skipping...');
            return true;
        }
        
        console.log(`[captcha] NCLT Math CAPTCHA detected: "${captchaInfo.captchaText}"`);
        
        let captchaAnswer = providedCaptcha;
        
        // Solve the math problem automatically
        if (!captchaAnswer && captchaInfo.mathMatch && captchaInfo.operation) {
            const num1 = parseInt(captchaInfo.mathMatch[1]);
            const num2 = parseInt(captchaInfo.mathMatch[2]);
            
            console.log(`[captcha] Solving: ${num1} ${captchaInfo.operation} ${num2}`);
            
            switch (captchaInfo.operation) {
                case 'add':
                    captchaAnswer = (num1 + num2).toString();
                    break;
                case 'subtract':
                    captchaAnswer = (num1 - num2).toString();
                    break;
                case 'multiply':
                    captchaAnswer = (num1 * num2).toString();
                    break;
                case 'divide':
                    captchaAnswer = (num1 / num2).toString();
                    break;
                default:
                    throw new Error(`Unknown operation: ${captchaInfo.operation}`);
            }
            
            console.log(`[captcha] ✅ Math solved: ${num1} ${captchaInfo.operation} ${num2} = ${captchaAnswer}`);
        }
        
        if (!captchaAnswer) {
            throw new Error('Unable to solve math CAPTCHA automatically');
        }
        
        // Enter the answer
        console.log(`[captcha] Entering CAPTCHA answer: ${captchaAnswer}`);
        
        await page.waitForSelector(captchaInfo.inputSelector, { timeout: 5000 });
        
        // Clear and fill the input
        await page.evaluate((selector, answer) => {
            const input = document.querySelector(selector);
            if (input) {
                input.value = '';
                input.focus();
                input.value = answer;
                
                // Trigger change events
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, captchaInfo.inputSelector, captchaAnswer);
        
        // Verify the value was set
        const verifyValue = await page.evaluate((selector) => {
            const input = document.querySelector(selector);
            return input ? input.value : null;
        }, captchaInfo.inputSelector);
        
        if (verifyValue === captchaAnswer) {
            console.log(`[captcha] ✅ CAPTCHA successfully filled with: ${captchaAnswer}`);
            return true;
        } else {
            throw new Error(`CAPTCHA verification failed. Expected: ${captchaAnswer}, Got: ${verifyValue}`);
        }
        
    } catch (error) {
        console.error('[captcha] ❌ Captcha handling failed:', error.message);
        return false;
    }
}

module.exports = {
    handleCaptcha
};
