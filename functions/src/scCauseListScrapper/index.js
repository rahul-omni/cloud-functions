const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');
const { getSubscribedCases, insertNotifications } = require('./components/db');
const pdfParse = require("pdf-parse");
const axios = require('axios');
const { processWhatsAppNotifications } = require("../notification/processWhatsappNotification");
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
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.scCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

    console.log("[start] [scCauseListScrapper] scraper service started at:", new Date().toISOString());

    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based
    const year = date.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

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
            console.log(`[debug] [scCauseListScrapper] Processing PDF: ${row.causeListLinks[0].url}`);

            const response = await axios.get(row.causeListLinks[0].url, {
              responseType: "arraybuffer",
              timeout: 30000,
            });

            const pdfData = await pdfParse(response.data);
            extractedPdfs[row.causeListLinks[0].url] = pdfData.text;
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

      for (const row of subscribedCases) {
        const { case_number, diary_number, mobile_number, user_id } = row;

        for (const [url, pdfText] of Object.entries(extractedPdfs)) {
          // Build regex patterns (match number surrounded by space, newline, or period)
          const caseRegex = case_number ? new RegExp(`[ \\n]${case_number}[ \\n.]`, "g") : null;
          const diaryRegex = diary_number ? new RegExp(`[ \\n]${diary_number}[ \\n.]`, "g") : null;

          if ((caseRegex && caseRegex.test(pdfText)) || (diaryRegex && diaryRegex.test(pdfText))) {
            try {
              const message = `You have a new order on ${diary_number}.\nSee ${url} for more details.`;
              const { id } = await insertNotifications(diary_number, user_id, 'whatsapp', '9690665426', message);
              await processWhatsAppNotifications(id);
            } catch (notifyErr) {
              console.error(`[error] Failed to notify user ${user_id} for case ${case_number || diary_number}:`, notifyErr);
            }
          }
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
