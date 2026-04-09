const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const storage = new Storage();
/** Grant Cloud Functions runtime SA (e.g. PROJECT_ID@appspot.gserviceaccount.com) roles/storage.objectCreator on this bucket, or uploads fall back to the court URL only. */
const bucketName = "phhc-chandigarh-causelist";

/** PHHC often serves PDFs as application/octet-stream or with no correct Content-Type */
function bufferLooksLikePdf(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 5) return false;
  let i = 0;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) i = 3;
  return buf.slice(i, i + 4).toString("ascii") === "%PDF";
}

function bufferLooksLikeHtml(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const head = buf.slice(0, 256).toString("utf-8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

/**
 * Generate filename for JSON storage
 * Format: {date}-{listType}-{mainSup}.json
 * Removes spaces from listType and mainSup
 * Converts date from DD/MM/YYYY to DD-MM-YYYY
 */
const generateJsonFileName = (date, listType, mainSup) => {
  // Convert date from DD/MM/YYYY to DD-MM-YYYY
  let formattedDate = date;
  const dateParts = date.split('/');
  if (dateParts.length === 3) {
    // Convert DD/MM/YYYY to DD-MM-YYYY
    formattedDate = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
  } else {
    // Check if already in DD-MM-YYYY format
    const dashParts = date.split('-');
    if (dashParts.length !== 3) {
      throw new Error(`Invalid date format: ${date}. Expected DD/MM/YYYY or DD-MM-YYYY`);
    }
    // Already in correct format, use as is
    formattedDate = date;
  }
  
  // Remove spaces from listType and mainSup
  const cleanListType = (listType || '').replace(/\s+/g, '');
  const cleanMainSup = (mainSup || '').replace(/\s+/g, '');
  
  return `${formattedDate}-${cleanListType}-${cleanMainSup}.json`;
};

/**
 * Check if entry exists in bucket
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format
 * @param {string} listType - List type (e.g., "Urgent", "Regular")
 * @param {string} mainSup - Main/Sup value (e.g., "Main List", "Supplementary List")
 * @returns {Promise<{exists: boolean, data: object|null}>}
 */
const checkEntryExists = async (date, listType, mainSup) => {
  try {
    const fileName = generateJsonFileName(date, listType, mainSup);
    const file = storage.bucket(bucketName).file(fileName);
    const [exists] = await file.exists();
    
    if (exists) {
      console.log(`[info] [storage] Found existing JSON: gs://${bucketName}/${fileName}`);
      const [contents] = await file.download();
      const data = JSON.parse(contents.toString());
      return { exists: true, data };
    } else {
      console.log(`[info] [storage] JSON not found: gs://${bucketName}/${fileName}`);
      return { exists: false, data: null };
    }
  } catch (error) {
    console.error(`[error] [storage] Error checking entry existence:`, error.message);
    return { exists: false, data: null };
  }
};

/**
 * Save extracted PDFs to bucket as JSON
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format
 * @param {string} listType - List type
 * @param {string} mainSup - Main/Sup value
 * @param {object} extractedPdfs - Object with { [pdfUrl]: extractedText }
 * @returns {Promise<void>}
 */
const saveExtractedPdfs = async (date, listType, mainSup, extractedPdfs) => {
  try {
    const fileName = generateJsonFileName(date, listType, mainSup);
    const file = storage.bucket(bucketName).file(fileName);
    
    await file.save(JSON.stringify(extractedPdfs, null, 2), { 
      contentType: "application/json" 
    });
    
    console.log(`[info] [storage] Saved extractedPdfs JSON to gs://${bucketName}/${fileName}`);
  } catch (error) {
    console.error(`[error] [storage] Error saving extracted PDFs:`, error.message);
    throw error;
  }
};

/**
 * Download PDF, extract text, upload to bucket, and return signed URL
 * @param {string} url - PDF URL to download
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format (for folder structure)
 * @param {string} cookieHeader - Cookie header string from browser session
 * @param {string} [refererUrl] - Page URL from Puppeteer (best Referer for PDF request)
 * @returns {Promise<{publicUrl: string, signedUrl: string, text: string}>}
 */
const fetchUploadAndParsePdf = async (url, date, cookieHeader = null, refererUrl = null) => {
  try {
    console.log(`[debug] [storage] Downloading PDF from: ${url}`);
    console.log(`[debug] [storage] Using cookies: ${cookieHeader ? "Yes" : "No"}`);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      Referer:
        refererUrl && String(refererUrl).trim()
          ? String(refererUrl).trim()
          : "https://highcourtchd.gov.in/?mod=causelist",
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers,
      timeout: 90000,
      maxRedirects: 8,
      maxContentLength: 80 * 1024 * 1024,
      maxBodyLength: 80 * 1024 * 1024,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    console.log(`[debug] [storage] Response status: ${response.status}`);
    const contentType = String(response.headers["content-type"] || "");
    console.log(`[debug] [storage] Content-Type: ${contentType}`);

    const pdfData = Buffer.from(response.data);

    if (bufferLooksLikeHtml(pdfData)) {
      const preview = pdfData.slice(0, 400).toString("utf-8").replace(/\s+/g, " ");
      throw new Error(
        `Server returned HTML instead of PDF (status ${response.status}). Preview: ${preview.slice(0, 280)}`
      );
    }

    if (!bufferLooksLikePdf(pdfData)) {
      throw new Error(
        `Response is not a PDF (no %PDF header). Content-Type: ${contentType || "none"}, size: ${pdfData.length} bytes`
      );
    }

    console.log(`[debug] [storage] PDF downloaded, size: ${pdfData.length} bytes`);

    console.log(`[debug] [storage] Extracting text from PDF...`);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
    const pdfDoc = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += pageText + "\n";
    }
    
    console.log(`[debug] [storage] Extracted ${fullText.length} characters from PDF`);

    // Convert date to DD-MM-YYYY format for folder structure
    let formattedDate = date;
    if (date.includes('/')) {
      const dateParts = date.split('/');
      formattedDate = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
    }

    const filePath = `${formattedDate}/${Date.now()}-${Math.floor(Math.random() * 10000)}.pdf`;
    let publicUrl;

    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);
      console.log(`[debug] [storage] Uploading PDF to gs://${bucketName}/${filePath}...`);
      await file.save(pdfData, {
        contentType: "application/pdf",
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });
      publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath)}`;
      console.log(`[info] [storage] PDF uploaded to GCS: ${publicUrl}`);
    } catch (uploadErr) {
      publicUrl = url;
      console.warn(
        `[warn] [storage] GCS upload failed (${uploadErr.message}). Using PHHC URL for links/notifications. Fix IAM: grant storage.objectCreator on gs://${bucketName} to the function service account.`
      );
    }

    return {
      publicUrl,
      signedUrl: publicUrl,
      text: fullText,
    };
  } catch (err) {
    const errorDetails = {
      message: err.message,
      url,
      status: err.response?.status,
      statusText: err.response?.statusText,
      responsePreview: err.response?.data
        ? Buffer.from(err.response.data).toString("utf-8").substring(0, 500)
        : null,
    };
    console.error(
      `[error] [storage] Failed to download/upload/parse PDF from ${url}:`,
      JSON.stringify(errorDetails, null, 2)
    );
    const msg =
      err.response?.status != null
        ? `HTTP ${err.response.status} ${err.response.statusText || ""}: ${err.message}`.trim()
        : err.message;
    throw new Error(msg);
  }
};

module.exports = {
  checkEntryExists,
  saveExtractedPdfs,
  fetchUploadAndParsePdf,
  generateJsonFileName,
  bucketName
};

