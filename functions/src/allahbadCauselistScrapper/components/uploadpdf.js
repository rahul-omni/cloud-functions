const https = require("https");
const { Storage } = require("@google-cloud/storage");

const storage = new Storage({
  projectId: "booming-order-465208-t8",
  keyFilename: "C:/Users/Akash.Rawat/.gcp/gcs-key.json",
});

async function uploadPDFToGCS(cookies, url, filename) {
  return new Promise((resolve, reject) => {
    // 🔁 Remove duplicate cookies
    const uniqueCookies = Object.values(
      cookies.reduce((acc, cookie) => {
        acc[cookie.name] = cookie;
        return acc;
      }, {})
    );

    const cookieHeader = uniqueCookies
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    // 📄 Filename handling
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      filename = `downloaded_pdf_${timestamp}.pdf`;
    }

    if (!filename.endsWith(".pdf")) {
      filename += ".pdf";
    }

    // ☁️ Bucket logic (unchanged)
    let bucketName = "high-court-judgement-pdf";
    let gcsFilename = filename;

    if (filename.includes("/")) {
      const parts = filename.split("/");
      bucketName = parts[0];
      gcsFilename = parts.slice(1).join("/");
    }

    const options = {
      headers: {
        Cookie: cookieHeader,
        Accept: "application/pdf,*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    };

    console.log(`📥 Downloading → GCS`);
    console.log(`🔗 ${url}`);
    console.log(`☁️ ${bucketName}/${gcsFilename}`);

    const file = storage.bucket(bucketName).file(gcsFilename);

    const writeStream = file.createWriteStream({
      resumable: false,
      contentType: "application/pdf",
      metadata: {
        cacheControl: "no-cache",
        metadata: {
          source: "high-court-scraper",
          downloadedAt: new Date().toISOString(),
        },
      },
    });

    let downloadFailed = false;

    // ⬇️ DOWNLOAD
    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        downloadFailed = true;
        writeStream.destroy();
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      res.on("error", (err) => {
        downloadFailed = true;
        writeStream.destroy();
        reject(new Error(`Response error: ${err.message}`));
      });

      res.pipe(writeStream);
    });

    // 🔥 Prevent socket hang up crash
    req.on("error", (err) => {
      downloadFailed = true;
      writeStream.destroy();
      reject(new Error(`Request error: ${err.code || ""} ${err.message}`));
    });

    // ⏱️ Timeout protection
    req.setTimeout(30000, () => {
      downloadFailed = true;
      req.destroy(new Error("Request timeout"));
    });

    // ⬆️ UPLOAD
    writeStream.on("finish", async () => {
      if (downloadFailed) return;

      const gcsPath = `gs://${bucketName}/${gcsFilename}`;
      console.log(`✅ Uploaded: ${gcsPath}`);

      try {
        const [exists] = await file.exists();
        if (!exists) throw new Error("File missing after upload");

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const [signedUrl] = await file.getSignedUrl({
          version: "v4",
          action: "read",
          expires: expiresAt,
        });

        resolve({
          gcsPath,
          signedUrl,
          signedUrlExpiresAt: expiresAt,
          filename: gcsFilename,
          bucketName,
        });
      } catch (err) {
        console.warn("⚠️ Signed URL failed, returning partial result");

        resolve({
          gcsPath,
          signedUrl: null,
          signedUrlExpiresAt: null,
          filename: gcsFilename,
          bucketName,
        });
      }
    });

    writeStream.on("error", (err) => {
      downloadFailed = true;
      reject(new Error(`GCS upload error: ${err.message}`));
    });
  });
}


/**
 * Generate a new signed URL for an existing GCS file
 * @param {string} gcsPath - GCS path (gs://bucket/file.pdf)
 * @param {number} [expiresInDays=7] - Days until URL expires
 * @returns {Promise<Object>} - Object containing signed URL and expiry
 */
async function generateSignedUrl(gcsPath, expiresInDays = 7) {
    try {
        // Parse GCS path
        const pathMatch = gcsPath.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (!pathMatch) {
            throw new Error('Invalid GCS path format');
        }
        
        const [, bucketName, filename] = pathMatch;
        const file = storage.bucket(bucketName).file(filename);
        
        const [signedUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        });
        
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        
        return {
            signedUrl,
            signedUrlExpiresAt: expiresAt
        };
        
    } catch (error) {
        throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
}

module.exports = { uploadPDFToGCS, generateSignedUrl }; 