const functions = require("firebase-functions");
const regionFunctions = functions.region("asia-south1");
const { delhiCauseListScrapper } = require("./delhiCauseListScrapper.js");
const { checkCaseIds, insertNotifications } = require("./components/db.js");
const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification.js");
const { Storage } = require("@google-cloud/storage");

const { delhiCourtFlatList } = require("./components/delhiCourtFlatList.js");
const { launchBrowser, createPage, navigateToPage, closeBrowser } = require("./components/browserManager.js");

// GCS bucket
const storage = new Storage();
const bucketName = "causelistdelhidistrictcourt";

// Runtime options
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "2GB"
};

/* ---------------------------------------------------
    DAILY FILE NAME
--------------------------------------------------- */
function getScrapedFileName() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  return `scraped-${yyyy}-${mm}-${dd}.json`;
}

/* ---------------------------------------------------
    LOAD TODAY'S SCRAPED LIST
--------------------------------------------------- */
async function loadScrapedList() {
  const filename = getScrapedFileName();
  const file = storage.bucket(bucketName).file(filename);

  try {
    const exists = (await file.exists())[0];
    if (!exists) {
      console.log(`[info] No file found → starting fresh: ${filename}`);
      return { scraped: [] };
    }

    const contents = (await file.download())[0].toString();
    console.log(`[info] Loaded: ${filename}`);
    return JSON.parse(contents);

  } catch (err) {
    console.error("[error] loadScrapedList:", err);
    return { scraped: [] };
  }
}

/* ---------------------------------------------------
    SAVE TODAY'S SCRAPED LIST
--------------------------------------------------- */
async function saveScrapedList(data) {
  const filename = getScrapedFileName();
  const file = storage.bucket(bucketName).file(filename);

  try {
    await file.save(JSON.stringify(data, null, 2), {
      contentType: "application/json"
    });

    console.log(`[info] Updated file: ${filename}`);

  } catch (err) {
    console.error("[error] saveScrapedList:", err);
  }
}

/* ---------------------------------------------------
    MAIN SCRAPER
--------------------------------------------------- */
exports.delhiDistrictCourtCauseListScrapper = regionFunctions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {

    console.log("[start] Delhi Scraper");

    // Tomorrow's cause list date (DD/MM/YYYY)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate =
      `${String(tomorrow.getMonth() + 1).padStart(2, "0")}/` +
      `${String(tomorrow.getDate()).padStart(2, "0")}/` +
      `${tomorrow.getFullYear()}`;

    try {
      const scrapedData = await loadScrapedList();
      const scraped = new Set(scrapedData.scraped);

      // Filter remaining items
      const remaining = delhiCourtFlatList.filter(item => !scraped.has(item));

      if (remaining.length === 0) {
        return res.status(200).json({
          success: true,
          message: "All scraped for today — nothing left."
        });
      }

      // Take batch of 10
      const batch = remaining.slice(0, 1);
      console.log(`[info] Batch size: ${batch.length}`);

      let browserCourt = null;
      const browser = await launchBrowser();
      const page = await createPage(browser);
      for (const entry of batch) {
        console.log(`[run] Scraping: ${entry}`);

        try {
          const [court, complex, courtNumber] = entry.split(";");

          if (browserCourt !== court) {
            await navigateToPage(page, court);
            browserCourt = court;
          }

          const formData = {
            courtComplex: complex,
            courtNumber,
            causeListDate: formattedDate
          };

          const url = `https://${court}.dcourts.gov.in/cause-list-%E2%81%84-daily-board/#`;

          const results = await delhiCauseListScrapper(formData, page);

          // pass the ARRAY, not a string
          const existingCases = await checkCaseIds(results);

          for (const existingCase of existingCases) {
            console.log(`[info] Preparing notification for case: ${existingCase}`);
            const message = `You have a new order on ${existingCase.case_number} dated ${formattedDate}.\nSee ${url} for more details.`;
            const { id } = await insertNotifications(existingCase.diary_number, existingCase.user_id, 'whatsapp', existingCase.mobile_number, message);
            await processWhatsAppNotificationsWithTemplate(id, 'order_status', [existingCase.case_number, formattedDate, url]);
          }
          scraped.add(entry);

        } catch (err) {
          console.error(`[error] Failed for ${entry}:`, err.message);
        }
      }

      await saveScrapedList({ scraped: Array.from(scraped) });

      await closeBrowser(browser);

      return res.status(200).json({
        success: true,
        message: `Processed ${batch.length} items successfully`
      });

    } catch (error) {
      console.error("[error] Scraper failure:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
