const { Storage } = require("@google-cloud/storage");
const axios = require("axios");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const storage = new Storage();
const bucketName = "rhc-jaipur-causelist";

/**
 * Generate filename for JSON storage
 * Format: {date}-{courtNumber}-{mainSup}.json
 * Removes spaces from mainSup
 * Converts date from DD/MM/YYYY to DD-MM-YYYY
 */
const generateJsonFileName = (date, courtNumber, mainSup) => {
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
  
  // Clean court number (remove spaces, ensure it's a string)
  const cleanCourtNumber = String(courtNumber || '').replace(/\s+/g, '');
  
  // Clean mainSup (remove spaces)
  // mainSup can be "Main List", "Supplementary List", "D", "S", etc.
  let cleanMainSup = (mainSup || '').replace(/\s+/g, '');
  // Normalize: D → Main, S → Supplementary
  if (cleanMainSup === 'D' || cleanMainSup === 'Daily') {
    cleanMainSup = 'Main';
  } else if (cleanMainSup === 'S' || cleanMainSup === 'Supplementary') {
    cleanMainSup = 'Supplementary';
  }
  
  return `${formattedDate}-Court${cleanCourtNumber}-${cleanMainSup}.json`;
};

/**
 * Check if entry exists in bucket
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format
 * @param {string} courtNumber - Court number (e.g., "4", "6", "7")
 * @param {string} mainSup - Main/Sup value (e.g., "Main List", "Supplementary List", "D", "S")
 * @returns {Promise<{exists: boolean, data: object|null}>}
 */
const checkEntryExists = async (date, courtNumber, mainSup) => {
  try {
    const fileName = generateJsonFileName(date, courtNumber, mainSup);
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
 * @param {string} courtNumber - Court number (e.g., "4", "6", "7")
 * @param {string} mainSup - Main/Sup value (e.g., "Main List", "Supplementary List", "D", "S")
 * @param {object} extractedPdfs - Object with { [pdfUrl]: extractedText }
 * @returns {Promise<void>}
 */
const saveExtractedPdfs = async (date, courtNumber, mainSup, extractedPdfs) => {
  try {
    const fileName = generateJsonFileName(date, courtNumber, mainSup);
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
 * Download PDF, extract text, upload to bucket, and return public URL
 * @param {string} url - PDF URL to download
 * @param {string} date - Date in DD/MM/YYYY or DD-MM-YYYY format (for folder structure)
 * @param {string} cookieHeader - Cookie header string from browser session
 * @returns {Promise<{publicUrl: string, signedUrl: string, text: string}|null>}
 */
const fetchUploadAndParsePdf = async (url, date, cookieHeader = null) => {
  try {
    console.log(`[debug] [storage] Downloading PDF from: ${url}`);
    console.log(`[debug] [storage] Using cookies: ${cookieHeader ? 'Yes' : 'No'}`);
    
    // Prepare headers
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Referer": "https://hcraj.nic.in/",
    };
    
    // Add cookies if provided
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }
    
    // Fetch PDF
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: headers,
      timeout: 60000, // 60 seconds timeout
      maxRedirects: 5, // Allow redirects
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept 2xx and 3xx status codes
      }
    });

    console.log(`[debug] [storage] Response status: ${response.status}`);

    const contentType = response.headers["content-type"] || "";
    console.log(`[debug] [storage] Content-Type: ${contentType}`);
    
    if (!contentType.includes("pdf")) {
      // Check if response is HTML (might be an error page)
      const responseText = response.data.toString('utf-8').substring(0, 500);
      if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
        throw new Error(`Server returned HTML instead of PDF. Status: ${response.status}. Response preview: ${responseText.substring(0, 200)}`);
      }
      throw new Error(`Not a valid PDF. Content-Type: ${contentType}, Status: ${response.status}`);
    }

    const pdfData = response.data;
    console.log(`[debug] [storage] PDF downloaded, size: ${pdfData.length} bytes`);

    // Extract text using pdfjs
    console.log(`[debug] [storage] Extracting text from PDF...`);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
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

    // Upload PDF to bucket
    const filePath = `${formattedDate}/${Date.now()}-${Math.floor(Math.random() * 10000)}.pdf`;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    console.log(`[debug] [storage] Uploading PDF to gs://${bucketName}/${filePath}...`);
    
    // Upload PDF (bucket must be made public via IAM for uniform bucket-level access)
    await file.save(pdfData, { 
      contentType: "application/pdf",
      metadata: {
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      }
      // Note: Cannot use predefinedAcl or makePublic() when uniform bucket-level access is enabled
      // Bucket must be made public via IAM policies instead
    });
    console.log(`[info] [storage] PDF uploaded successfully`);

    // Construct public URL (will be accessible once bucket is made public via IAM)
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath)}`;

    console.log(`[info] [storage] PDF processed successfully: ${publicUrl}`);
    
    return { 
      publicUrl, 
      signedUrl: publicUrl, // Use public URL directly (no need for signed URL once bucket is public)
      text: fullText 
    };
  } catch (err) {
    const errorDetails = {
      message: err.message,
      url: url,
      status: err.response?.status,
      statusText: err.response?.statusText,
      responsePreview: err.response?.data ? err.response.data.toString('utf-8').substring(0, 500) : null
    };
    console.error(`[error] [storage] Failed to download/upload/parse PDF from ${url}:`, JSON.stringify(errorDetails, null, 2));
    if (err.response) {
      console.error(`[error] [storage] Response status: ${err.response.status}`);
      console.error(`[error] [storage] Response data preview: ${errorDetails.responsePreview}`);
    }
    return null;
  }
};

module.exports = {
  checkEntryExists,
  saveExtractedPdfs,
  fetchUploadAndParsePdf,
  generateJsonFileName,
  bucketName
};

