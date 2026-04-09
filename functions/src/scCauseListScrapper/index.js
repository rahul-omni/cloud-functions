const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');
const { getSubscribedCases, insertNotifications, insertCauselist, updateUserCase } = require('./components/db');
const pdfParse = require("pdf-parse");
const axios = require('axios');
const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");
const { Storage } = require('@google-cloud/storage');

// Create storage client
const storage = new Storage();
const bucketName = "causelistpdflinks"; // 🔹 Replace with your bucket name

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * Build better line-preserving text from PDF items.
 * Default pdf-parse text often joins adjacent rows (common in cause-lists).
 */
function buildLayoutAwarePageText(pageData) {
  const textContent = pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });

  return textContent.then((text) => {
    const items = (text.items || [])
      .filter((it) => typeof it.str === "string" && it.str.trim().length > 0)
      .map((it) => ({
        str: it.str,
        x: Number(it.transform?.[4] || 0),
        y: Number(it.transform?.[5] || 0),
      }));

    if (items.length === 0) return "";

    // Group by Y with tolerance to avoid breaking the same visual line.
    const lines = [];
    const yTolerance = 1.75;
    for (const it of items) {
      const match = lines.find((ln) => Math.abs(ln.y - it.y) <= yTolerance);
      if (match) {
        match.items.push(it);
      } else {
        lines.push({ y: it.y, items: [it] });
      }
    }

    // PDF coordinate system: larger y is visually higher on page.
    lines.sort((a, b) => b.y - a.y);

    const out = [];
    for (const ln of lines) {
      ln.items.sort((a, b) => a.x - b.x);
      let line = "";
      let prevX = null;

      for (const chunk of ln.items) {
        if (prevX !== null && chunk.x - prevX > 6 && !line.endsWith(" ")) {
          line += " ";
        }
        line += chunk.str;
        prevX = chunk.x + chunk.str.length * 3.5;
      }

      const normalized = line
        .replace(/[ \t]+/g, " ")
        .replace(/\s+([,.;:)\]])/g, "$1")
        .trim();
      if (normalized) out.push(normalized);
    }

    return out.join("\n");
  });
}

function normalizePdfText(raw) {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfTextRobust(pdfBuffer) {
  const defaultParsed = await pdfParse(pdfBuffer);
  const defaultText = normalizePdfText(defaultParsed?.text || "");

  let layoutText = "";
  try {
    const layoutParsed = await pdfParse(pdfBuffer, {
      pagerender: buildLayoutAwarePageText,
      max: 0,
    });
    layoutText = normalizePdfText(layoutParsed?.text || "");
  } catch (layoutErr) {
    console.error("[warning] Layout-aware PDF parse failed, fallback to default parser:", layoutErr?.message || layoutErr);
  }

  // Choose richer extraction; if both exist and differ, merge to retain dropped lines.
  if (!layoutText) return defaultText;
  if (!defaultText) return layoutText;
  if (layoutText === defaultText) return defaultText;

  const combined = `${layoutText}\n\n${defaultText}`;
  return normalizePdfText(combined);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Skip matching serial/year only when the hit is clearly on an IA or Diary line
 * (serial immediately after "IA No." / "Diary No."). A broad "IA No. anywhere in
 * lookback" would false-reject case rows that follow another item's IA block
 * (e.g. item 17 after item 16's "IA No. 76769/2026").
 */
function isSerialOnIaOrDiaryLine(pdfText, matchStart) {
  const tailLen = 180;
  const tailBefore = pdfText.slice(Math.max(0, matchStart - tailLen), matchStart).trimEnd();
  return /IA\s*No\.?\s*$/i.test(tailBefore) || /Diary\s*No\.?\s*$/i.test(tailBefore);
}

/** e.g. SLP(C) → slpc for loose substring check in PDF context */
function normalizeCaseTypeTokenForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Case-type label before "No." — SLP(C), W.P.(C), C.A., etc. */
function extractCaseTypeLabelFromDbCaseNumber(s) {
  const m = String(s).match(/^(.+?)\s*No\.?\s*-?\s*\d/i);
  return m ? m[1].trim() : "";
}

/**
 * Parse DB registration-style case numbers:
 * - SLP(C) No.-008420-008421 - 2024 → serials [008420,008421], year 2024
 * - SLP(C) No.-030914 - 2025
 * - W.P.(C) No.-000033 - 2023
 * Requires " - YYYY" before end (space-dash-space-year).
 */
function parseDbCaseNumberForMatching(dbCaseNumber) {
  const s = String(dbCaseNumber || "").trim();
  if (!s) return null;
  const yearMatch = s.match(/\s+-\s*((?:19|20)\d{2})\s*$/);
  if (!yearMatch) return null;
  const year = yearMatch[1];
  const withoutYear = s.slice(0, yearMatch.index).trim();
  const noMatch = withoutYear.match(/No\.?\s*-?\s*(.+)$/i);
  if (!noMatch) return null;
  const numberPart = noMatch[1].trim();
  const serials = numberPart
    .split("-")
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p));
  if (serials.length === 0) return null;
  const uniq = [...new Set(serials)];
  const caseTypeLabel = extractCaseTypeLabelFromDbCaseNumber(s);
  return { caseTypeLabel, serials: uniq, year };
}

/**
 * Match serial+year on case-type lines in PDF. Skips IA / Diary No. context.
 * Covers: No. 8420/2024, No. 8420-2024, No. 008420-008421/2024, etc.
 */
function tryCaseLineSerialYearInPdf(pdfText, serialRaw, yearRaw, caseTypeHintNorm) {
  if (!pdfText || serialRaw == null || yearRaw == null) return false;
  const year = String(yearRaw).replace(/\D/g, "");
  if (!/^(19|20)\d{2}$/.test(year)) return false;
  const serialStr = String(serialRaw).replace(/\D/g, "");
  if (!serialStr) return false;
  const serialNoZeros = serialStr.replace(/^0+/, "") || "0";
  if (serialNoZeros === "0") return false;
  const serialPattern = `0*${escapeRegex(serialNoZeros)}(?![0-9])`;
  const pairRes = [
    new RegExp(`(?<![0-9])${serialPattern}\\s*[/\\-]\\s*${year}(?![0-9])`, "gi"),
    new RegExp(
      `(?<![0-9])${serialPattern}\\s*-\\s*\\d{1,8}\\s*[/\\-]\\s*${year}(?![0-9])`,
      "gi"
    ),
    new RegExp(
      `\\d{1,8}\\s*-\\s*${serialPattern}\\s*[/\\-]\\s*${year}(?![0-9])`,
      "gi"
    ),
  ];
  for (const pairRe of pairRes) {
    let m;
    while ((m = pairRe.exec(pdfText)) !== null) {
      const start = m.index || 0;
      const before = pdfText.slice(Math.max(0, start - 250), start);
      if (isSerialOnIaOrDiaryLine(pdfText, start)) continue;
      if (caseTypeHintNorm) {
        const beforeNorm = normalizeCaseTypeTokenForMatch(before);
        if (!beforeNorm.includes(caseTypeHintNorm)) continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.scCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

    console.log("[start] [scCauseListScrapper] scraper service started at:", new Date().toISOString());

    // Optional body: { "date": "DD-MM-YYYY" } for testing; if omitted, default = tomorrow (same as before).
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const payloadDate = body && typeof body.date === "string" ? body.date.trim() : "";
    // Explicit defaults (when omitted in request body).
    const testRaw = body ? (body.Test ?? body.test ?? false) : false;
    const testMode =
      testRaw === true || String(testRaw).trim().toLowerCase() === "true";
    const useOpenAiParseRaw = body ? (body.useOpenAiParse ?? false) : false;
    const useOpenAiParse =
      useOpenAiParseRaw === true ||
      String(useOpenAiParseRaw).trim().toLowerCase() === "true";
    const ddmmyyyy = /^\d{2}-\d{2}-\d{4}$/;
    /** When true, only this user receives WhatsApp / notification rows (for safe testing). */
    const TEST_NOTIFY_USER_ID = "677190fb-839e-45db-afe1-8c10d6206e3b";
    if (testMode) {
      console.log(
        `[info] Test mode: notifications only for user_id=${TEST_NOTIFY_USER_ID}`
      );
    }
    if (useOpenAiParse) {
      console.log(
        "[info] useOpenAiParse=true was requested, but OpenAI parsing is disabled in this scraper. Using raw-text matching."
      );
    }

    let formattedDate;
    let dayISO;
    if (payloadDate && ddmmyyyy.test(payloadDate)) {
      const [d, m, y] = payloadDate.split("-");
      formattedDate = `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
      dayISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      console.log(`[info] Using payload date for SC cause list: ${formattedDate}`);
    } else {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      formattedDate = `${day}-${month}-${year}`;
      dayISO = `${year}-${month}-${day}`;
      if (payloadDate) {
        console.log(`[warning] Invalid payload date "${payloadDate}". Expected DD-MM-YYYY. Using default (tomorrow): ${formattedDate}`);
      }
    }

    try {
      // Create form data object for the new flexible structure
      const formData = {
        listType: 'daily',
        searchBy: 'all_courts',
        causelistType: 'Misc. Court',
        listingDate: formattedDate,
        mainAndSupplementry: 'both'
      };

      console.log("[debug] [scCauseListScrapper] Form data:", formData);

      let extractedPdfs = {};
      const fileName = `extractedPdfs-${formattedDate}.json`;
      const file = storage.bucket(bucketName).file(fileName);
      const causeList = [];

      // 🔹 First try fetching JSON file from bucket
      const [exists] = await file.exists();
      if (exists) {
        console.log(`[info] Found existing JSON in bucket: gs://${bucketName}/${fileName}`);
        const [contents] = await file.download();
        extractedPdfs = JSON.parse(contents.toString());
      } else {
        console.log("[info] No JSON found, fetching cause list and parsing PDFs...");

        // 🔹 Fetch cause list data only if JSON not found
        const results = await fetchSupremeCourtCauseList(formData);

        if (results.length === 0) {
          return res.status(200).json({
            success: true,
            message: "No results found",
            data: []
          });
        }

        for (const row of results) {
          if (row.causeListLinks && row.causeListLinks.length > 0) {
            const pdfUrl = row.causeListLinks[0].url;
            console.log(`[debug] [scCauseListScrapper] Processing PDF: ${pdfUrl}`);

            const response = await axios.get(pdfUrl, {
              responseType: "arraybuffer",
              timeout: 30000,
            });

            const rawText = await extractPdfTextRobust(response.data);

            extractedPdfs[pdfUrl] = {
              rawText,
              parsed: null,
              extractedAt: new Date().toISOString(),
            };
          }
        }

        // 🔹 Save extractedPdfs to GCP bucket as JSON
        try {
          await file.save(JSON.stringify(extractedPdfs, null, 2), {
            contentType: "application/json",
          });
          console.log(`[info] Saved extractedPdfs to gs://${bucketName}/${fileName}`);
        } catch (err) {
          console.error("[error] Failed to save extractedPdfs to bucket:", err);
        }
      }

      // 🔹 Get subscribed cases
      const subscribedCases = await getSubscribedCases();

      /**
       * Match serial/year on a case line. Serial must not be a prefix of a longer number
       * (e.g. 26/2024 must not match 266/2024).
       * options.caseTypeHint: raw label (e.g. "SLP(C)") — normalized internally.
       */
      function trySerialYearInPdf(pdfText, leftRaw, yearRaw, options = {}) {
        if (!pdfText || !leftRaw || !yearRaw) return false;
        const left = String(leftRaw).replace(/\D/g, '').replace(/^0+/, '') || '0';
        const year = String(yearRaw).replace(/\D/g, '');
        if (left === '0' || !/^(19|20)\d{2}$/.test(year)) return false;
        const pairRe = new RegExp(
          `(?<![0-9])${left}(?![0-9])\\s*[/\\-]\\s*${year}(?![0-9])`,
          'ig'
        );
        const caseTypeHint = normalizeCaseTypeTokenForMatch(options.caseTypeHint || "");
        let m;
        while ((m = pairRe.exec(pdfText)) !== null) {
          const start = m.index || 0;
          const before = pdfText.slice(Math.max(0, start - 250), start);
          // Avoid IA/Diary rows for case-number matching (immediate prefix only).
          if (isSerialOnIaOrDiaryLine(pdfText, start)) {
            continue;
          }
          // If case type is known, require it near the match.
          if (caseTypeHint) {
            const beforeNorm = normalizeCaseTypeTokenForMatch(before);
            if (!beforeNorm.includes(caseTypeHint)) {
              continue;
            }
          }
          return true;
        }
        return false;
      }

      /**
       * SC diary numbers appear only after "Diary No." — not after "W.P.(C) No." etc.
       * So we never treat 311/2026 on a case-type line as a diary hit.
       */
      function tryDiarySerialYearInPdf(pdfText, leftRaw, yearRaw) {
        if (!pdfText || !leftRaw || !yearRaw) return false;
        const left = String(leftRaw).replace(/\D/g, '').replace(/^0+/, '') || '0';
        const year = String(yearRaw).replace(/\D/g, '');
        if (left === '0' || !/^(19|20)\d{2}$/.test(year)) return false;
        const re = new RegExp(
          `Diary\\s*No\\.?\\s*(?<![0-9])${left}(?![0-9])\\s*[/\\-]\\s*${year}(?![0-9])`,
          'i'
        );
        return re.test(pdfText);
      }

      /** Find serial/year pairs in subscription value; match in PDF only after "Diary No." */
      function anyDiarySerialYearPairMatches(pdfText, value) {
        if (!value || !pdfText) return false;
        const re = /(\d{1,8})\s*[/\-]\s*((?:19|20)\d{2})/g;
        let m;
        while ((m = re.exec(value)) !== null) {
          if (tryDiarySerialYearInPdf(pdfText, m[1], m[2])) return true;
        }
        return false;
      }

      /** Find every serial/year pair in a string (310/2026, 11430-2026, …) — any position in PDF (case lines). */
      function anySerialYearPairMatches(pdfText, value, options = {}) {
        if (!value || !pdfText) return false;
        const re = /(\d{1,8})\s*[/\-]\s*((?:19|20)\d{2})/g;
        let m;
        while ((m = re.exec(value)) !== null) {
          if (trySerialYearInPdf(pdfText, m[1], m[2], options)) return true;
        }
        return false;
      }

      /**
       * Registration style: "W.P.(C) No.-000310-000310 - 2026" → same serial twice + year;
       * PDF often lists "W.P.(C) No. 310/2026".
       */
      function extractRegistrationDuplicateSerialYear(value) {
        const s = String(value || "");
        const dup = /No\.?\s*-?\s*(\d+)\s*-\s*\1\s*-\s*((?:19|20)\d{2})/gi;
        const pairs = [];
        let m;
        while ((m = dup.exec(s)) !== null) {
          pairs.push([m[1], m[2]]);
        }
        return pairs;
      }

      /** Diary column: only match text that appears as "Diary No. …" in the PDF. */
      function diaryMatchesInPdf(pdfText, diaryNumber) {
        if (!diaryNumber || !pdfText) return false;
        const d = String(diaryNumber).trim();
        if (!d) return false;

        if (anyDiarySerialYearPairMatches(pdfText, d)) return true;

        // "12345/2024"
        const slashParts = d.split('/');
        if (slashParts.length === 2) {
          const left = slashParts[0].replace(/\D/g, '').replace(/^0+/, '') || '0';
          const right = slashParts[1].replace(/\D/g, '').replace(/^0+/, '') || '0';
          if (tryDiarySerialYearInPdf(pdfText, left, right)) return true;
        }

        // "11430-2026" (hyphen — PDF: "Diary No. 11430-2026")
        const hyphenParts = d.split('-').map((p) => p.trim()).filter(Boolean);
        if (hyphenParts.length === 2 && /^(19|20)\d{2}$/.test(hyphenParts[1])) {
          const left = hyphenParts[0].replace(/\D/g, '').replace(/^0+/, '') || '0';
          if (tryDiarySerialYearInPdf(pdfText, left, hyphenParts[1])) return true;
        }

        // Loose: still require "Diary No." immediately before the stored token
        const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[/-]').replace(/-/g, '[\\-]');
        const loose = new RegExp(`Diary\\s*No\\.?\\s*${escaped}(?![0-9A-Za-z])`, 'i');
        return loose.test(pdfText);
      }

      /**
       * Match DB registration case no. to PDF cause-list text.
       * 1) Parses "Type No.-serial(s) - year" (incl. two serials like 008420-008421).
       * 2) Fallbacks: duplicate-serial pattern, any serial/year in string, slash/hyphen splits.
       * Never treats Diary No. lines as case_number hits (skipped in matchers).
       */
      function caseNumberMatchesInPdf(pdfText, caseNumber) {
        if (!caseNumber || !pdfText) return false;
        const c = String(caseNumber).trim();
        if (!c) return false;

        const parsedDb = parseDbCaseNumberForMatching(c);
        if (parsedDb) {
          const hint = normalizeCaseTypeTokenForMatch(parsedDb.caseTypeLabel);
          for (const serial of parsedDb.serials) {
            if (tryCaseLineSerialYearInPdf(pdfText, serial, parsedDb.year, hint)) {
              return true;
            }
          }
        }

        const typeMatch = c.match(/([A-Za-z][A-Za-z().\s/-]{1,30})\s*No\.?/i);
        const caseTypeHint = typeMatch ? typeMatch[1] : "";

        for (const [serial, yr] of extractRegistrationDuplicateSerialYear(c)) {
          if (trySerialYearInPdf(pdfText, serial, yr, { caseTypeHint })) return true;
        }

        if (anySerialYearPairMatches(pdfText, c, { caseTypeHint })) return true;

        const slashParts = c.split('/');
        if (slashParts.length === 2) {
          const left = slashParts[0].replace(/\D/g, '').replace(/^0+/, '') || '0';
          const right = slashParts[1].replace(/\D/g, '').replace(/^0+/, '') || '0';
          if (trySerialYearInPdf(pdfText, left, right, { caseTypeHint })) return true;
        }

        const hyphenParts = c.split('-').map((p) => p.trim()).filter(Boolean);
        if (hyphenParts.length === 2 && /^(19|20)\d{2}$/.test(hyphenParts[1])) {
          const left = hyphenParts[0].replace(/\D/g, '').replace(/^0+/, '') || '0';
          if (trySerialYearInPdf(pdfText, left, hyphenParts[1], { caseTypeHint })) return true;
        }

        return false;
      }

      /**
       * Match subscription against PDF.
       * - case_number → case-type lines (e.g. "W.P.(C) No. 311/2026"); never use diary-only rules.
       * - diary_number → only after literal "Diary No." (e.g. "Diary No. 11430-2026").
       * Do not run diary matcher on case_number (311/2026 is not a diary id on that line).
       * No cross-field fallback: prevents random hits/spam.
       */
      function pdfMatchesSubscription(pdfText, case_number, diary_number) {
        const byCase =
          !!case_number && caseNumberMatchesInPdf(pdfText, case_number);
        const byDiary =
          !!diary_number && diaryMatchesInPdf(pdfText, diary_number);
        return byCase || byDiary;
      }

      /** Bucket: legacy plain string or { rawText, ... } — matching uses PDF text only. */
      function getPdfSearchText(entry) {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          return entry.rawText || "";
        }
        return "";
      }

      // In your search loop
      for (const row of subscribedCases) {
        const { case_number, diary_number, mobile_number, country_code, user_id, case_id } = row;

        console.log(case_number, diary_number, mobile_number, user_id, case_id, "details");

        // Collect all matching PDFs for this user+case in this run
        const matchingUrls = new Set();

        for (const [url, pdfEntry] of Object.entries(extractedPdfs)) {
          const pdfText = getPdfSearchText(pdfEntry);
          if (pdfMatchesSubscription(pdfText, case_number, diary_number)) {
            matchingUrls.add(url);
          }
        }

        if (matchingUrls.size === 0) {
          console.log(
            `[info] No PDF match for subscribed case case_number=${case_number || "—"} diary_number=${diary_number || "—"} case_id=${case_id}`
          );
          continue;
        }

        if (testMode && String(user_id) !== TEST_NOTIFY_USER_ID) {
          console.log(
            `[info] Test mode: PDF match for user_id=${user_id} case_id=${case_id} — skipping notification`
          );
          continue;
        }

        // Template approval pending for multiple links: send only the first link for now.
        const firstUrl = matchingUrls.values().next().value;
        const identifier = case_number || diary_number;
        const message = `You have a new order on ${identifier} dated ${formattedDate}.\nLink: ${firstUrl}`;

        try {
          const contact = `${country_code || ''}${mobile_number || ''}`.trim();
          const inserted = await insertNotifications(case_id, dayISO, user_id, 'whatsapp', contact, message);

          if (!inserted || !inserted.id) {
            console.log(
              `[info] Skip WhatsApp: already sent for case_id=${case_id} day=${dayISO} (notifications dedupe)`
            );
            continue;
          }

          causeList.push({ user_id, case_id });
          await processWhatsAppNotificationsWithTemplate(inserted.id, 'order_status', [identifier, formattedDate, firstUrl]);
          await updateUserCase(case_id, formattedDate);
        } catch (notifyErr) {
          console.error(`[error] Failed to notify user ${user_id} for case ${case_number || diary_number}:`, notifyErr);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Cron job completed successfully"
      });

    } catch (error) {
      console.error('[error] [scCauseListScrapper] Error during scraping service: ', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      console.log("[end] [scCauseListScrapper] scraper service ended at:", new Date().toISOString());
    }
  });
