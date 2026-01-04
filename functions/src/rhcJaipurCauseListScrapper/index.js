const functions = require("firebase-functions");
const { fetchRHCJaipurCauseList } = require("./rhcJaipurCauseListScrapper");
const { 
  checkEntryExists, 
  saveExtractedPdfs, 
  fetchUploadAndParsePdf,
  getSubscribedCases,
  insertNotifications,
  updateUserCase
} = require("./components");
const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");

const regionFunctions = functions.region("asia-south1");

const runtimeOpts = {
  timeoutSeconds: 540, // Maximum allowed: 9 minutes (540 seconds)
  memory: '2GB',
};

/**
 * Normalize case number for matching
 * Same logic as High Court scraper
 */
const normalizeCaseNumber = (caseNumber) => {
  if (!caseNumber) return null;
  const parts = caseNumber.match(/\D+|\d+/g);
  if (!parts) return caseNumber.replace(/\s+/g, "").toLowerCase();
  return parts.map((p) => (/^\d+$/.test(p) ? p.replace(/^0+/, "") : p.replace(/[-/]/g, ""))).join("").replace(/\s+/g, "").toLowerCase();
};

/**
 * HTTP Cloud Function for scraping Rajasthan High Court Jaipur cause list
 * 
 * Request body:
 * {
 *   "date": "DD/MM/YYYY" or "DD-MM-YYYY", // Date for cause list (defaults to tomorrow)
 * }
 */
exports.rhcJaipurCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

    console.log("[start] [rhcJaipurCauseListScrapper] scraper service started at:", new Date().toISOString());

    try {
      // Parse request body
      let body = req.body;
      if (typeof req.body === 'string') {
        body = JSON.parse(body);
      }

      // Get date from request or default to tomorrow
      let date = body?.date || null;
      if (!date) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const year = tomorrow.getFullYear();
        date = `${day}/${month}/${year}`; // DD/MM/YYYY format
      }

      console.log("[info] [rhcJaipurCauseListScrapper] Date:", date);

      const formData = {
        date: date
      };

      // ========== PHASE 1: SCRAPING ==========
      // Fetch cause list (keep existing scraping function as-is)
      const results = await fetchRHCJaipurCauseList(formData);
      
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

      console.log(`[info] [rhcJaipurCauseListScrapper] Found ${results.pdfLinks.length} PDF link(s) to process`);
      console.log(`[info] [rhcJaipurCauseListScrapper] Cookie header available: ${results.cookieHeader ? 'Yes' : 'No'}`);

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
        const { url, listDate, mainSup, courtNo, judges, linkType } = pdfLink;
        
        try {
          console.log(`[debug] [rhcJaipurCauseListScrapper] Processing PDF: ${listDate} - Court ${courtNo} - ${mainSup} (${linkType})`);
          
          // Check if entry exists (using courtNo instead of listType)
          const { exists, data } = await checkEntryExists(listDate, courtNo, mainSup);
          
          if (exists && data) {
            console.log(`[info] [rhcJaipurCauseListScrapper] Using existing data for ${listDate}-Court${courtNo}-${mainSup}`);
            // Merge existing data into allExtractedPdfs
            Object.assign(allExtractedPdfs, data);
          } else {
            console.log(`[info] [rhcJaipurCauseListScrapper] Processing new PDF: ${url}`);
            
            // Download, extract text, and upload PDF (pass cookie header)
            let pdfInfo;
            let errorMessage = "Failed to download/parse PDF";
            try {
              pdfInfo = await fetchUploadAndParsePdf(url, listDate, results.cookieHeader);
            } catch (pdfErr) {
              errorMessage = pdfErr.message || errorMessage;
              console.error(`[error] [rhcJaipurCauseListScrapper] Exception processing PDF ${url}:`, pdfErr.message);
            }
            
            if (!pdfInfo) {
              console.error(`[error] [rhcJaipurCauseListScrapper] Failed to process PDF: ${url}`);
              failedPdfs.push({
                url,
                listDate,
                mainSup,
                courtNo,
                judges,
                linkType,
                error: errorMessage
              });
              continue;
            }

            // Create extractedPdfs object for this entry
            const extractedPdfs = {
              [pdfInfo.publicUrl]: pdfInfo.text
            };

            // Save to bucket (using courtNo instead of listType)
            try {
              await saveExtractedPdfs(listDate, courtNo, mainSup, extractedPdfs);
              console.log(`[info] [rhcJaipurCauseListScrapper] JSON saved successfully for ${listDate}-Court${courtNo}-${mainSup}`);
            } catch (saveErr) {
              console.error(`[error] [rhcJaipurCauseListScrapper] Failed to save JSON for ${listDate}-Court${courtNo}-${mainSup}:`, saveErr.message);
              // Continue anyway - we still have the data in memory
            }
            
            // Merge into allExtractedPdfs
            Object.assign(allExtractedPdfs, extractedPdfs);
            
            console.log(`[info] [rhcJaipurCauseListScrapper] Successfully processed PDF: ${pdfInfo.publicUrl}`);
          }
        } catch (err) {
          console.error(`[error] [rhcJaipurCauseListScrapper] Error processing PDF ${url}:`, err.message);
          failedPdfs.push({
            url,
            listDate,
            mainSup,
            courtNo,
            judges,
            linkType,
            error: err.message
          });
          // Continue with other PDFs
        }
      }

      console.log(`[info] [rhcJaipurCauseListScrapper] PDF processing complete. Total PDFs: ${Object.keys(allExtractedPdfs).length}, Failed: ${failedPdfs.length}`);

      // ========== PHASE 3: NOTIFICATION PROCESSING ==========
      // Get subscribed cases
      const subscribedCases = await getSubscribedCases();
      console.log(`[info] [rhcJaipurCauseListScrapper] Found ${subscribedCases.length} subscribed case(s)`);

      const causeList = [];
      let notificationsSent = 0;

      // Search PDFs for subscribed cases
      for (const row of subscribedCases) {
        const { case_number, mobile_number, user_id, case_id } = row;
        const normalizedCase = normalizeCaseNumber(case_number);

        for (const [url, pdfText] of Object.entries(allExtractedPdfs)) {
          const normalizedPdfText = pdfText.replace(/\s+/g, "").replace(/[-/]/g, "").toLowerCase();
          const caseMatch = normalizedCase ? normalizedPdfText.includes(normalizedCase) : false;

          if (caseMatch) {
            try {
              const identifier = case_number;
              const message = `You have a new order on ${identifier} dated ${formattedDate}.\nSee ${url} for more details.`;

              const { id } = await insertNotifications(identifier, user_id, "whatsapp", mobile_number, message);
              causeList.push({ user_id, case_id });
              await processWhatsAppNotificationsWithTemplate(id, "order_status", [identifier, formattedDate, url]);
              await updateUserCase(case_id, formattedDate);
              notificationsSent++;
              console.log(`[info] [rhcJaipurCauseListScrapper] Notification sent for case ${identifier}`);
            } catch (notifyErr) {
              console.error(`[error] [rhcJaipurCauseListScrapper] Failed to notify user ${user_id} for case ${identifier}:`, notifyErr);
            }
          }
        }
      }

      console.log(`[info] [rhcJaipurCauseListScrapper] Notifications sent: ${notificationsSent}`);

      return res.status(200).json({
        success: true,
        message: "RHC Jaipur cron job completed successfully",
        data: {
          pdfLinksProcessed: results.pdfLinks.length,
          pdfsExtracted: Object.keys(allExtractedPdfs).length,
          failedPdfs: failedPdfs,
          subscribedCases: subscribedCases.length,
          notificationsSent: notificationsSent
        }
      });

    } catch (error) {
      console.error('[error] [rhcJaipurCauseListScrapper] Error during scraping service: ', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      console.log("[end] [rhcJaipurCauseListScrapper] scraper service ended at:", new Date().toISOString());
    }
  });

