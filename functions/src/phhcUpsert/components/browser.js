const puppeteerCore = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('chrome-aws-lambda');
const { wait } = require('./utils');

const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

const PHHC_CASE_STATUS_URL = 'https://new.phhc.gov.in/case-status/case-no';

/**
 * Outbound proxy for Chromium (CONNECT-capable), e.g. `http://user:pass@host:port`.
 * Replace with your provider URL, or set to `null` to disable. Do not commit real credentials to public repos.
 */
const PHHC_PROXY_URL = null;

function parseProxyForChrome(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
        s = `http://${s}`;
    }
    let u;
    try {
        u = new URL(s);
    } catch {
        return null;
    }
    if (!u.hostname) return null;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const server = `${u.protocol}//${u.hostname}:${port}`;
    const hasAuth = Boolean(u.username || u.password);
    return {
        server,
        username: hasAuth ? decodeURIComponent(u.username) : null,
        password: hasAuth ? decodeURIComponent(u.password) : null,
    };
}

/** Reduce bot fingerprinting; many WAFs block headless + webdriver. */
async function applyPageHardening(page) {
    await page.evaluateOnNewDocument(() => {
        try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch (_) {}
    });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-IN,en;q=0.9',
        Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
    });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
}

/** Outbound proxy for PHHC when cloud IPs are 403-blocked (see `PHHC_PROXY_URL`). */
function getPhhcProxyServer() {
    if (!PHHC_PROXY_URL || !String(PHHC_PROXY_URL).trim()) {
        return null;
    }
    return String(PHHC_PROXY_URL).trim();
}

/**
 * Headless vs headful. Default follows chrome-aws-lambda (headless in serverless).
 * Set PHHC_HEADLESS=false to try a "real" windowed browser (useful on your laptop;
 * Cloud Functions / Cloud Run have no display — headful usually crashes unless you add Xvfb in a custom image).
 */
function resolveHeadless() {
    const v = process.env.PHHC_HEADLESS;
    if (v === undefined || v === '') {
        return chromium.headless;
    }
    const lower = String(v).toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
    }
    return true;
}

/**
 * WAF / session cookies for PHHC (often short-lived). Sent on first navigation to new.phhc.gov.in.
 * Replace via env PHHC_COOKIES_JSON='[{"name":"...","value":"...","domain":".phhc.gov.in","path":"/","secure":true}]' when they expire.
 */
async function applyPhhcInitialCookies(page) {
    const base = {
        domain: '.phhc.gov.in',
        path: '/',
        secure: true,
        sameSite: 'Lax',
    };
    let cookies = [
        {
            ...base,
            name: 'TS01d79196',
            value:
                '01bfcc161f639959c4bc5fa0a39ba9cba09a6bdb86f2a9a5eb449eb99b87ffbe3b7e1cdbda00b613b09e1713259f615754d2eb2412',
        },
        {
            ...base,
            name: 'TS01d79196028',
            value:
                '0165abb88690bfd66a8299c68e884061d93ce914ab1a2b6f98400f13ff5086bdae8898d9947693dd718219398155f12de445a6cece',
        },
    ];

    if (process.env.PHHC_COOKIES_JSON) {
        try {
            const parsed = JSON.parse(process.env.PHHC_COOKIES_JSON);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cookies = parsed;
            }
        } catch (e) {
            console.warn('[applyPhhcInitialCookies] PHHC_COOKIES_JSON parse failed, using baked-in defaults');
        }
    }

    await page.setCookie(...cookies);
    console.log(`[applyPhhcInitialCookies] Set ${cookies.length} cookie(s) for PHHC`);
}

// Initialize browser with proper configuration
async function initializeBrowser() {
    const proxyServer = getPhhcProxyServer();
    const headless = resolveHeadless();
    const launchArgs = [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
    ];
    const proxyParsed = proxyServer ? parseProxyForChrome(proxyServer) : null;
    if (proxyParsed) {
        launchArgs.push(`--proxy-server=${proxyParsed.server}`);
        console.log('[initializeBrowser] Using outbound proxy (PHHC_PROXY_URL)');
    }

    if (headless === false) {
        console.warn(
            '[initializeBrowser] PHHC_HEADLESS=false (headful). On Cloud Functions this often fails (no DISPLAY). ' +
                'Remote sites still see your egress IP — this does not fix IP-based 403 in the cloud.'
        );
    } else {
        console.log(`[initializeBrowser] headless=${headless} (set PHHC_HEADLESS=false for local headful test)`);
    }

    console.log('[initializeBrowser] puppeteer-extra + stealth plugin enabled');

    const browser = await puppeteer.launch({
        args: launchArgs,
        executablePath: await chromium.executablePath,
        headless,
    });

    const page = await browser.newPage();

    if (proxyParsed && proxyParsed.username != null) {
        await page.authenticate({
            username: proxyParsed.username,
            password: proxyParsed.password || '',
        });
    }

    await page.setViewport({ width: 1366, height: 768 });
    await applyPageHardening(page);
    await applyPhhcInitialCookies(page);

    page.on('console', (m) => console.log('[page]', m.text()));
    page.on('response', (response) => {
        const status = response.status();
        if (status === 403) {
            const u = response.url();
            if (u.includes('phhc.gov.in') || u.includes('new.phhc')) {
                console.warn(
                    `[navigateToSearchPage] 403 on resource: ${u.substring(0, 160)}${u.length > 160 ? '…' : ''}`
                );
            }
        }
    });

    console.log(`[initializeBrowser]: browser and page initialized`);
    return { browser, page };
}

/**
 * Wait for case search form (React may hydrate after DOMContentLoaded).
 */
async function waitForCaseSearchForm(page, timeoutMs = 90000) {
    const selectors = [
        'input[name="case_type"]',
        'form.border.rounded input[name="case_type"]',
        '#case_type',
    ];
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
        for (const sel of selectors) {
            try {
                // case_type is often a hidden input for react-select — do not require visible: true
                await page.waitForSelector(sel, { timeout: 3000 });
                console.log(`[waitForCaseSearchForm] Found: ${sel}`);
                return;
            } catch (e) {
                lastErr = e;
            }
        }
        await wait(500);
    }
    const debug = await page.evaluate(() => ({
        title: document.title,
        bodyLen: (document.body && document.body.innerHTML.length) || 0,
        hasCaseStatusH5: !!Array.from(document.querySelectorAll('h5')).find((h) =>
            /case status search/i.test(h.textContent || '')
        ),
    }));
    console.error('[waitForCaseSearchForm] Debug:', JSON.stringify(debug));
    throw new Error(
        lastErr?.message ||
            'Case search form did not appear (blocked 403 on assets, WAF, or slow SPA). Check logs for 403 lines.'
    );
}

// Navigate to PHHC case status (case number) search page
async function navigateToSearchPage(page) {
    const maxAttempts = 2;
    let response = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(
            `[navigateToSearchPage] Going to PHHC case status page (attempt ${attempt}/${maxAttempts}) on ${PHHC_CASE_STATUS_URL}`
        );
        response = await page.goto(PHHC_CASE_STATUS_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 120000,
        });
        const status = response ? response.status() : 0;
        console.log('response', response);
        console.log(`[navigateToSearchPage] Document HTTP status: ${status}`);
        if (status !== 403) {
            break;
        }
        // Some WAFs return 403 with Set-Cookie (TS01*); browser stores them — a second navigation may succeed.
        if (attempt < maxAttempts) {
            console.warn(
                '[navigateToSearchPage] 403 on document; retrying once after delay so session cookies from response can apply...'
            );
            await wait(1500);
        }
    }
    const status = response ? response.status() : 0;
    if (status === 403) {
        throw new Error(
            'new.phhc.gov.in returned 403 Forbidden for the case status page. Datacenter egress IPs are often blocked. Options: set PHHC_PROXY (or HTTPS_PROXY) to an allowlisted proxy; deploy on Cloud Run with VPC + Cloud NAT static IP; or ask PHHC to allowlist your IP.'
        );
    }
    await wait(1500);
    await waitForCaseSearchForm(page, 90000);
    console.log('[navigateToSearchPage] Navigated to', PHHC_CASE_STATUS_URL);
}

/**
 * Open react-select case type menu and pick option by label (e.g. CRM, CWP, CRA-D).
 * Portal uses #react-select-case_type-listbox and [role="option"].
 */
async function selectCaseTypeFromReactSelect(page, caseType) {
    const wanted = String(caseType || '').trim();
    if (!wanted) {
        console.warn('[selectCaseTypeFromReactSelect] Empty case type, skipping');
        return false;
    }

    await page.waitForSelector('#case_type', { timeout: 15000 });
    await wait(200);

    // Open menu: click combobox input (react-select) or the control / dropdown indicator
    await page.click('#case_type');
    await wait(300);

    let listboxVisible = false;
    try {
        await page.waitForSelector('#react-select-case_type-listbox', { timeout: 5000 });
        listboxVisible = true;
    } catch (_) {
        console.log('[selectCaseTypeFromReactSelect] Listbox not open after #case_type click, trying control / chevron');
    }

    if (!listboxVisible) {
        const opened = await page.evaluate(() => {
            const input = document.querySelector('#case_type');
            const control = input && input.closest('[class*="control"]');
            if (control) {
                control.click();
                return true;
            }
            const indicators = document.querySelectorAll('[class*="indicatorContainer"]');
            const chevron = indicators[indicators.length - 1];
            if (chevron) {
                chevron.click();
                return true;
            }
            return false;
        });
        if (opened) await wait(300);
        await page.waitForSelector('#react-select-case_type-listbox', { timeout: 8000 });
    }

    const picked = await page.evaluate((expected) => {
        const listbox = document.querySelector('#react-select-case_type-listbox');
        if (!listbox) return { ok: false, reason: 'listbox missing' };
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        const exp = norm(expected);
        let opt = options.find((o) => norm(o.textContent) === exp);
        if (!opt) {
            opt = options.find(
                (o) => norm(o.textContent).toLowerCase() === exp.toLowerCase()
            );
        }
        if (!opt) {
            opt = options.find(
                (o) =>
                    norm(o.textContent) === exp.replace(/-/g, '') ||
                    norm(o.textContent).includes(exp)
            );
        }
        if (!opt) {
            return {
                ok: false,
                reason: 'no matching option',
                sample: options.slice(0, 8).map((o) => norm(o.textContent)),
            };
        }
        opt.scrollIntoView({ block: 'nearest' });
        opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        opt.click();
        return { ok: true, selected: norm(opt.textContent) };
    }, wanted);

    if (!picked.ok) {
        console.error('[selectCaseTypeFromReactSelect] Failed:', JSON.stringify(picked));
        return false;
    }

    console.log(`[selectCaseTypeFromReactSelect] Selected: ${picked.selected}`);
    await wait(400);

    const hiddenVal = await page.evaluate(() => {
        const h = document.querySelector('input[name="case_type"]');
        return h ? h.value : null;
    });
    console.log(`[selectCaseTypeFromReactSelect] Hidden input[name="case_type"] = "${hiddenVal}"`);
    return true;
}

/**
 * Fill case search form (new.phhc.gov.in — React case type + inputs).
 * @param {string} caseType - Code e.g. CRM, CWP, CRA-D
 * @param {string} caseNumber - Numeric part
 * @param {string} caseYear - Year e.g. 2024
 */
async function fillCaseSearchForm(page, caseType, caseNumber, caseYear) {
    console.log('[fillCaseSearchForm] Filling form with:', { caseType, caseNumber, caseYear });

    await page.waitForSelector('input[name="case_type"]', { timeout: 30000 });
    await wait(400);

    if (caseType) {
        const ok = await selectCaseTypeFromReactSelect(page, caseType);
        if (!ok) {
            console.warn('[fillCaseSearchForm] React-select failed; setting hidden input as fallback');
            await page.evaluate((type) => {
                const hidden = document.querySelector('input[name="case_type"]');
                if (hidden) {
                    hidden.value = type;
                    hidden.dispatchEvent(new Event('input', { bubbles: true }));
                    hidden.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, caseType);
            await wait(300);
        }
    }

    const filled = await page.evaluate((num, year) => {
        const numInput =
            document.querySelector('input[placeholder="Case No."]') ||
            document.querySelector('input[placeholder*="Case No"]') ||
            document.querySelector('form input.form-control[type="text"]');
        if (numInput) {
            numInput.value = '';
            numInput.value = String(num);
            numInput.dispatchEvent(new Event('input', { bubbles: true }));
            numInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const yearSelect =
            document.querySelector('form select.form-select') ||
            document.querySelector('select.form-select');
        if (yearSelect && year) {
            yearSelect.value = String(year);
            yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const hidden = document.querySelector('input[name="case_type"]');
        return {
            caseTypeValue: hidden ? hidden.value : null,
            numSet: !!numInput,
            yearSet: !!yearSelect,
            yearValue: yearSelect ? yearSelect.value : null,
        };
    }, caseNumber || '', caseYear || '');

    console.log('[fillCaseSearchForm] Field status:', filled);
    await wait(400);
    console.log('[fillCaseSearchForm] Form filled');
}

// Submit search form (SPA — results render on same page)
async function submitSearchForm(page) {
    console.log('[submitSearchForm] Submitting form...');

    const submitBtn =
        'form button[type="submit"], button.btn[type="submit"], button.w-100[type="submit"]';
    await page.waitForSelector(submitBtn, { timeout: 15000 });

    await page.click(submitBtn);

    await page.waitForFunction(
        () => {
            const headings = document.querySelectorAll('h6.topbar, h6.text-center.text-white');
            for (const h of headings) {
                const t = h.textContent || '';
                if (/Case Details For Case/i.test(t)) return true;
            }
            return false;
        },
        { timeout: 45000 }
    ).catch(() => {
        console.log('[submitSearchForm] Timeout waiting for Case Details heading');
    });

    await wait(2000);

    const hasTable = await page.evaluate(() =>
        !!document.querySelector('table.table.table-bordered tbody tr')
    );
    if (!hasTable) {
        const errText = await page.evaluate(() => {
            const el = document.querySelector('.alert, .text-danger, [role="alert"]');
            return el ? el.textContent.trim() : null;
        });
        if (errText) console.log('[submitSearchForm] Possible error:', errText);
    }

    console.log('[submitSearchForm] Search submitted');
}

/**
 * After search, results are on the same page (no #tables11 links).
 * Returns one synthetic link so the pipeline can call extractCaseDetails with skipNavigation.
 */
async function extractCaseLinks(page) {
    console.log('[extractCaseLinks] Reading search result on current page...');

    const meta = await page.evaluate(() => {
        const h = Array.from(document.querySelectorAll('h6.topbar, h6.text-center.text-white')).find(
            el => /Case Details For Case/i.test(el.textContent || '')
        );
        const m = h?.textContent?.match(/Case Details For Case\s+(.+)/i);
        return {
            caseTitle: m ? m[1].trim() : null,
            hasDetails: !!h
        };
    });

    if (!meta.hasDetails) {
        console.log('[extractCaseLinks] No "Case Details For Case" section — no results');
        return [];
    }

    const caseId = meta.caseTitle || 'phhc-search-result';
    const links = [{
        caseId,
        fullUrl: page.url(),
        skipNavigation: true
    }];

    console.log(`[extractCaseLinks] Inline result for: ${caseId}`);
    return links;
}

module.exports = {
    initializeBrowser,
    navigateToSearchPage,
    fillCaseSearchForm,
    submitSearchForm,
    extractCaseLinks,
    PHHC_CASE_STATUS_URL
};
