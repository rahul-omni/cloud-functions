const functions = require("firebase-functions");
const { fetchhighCourtCauseList } = require("./hcPdfScrapper");
const { getSubscribedCases, insertNotifications, insertCauselist } = require("./components");
const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");

const regionFunctions = functions.region("asia-south1");
const storage = new Storage();
const bucketName = "jharkhandcauselistpdf"; // PUBLIC bucket

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

exports.hcJharkhandCauseList = regionFunctions.runWith(runtimeOpts).https.onRequest(async (req, res) => {
  console.log("[start] hcJharkhandCauseList started at:", new Date().toISOString());

  const date = new Date();
  date.setDate(date.getDate() - 1); // Yesterday's date

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based
  const year = date.getFullYear();

  const formattedDate = `${day}-${month}-${year}`;
  const formData = { causelistDate: formattedDate, stateCourt: "7", courtBench: "1" };

  let extractedPdfs = {};
  const fileName = `extractedPdfs-HC-${formattedDate}.json`;
  const file = storage.bucket(bucketName).file(fileName);
  const causeList = [];

  try {
    const [exists] = await file.exists();
    let extractedPdfs = {};

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
    }

    // Process notifications after PDF processing (regardless of whether JSON existed)
    console.log("[info] Processing notifications for extracted PDFs...");

    // Get subscribed cases
    const subscribedCases = await getSubscribedCases();
    console.log(`[info] Found ${subscribedCases.length} subscribed cases for Jharkhand High Court`);

    const normalizeCaseNumber = (caseNumber) => {
      if (!caseNumber) return null;
      const parts = caseNumber.match(/\D+|\d+/g);
      if (!parts) return caseNumber.replace(/\s+/g, "").toLowerCase();
      return parts.map((p) => (/^\d+$/.test(p) ? p.replace(/^0+/, "") : p.replace(/[-/]/g, ""))).join("").replace(/\s+/g, "").toLowerCase();
    };

    // Search PDFs for subscribed cases
    for (const row of subscribedCases) {
      const { case_number, mobile_number, user_id, case_id } = row;
      const normalizedCase = normalizeCaseNumber(case_number);

      for (const [url, pdfText] of Object.entries(extractedPdfs)) {
        const normalizedPdfText = pdfText.replace(/\s+/g, "").replace(/[-/]/g, "").toLowerCase();
        const caseMatch = normalizedCase ? normalizedPdfText.includes(normalizedCase) : false;

        if (caseMatch) {
          try {
            const identifier = case_number;
            const message = `You have a new order on ${identifier} dated ${formattedDate}.\nSee ${url} for more details.`;

            const { id } = await insertNotifications(identifier, user_id, "whatsapp", mobile_number, message);
            causeList.push({ user_id, case_id });
            await processWhatsAppNotificationsWithTemplate(id, "order_status", [identifier, formattedDate, url]);
          } catch (notifyErr) {
            console.error(`[error] Failed to notify user ${user_id} for case ${identifier}:`, notifyErr);
          }
        }
      }
    }

    await insertCauselist(causeList);
    return res.status(200).json({ success: true, message: "HC cron job completed successfully" });
  } catch (error) {
    console.error("[error] hcJharkhandCauseList error:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    console.log("[end] hcJharkhandCauseList finished at:", new Date().toISOString());
  }
});