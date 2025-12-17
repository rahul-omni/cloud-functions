const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');
const { getSubscribedCases, insertNotifications, insertCauselist, updateUserCase } = require('./components/db');
const pdfParse = require("pdf-parse");
const axios = require('axios');
const { processWhatsAppNotifications, processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");
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

    // move date to tomorrow
    date.setDate(date.getDate() + 1);

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

      // Function to normalize input case number: remove leading zeros, unify separators
      function normalizeCaseNumber(caseNumber) {
        if (!caseNumber) return null;

        const parts = caseNumber.match(/\D+|\d+/g); // split digits and non-digits
        if (!parts) return caseNumber.replace(/\s+/g, '').toLowerCase();

        const normalizedParts = parts.map(part => {
          if (/^\d+$/.test(part)) {
            return part.replace(/^0+/, ''); // remove leading zeros
          } else {
            return part.replace(/[-/]/g, ''); // remove separators
          }
        });

        return normalizedParts.join('').replace(/\s+/g, '').toLowerCase();
      }

      // In your search loop
      for (const row of subscribedCases) {
        const { case_number, diary_number, mobile_number, user_id, case_id } = row;

        console.log(case_number, diary_number, mobile_number, user_id, case_id, "details");

        // Normalize the case number (remove leading zeros, unify separators)
        const normalizedCase = normalizeCaseNumber(case_number);

        for (const [url, pdfText] of Object.entries(extractedPdfs)) {
          // Normalize PDF text for case number matching
          const normalizedPdfText = pdfText.replace(/\s+/g, '').replace(/[-/]/g, '').toLowerCase();

          // Case number match using normalized text
          const caseMatch = normalizedCase ? normalizedPdfText.includes(normalizedCase) : false;

          // Diary number match using regex like before
          const safeDiaryNumber = diary_number ? diary_number.replace(/\//g, '[/-]') : null;
          const diaryRegex = safeDiaryNumber ? new RegExp(`[ \\n]${safeDiaryNumber}[ \\n.]`, 'g') : null;
          const diaryMatch = diaryRegex ? diaryRegex.test(pdfText) : false;

          if (caseMatch || diaryMatch) {
            try {
              const message = `You have a new order on ${caseMatch ? case_number : diary_number} dated ${formattedDate}.\nSee ${url} for more details.`;
              const { id } = await insertNotifications(caseMatch ? case_number : diary_number, user_id, 'whatsapp', mobile_number, message);

              causeList.push({
                user_id,
                case_id,
              });

              await processWhatsAppNotificationsWithTemplate(id, 'order_status', [caseMatch ? case_number : diary_number, formattedDate, url]);
              await updateUserCase(case_id, formattedDate);
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
