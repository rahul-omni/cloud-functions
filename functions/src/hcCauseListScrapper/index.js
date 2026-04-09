const functions = require("firebase-functions");
const { fetchhighCourtCauseList } = require("./hcPdfScrapper");
const { getSubscribedCases, insertNotifications, insertCauselist, updateUserCase } = require("./components");
const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");

const regionFunctions = functions.region("asia-south1");
const storage = new Storage();
const bucketName = "causelistpdflinks"; // PUBLIC bucket

const runtimeOpts = { timeoutSeconds: 540, memory: "2GB" };

// Download PDF, extract text, upload to public bucket
async function fetchUploadAndParsePdf(url, cookieHeader, bucketName, filePath) {
  try {
    // Fetch PDF
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://hcservices.ecourts.gov.in/",
        Cookie: cookieHeader,
      },
    });

    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("pdf")) throw new Error("Not a valid PDF");

    const pdfData = response.data;

    // Extract text using pdfjs
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDoc = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }

    // Upload PDF to bucket
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    await file.save(pdfData, { contentType: "application/pdf" });

    // Construct public URL directly
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath)}`;

    return { publicUrl, text: fullText };
  } catch (err) {
    console.error(`[error] Failed to download/upload/parse PDF from ${url}:`, err.message);
    return null;
  }
}

exports.hcCauseListScrapper = regionFunctions.runWith(runtimeOpts).https.onRequest(async (req, res) => {
  console.log("[start] hcCauseListScrapper started at:", new Date().toISOString());

  // Accept date override from payload: { "date": "DD-MM-YYYY" }
  // If not provided, default to tomorrow (existing behavior).
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const payloadDate = (body && typeof body.date === "string") ? body.date.trim() : "";
  const ddmmyyyy = /^\d{2}-\d{2}-\d{4}$/;

  let formattedDate = "";
  if (payloadDate && ddmmyyyy.test(payloadDate)) {
    formattedDate = payloadDate;
    console.log(`[info] Using payload date override: ${formattedDate}`);
  } else {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based
    const year = date.getFullYear();
    formattedDate = `${day}-${month}-${year}`;
    if (payloadDate) {
      console.log(`[warning] Invalid payload date "${payloadDate}". Expected DD-MM-YYYY. Falling back to default: ${formattedDate}`);
    }
  }

  const formData = { causelistDate: formattedDate, stateCourt: "26", courtBench: "1" };

  let extractedPdfs = {};
  const fileName = `extractedPdfs-HC-DELHI-${formattedDate}.json`;
  const file = storage.bucket(bucketName).file(fileName);
  const causeList = [];

  try {
    const [exists] = await file.exists();
    if (exists) {
      console.log(`[info] Found existing JSON in bucket: gs://${bucketName}/${fileName}`);
      const [contents] = await file.download();
      extractedPdfs = JSON.parse(contents.toString());
    } else {
      console.log("[info] No JSON found, fetching cause list...");
      const { results, cookieHeader } = await fetchhighCourtCauseList(formData);

      if (results.length === 0) {
        return res.status(200).json({ success: true, message: "No results found", data: [] });
      }

      for (const url of results) {
        console.log(`[debug] Processing PDF: ${url}`);
        try {
          const filePath = `${formattedDate}/${Date.now()}-${Math.floor(Math.random() * 10000)}.pdf`;

          const pdfInfo = await fetchUploadAndParsePdf(url, cookieHeader, "downloaded_pdfs_hc", filePath);
          if (!pdfInfo) continue;

          extractedPdfs[pdfInfo.publicUrl] = pdfInfo.text;
          console.log(`[info] Parsed and uploaded PDF → ${pdfInfo.publicUrl}`);
        } catch (err) {
          console.error(`[error] Failed to handle PDF ${url}:`, err.message);
        }
      }

      // Save JSON to bucket
      await file.save(JSON.stringify(extractedPdfs, null, 2), { contentType: "application/json" });
      console.log(`[info] Saved extractedPdfs JSON to gs://${bucketName}/${fileName}`);
      // Continue to notification step in the same run (previously we returned early here).
    }

    // Get subscribed cases
    const subscribedCases = await getSubscribedCases();

    const normalizeCaseNumber = (caseNumber) => {
      if (!caseNumber) return null;
      const parts = caseNumber.match(/\D+|\d+/g);
      if (!parts) return caseNumber.replace(/\s+/g, "").toLowerCase();
      return parts.map((p) => (/^\d+$/.test(p) ? p.replace(/^0+/, "") : p.replace(/[-/]/g, ""))).join("").replace(/\s+/g, "").toLowerCase();
    };

    // Search PDFs for subscribed cases, and send ONE message per (user_id, case_id, day)
    const [dDay, dMonth, dYear] = formattedDate.split("-");
    const dayISO = `${dYear}-${dMonth}-${dDay}`; // YYYY-MM-DD for notifications.day

    for (const row of subscribedCases) {
      const { case_number, mobile_number, country_code, user_id, case_id } = row;
      const normalizedCase = normalizeCaseNumber(case_number);

      // Collect all matching PDFs for this user+case in this run
      const matchingUrls = new Set();
      for (const [url, pdfText] of Object.entries(extractedPdfs)) {
        const normalizedPdfText = pdfText.replace(/\s+/g, "").replace(/[-/]/g, "").toLowerCase();
        const caseMatch = normalizedCase ? normalizedPdfText.includes(normalizedCase) : false;
        if (caseMatch) matchingUrls.add(url);
      }

      if (matchingUrls.size === 0) continue;

      // For now (template not approved for multiple links yet): send only the first matched link.
      const firstUrl = matchingUrls.values().next().value;
      const identifier = case_number; // Template "diary number" should receive the CASE number from case_id.
      const message = `You have a new order on ${identifier} dated ${formattedDate}.\nLink: ${firstUrl}`;

      try {
        const contact = `${country_code || ""}${mobile_number || ""}`.trim();
        const inserted = await insertNotifications(
          case_id,
          dayISO,
          user_id,
          "whatsapp",
          contact,
          message
        );
        if (!inserted || !inserted.id) {
          console.log(
            `[info] Skip WhatsApp: already sent for case_id=${case_id} day=${dayISO} (notifications dedupe)`
          );
          continue;
        }
        causeList.push({ user_id, case_id });
        // Template params: [caseNumber, formattedDate, link]
        await processWhatsAppNotificationsWithTemplate(inserted.id, "order_status", [identifier, formattedDate, firstUrl]);
        await updateUserCase(case_id, formattedDate);
      } catch (notifyErr) {
        console.error(`[error] Failed to notify user ${user_id} for case ${identifier}:`, notifyErr);
      }
    }
    return res.status(200).json({ success: true, message: "HC cron job completed successfully" });
  } catch (error) {
    console.error("[error] hcCauseListScrapper error:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    console.log("[end] hcCauseListScrapper finished at:", new Date().toISOString());
  }
});
