const https = require('https');
const { Storage } = require('@google-cloud/storage');
const { PassThrough } = require('stream');

// Initialize GCS
const storage = new Storage(); // Will use GOOGLE_APPLICATION_CREDENTIALS env var

/**
 * Downloads a PDF and uploads it to a GCS bucket
 * @param {Array} cookies - Array of cookie objects
 * @param {string} url - PDF download URL
 * @param {string} [filename] - Optional filename in GCS (bucket name will be extracted from filename)
 * @returns {Promise<Object>} - Object containing GCS path and signed URL
 */
async function uploadPDFToGCS(cookies, url, filename) {
    return new Promise((resolve, reject) => {
        // Remove duplicate cookies by name
        const uniqueCookies = Object.values(
            cookies.reduce((acc, cookie) => {
                acc[cookie.name] = cookie; // overwrite duplicate names
                return acc;
            }, {})
        );

        // Build Cookie header string
        const cookieHeader = uniqueCookies
            .map(({ name, value }) => `${name}=${value}`)
            .join('; ');

        // Generate filename if not provided
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `downloaded_pdf_${timestamp}.pdf`;
        }

        // Ensure filename has .pdf extension
        if (!filename.endsWith('.pdf')) {
            filename += '.pdf';
        }

        // Extract bucket name from filename or use default
        // Format: bucket_name/filename.pdf
        let bucketName = 'high-court-judgement-pdf'; // Default bucket name
        let gcsFilename = filename;
        
        if (filename.includes('/')) {
            const parts = filename.split('/');
            bucketName = parts[0];
            gcsFilename = parts.slice(1).join('/');
        }

        const options = {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/pdf,*/*'
            }
        };

        console.log(`📥  Starting PDF download and GCS upload: ${gcsFilename}`);
        console.log(`🔗  URL: ${url}`);
        console.log(`🍪  Using ${uniqueCookies.length} cookies`);
        console.log(`☁️  Uploading to bucket: ${bucketName}`);

        https.get(url, options, (res) => {
            console.log(`📊  Response status: ${res.statusCode}`);
            console.log(`📋  Content-Type: ${res.headers['content-type']}`);

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }

            const passthrough = new PassThrough();

            const file = storage.bucket(bucketName).file(gcsFilename);
            const writeStream = file.createWriteStream({
                resumable: false,
                contentType: 'application/pdf',
                metadata: {
                    cacheControl: 'no-cache',
                    metadata: {
                        source: 'high-court-scraper',
                        downloadedAt: new Date().toISOString()
                    }
                }
            });

            res.pipe(passthrough).pipe(writeStream);

            writeStream.on('finish', async () => {
                const gcsPath = `gs://${bucketName}/${gcsFilename}`;
                console.log(`✅  GCS upload completed: ${gcsPath}`);
                
                // Wait a bit to ensure file is fully available in GCS
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                    // Verify file exists before generating signed URL
                    const [exists] = await file.exists();
                    if (!exists) {
                        throw new Error(`File ${gcsFilename} does not exist in bucket ${bucketName}`);
                    }
                    
                    console.log(`🔍  File exists, generating signed URL...`);
                    
                    // Generate signed URL for immediate access.
                    // Requires: Cloud Function's service account must have role
                    // "Service Account Token Creator" (roles/iam.serviceAccountTokenCreator) on itself,
                    // e.g. gcloud iam service-accounts add-iam-policy-binding PROJECT_ID@appspot.gserviceaccount.com
                    //      --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com"
                    //      --role="roles/iam.serviceAccountTokenCreator"
                    const [signedUrl] = await file.getSignedUrl({
                        version: 'v4',
                        action: 'read',
                        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
                    });
                    
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    
                    console.log(`🔗  Signed URL generated successfully`);
                    console.log(`   URL: ${signedUrl.substring(0, 100)}...`);
                    console.log(`   Expires: ${expiresAt.toISOString()}`);
                    
                    resolve({
                        gcsPath: gcsPath,
                        signedUrl: signedUrl,
                        signedUrlExpiresAt: expiresAt,
                        filename: gcsFilename,
                        bucketName: bucketName
                    });
                    
                } catch (signedUrlError) {
                    console.error(`⚠️  Failed to generate signed URL: ${signedUrlError.message}`);
                    console.error(`   Error details:`, signedUrlError);
                    // Still resolve with GCS path even if signed URL fails
                    resolve({
                        gcsPath: gcsPath,
                        signedUrl: null,
                        signedUrlExpiresAt: null,
                        filename: gcsFilename,
                        bucketName: bucketName
                    });
                }
            });

            writeStream.on('error', (err) => {
                console.error(`❌  GCS Upload error: ${err.message}`);
                reject(new Error(`GCS Upload error: ${err.message}`));
            });

        }).on('error', (err) => {
            console.error(`❌  Download error: ${err.message}`);
            reject(new Error(`Download error: ${err.message}`));
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