const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const functions = require("firebase-functions");
const { PHHCCauseListScrapper } = require("./phhcCauseListScrapper");
const {
  checkEntryExists,
  saveExtractedPdfs,
  fetchUploadAndParsePdf,
  getSubscribedCases,
  updateUserCase,
} = require("./components");
const { notifyPhhcCauseListMatch } = require("./components/notification");

const regionFunctions = functions.region("asia-south1");

const runtimeOpts = {
  timeoutSeconds: 540, // Maximum allowed: 9 minutes (540 seconds)
  memory: '2GB',
};

/**
 * Collapse whitespace, strip zero-width chars, ASCII/Unicode dashes and slashes, lowercase.
 * PDF extractors often emit en-dash (U+2013) or soft hyphens; substring match failed if we only stripped [-/].
 */
const normalizeMatchText = (text) => {
  if (!text) return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/\p{Pd}/gu, "")
    .replace(/\//g, "")
    .toLowerCase();
};

/**
 * Normalize case number for matching (same token rules as High Court scraper + unicode dash handling).
 */
const normalizeCaseNumber = (caseNumber) => {
  if (!caseNumber) return null;
  const parts = caseNumber.match(/\D+|\d+/g);
  if (!parts) return normalizeMatchText(caseNumber);
  const joined = parts
    .map((p) =>
      /^\d+$/.test(p) ? p.replace(/^0+/, "") : p.replace(/[\p{Pd}\/]/gu, "")
    )
    .join("");
  return normalizeMatchText(joined);
};

/** Same default tester UUID as scCauseListScrapper when test=true but testerUserId omitted */
const DEFAULT_TEST_NOTIFY_USER_ID = "677190fb-839e-45db-afe1-8c10d6206e3b";

/**
 * HTTP Cloud Function: PHHC cause list (same roles as highCourtCasesUpsert/index + hcCauseListScrapper).
 * 1) PHHCCauseListScrapper — browser-only scrape (see phhcCauseListScrapper.js, like highCourtScrapper.js).
 * 2) PDF download / parse / bucket JSON cache — here.
 * 3) Match subscribed Chandigarh HC cases in PDF text; WhatsApp via order_status template (like hcCauseListScrapper).
 *
 * Body (optional, aligned with scCauseListScrapper):
 * - test | Test: if true, only the tester user receives WhatsApp / notification rows.
 * - testerUserId | tester_user_id | testNotifyUserId | test_notify_user_id: UUID of that user.
 *   If test mode is on and this is omitted, uses the same default UUID as scCauseListScrapper.
 */
exports.phhcCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

    console.log("[start] [phhcCauseListScrapper] scraper service started at:", new Date().toISOString());

    try {
      // Parse request body
      let body = req.body;
      if (typeof req.body === "string") {
        body = JSON.parse(body);
      }
      if (!body || typeof body !== "object") {
        body = {};
      }

      const testRaw = body.Test ?? body.test ?? false;
      const testMode =
        testRaw === true || String(testRaw).trim().toLowerCase() === "true";
      const testerUserIdRaw =
        body.testerUserId ??
        body.tester_user_id ??
        body.testNotifyUserId ??
        body.test_notify_user_id;
      const testNotifyUserId =
        testerUserIdRaw && String(testerUserIdRaw).trim()
          ? String(testerUserIdRaw).trim()
          : testMode
            ? DEFAULT_TEST_NOTIFY_USER_ID
            : null;
      if (testMode) {
        console.log(
          `[info] [phhcCauseListScrapper] Test mode: notifications only for user_id=${testNotifyUserId}`
        );
      }

      // Get date from request or default to tomorrow
      let date = body.date || null;
      if (!date) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const year = tomorrow.getFullYear();
        date = `${day}/${month}/${year}`; // DD/MM/YYYY format (matches datepicker format)
      }

      // Maps to PHHC <select name="urg_ord"> via resolveListTypeValue (e.g. URGENT→U, all→1).
      const listType = body.listType || "URGENT";

      console.log("[info] [phhcCauseListScrapper] Date:", date);
      console.log("[info] [phhcCauseListScrapper] List Type:", listType);

      const formData = {
        date: date,
        listType: listType
      };

      // ========== PHASE 1: SCRAPING (browser only) ==========
      const results = await PHHCCauseListScrapper(formData);
      
      if (!results.pdfLinks || results.pdfLinks.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No PDF links found for the given date",
          data: {
            pdfLinks: [],
            failedPdfs: []
          }
        });
      }

      console.log(`[info] [phhcCauseListScrapper] Found ${results.pdfLinks.length} PDF link(s) to process`);
      console.log(`[info] [phhcCauseListScrapper] Cookie header available: ${results.cookieHeader ? 'Yes' : 'No'}`);

      // ========== PHASE 2: PDF PROCESSING ==========
      // Convert date to DD-MM-YYYY format for storage
      let formattedDate = date;
      if (date.includes('/')) {
        const dateParts = date.split('/');
        formattedDate = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
      }

      // Combined extracted PDFs from all entries
      let allExtractedPdfs = {};
      const failedPdfs = [];

      // Process each PDF link separately (Option A)
      for (const pdfLink of results.pdfLinks) {
        const { url, listDate, listType: linkListType, mainSup } = pdfLink;
        
        try {
          console.log(`[debug] [phhcCauseListScrapper] Processing PDF: ${listDate} - ${linkListType} - ${mainSup}`);
          
          // Check if entry exists
          const { exists, data } = await checkEntryExists(listDate, linkListType, mainSup);
          
          if (exists && data) {
            console.log(`[info] [phhcCauseListScrapper] Using existing data for ${listDate}-${linkListType}-${mainSup}`);
            // Merge existing data into allExtractedPdfs
            Object.assign(allExtractedPdfs, data);
          } else {
            console.log(`[info] [phhcCauseListScrapper] Processing new PDF: ${url}`);
            
            // Download, extract text, and upload PDF (pass cookie header)
            let pdfInfo;
            let errorMessage = "Failed to download/parse PDF";
            try {
              pdfInfo = await fetchUploadAndParsePdf(
                url,
                listDate,
                results.cookieHeader,
                results.refererUrl
              );
            } catch (pdfErr) {
              errorMessage = pdfErr.message || errorMessage;
              console.error(`[error] [phhcCauseListScrapper] Exception processing PDF ${url}:`, pdfErr.message);
            }
            
            if (!pdfInfo) {
              console.error(`[error] [phhcCauseListScrapper] Failed to process PDF: ${url}`);
              failedPdfs.push({
                url,
                listDate,
                listType: linkListType,
                mainSup,
                error: errorMessage
              });
              continue;
            }

            // Create extractedPdfs object for this entry
            const extractedPdfs = {
              [pdfInfo.publicUrl]: pdfInfo.text
            };

            // Save to bucket
            try {
              await saveExtractedPdfs(listDate, linkListType, mainSup, extractedPdfs);
              console.log(`[info] [phhcCauseListScrapper] JSON saved successfully for ${listDate}-${linkListType}-${mainSup}`);
            } catch (saveErr) {
              console.error(`[error] [phhcCauseListScrapper] Failed to save JSON for ${listDate}-${linkListType}-${mainSup}:`, saveErr.message);
              // Continue anyway - we still have the data in memory
            }
            
            // Merge into allExtractedPdfs
            Object.assign(allExtractedPdfs, extractedPdfs);
            
            console.log(`[info] [phhcCauseListScrapper] Successfully processed PDF: ${pdfInfo.publicUrl}`);
          }
        } catch (err) {
          console.error(`[error] [phhcCauseListScrapper] Error processing PDF ${url}:`, err.message);
          failedPdfs.push({
            url,
            listDate,
            listType: linkListType,
            mainSup,
            error: err.message
          });
          // Continue with other PDFs
        }
      }

      console.log(`[info] [phhcCauseListScrapper] PDF processing complete. Total PDFs: ${Object.keys(allExtractedPdfs).length}, Failed: ${failedPdfs.length}`);

      // ========== PHASE 3: NOTIFICATION PROCESSING ==========
      // Get subscribed cases
      const subscribedCases = await getSubscribedCases();
      console.log(`[info] [phhcCauseListScrapper] Found ${subscribedCases.length} subscribed case(s)`);

      const causeList = [];
      let notificationsSent = 0;

      const [dDay, dMonth, dYear] = formattedDate.split("-");
      const dayISO = `${dYear}-${dMonth}-${dDay}`;

      for (const row of subscribedCases) {
        const { case_number, mobile_number, country_code, user_id, case_id } = row;
        const normalizedCase = normalizeCaseNumber(case_number);

        const matchingUrls = new Set();
        for (const [url, pdfText] of Object.entries(allExtractedPdfs)) {
          const normalizedPdfText = normalizeMatchText(pdfText);
          const caseMatch = normalizedCase
            ? normalizedPdfText.includes(normalizedCase)
            : false;
          if (caseMatch) matchingUrls.add(url);
        }

        if (matchingUrls.size === 0) continue;

        if (testMode && String(user_id) !== testNotifyUserId) {
          console.log(
            `[info] [phhcCauseListScrapper] Test mode: PDF match for user_id=${user_id} case_id=${case_id} — skipping notification`
          );
          continue;
        }

        const firstUrl = matchingUrls.values().next().value;
        const identifier = case_number;

        try {
          const notifyId = await notifyPhhcCauseListMatch({
            case_id,
            user_id,
            country_code,
            mobile_number,
            case_number,
            formattedDate,
            pdfUrl: firstUrl,
          });
          if (!notifyId) {
            continue;
          }
          causeList.push({ user_id, case_id });
          await updateUserCase(case_id, formattedDate);
          notificationsSent++;
          console.log(
            `[info] [phhcCauseListScrapper] WhatsApp (order_status) queued for case ${identifier}, day ${dayISO}`
          );
        } catch (notifyErr) {
          console.error(
            `[error] [phhcCauseListScrapper] Failed to notify user ${user_id} for case ${identifier}:`,
            notifyErr
          );
        }
      }

      console.log(`[info] [phhcCauseListScrapper] Notifications sent: ${notificationsSent}`);

      return res.status(200).json({
        success: true,
        message: "PHHC cron job completed successfully",
        data: {
          pdfLinksProcessed: results.pdfLinks.length,
          pdfsExtracted: Object.keys(allExtractedPdfs).length,
          failedPdfs: failedPdfs,
          subscribedCases: subscribedCases.length,
          notificationsSent: notificationsSent,
          testMode,
          ...(testMode ? { testNotifyUserId } : {})
        }
      });

    } catch (error) {
      console.error('[error] [phhcCauseListScrapper] Error during scraping service: ', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      console.log("[end] [phhcCauseListScrapper] scraper service ended at:", new Date().toISOString());
    }
  });

