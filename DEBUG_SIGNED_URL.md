# Debugging Signed URL Issues

## Potential Issues and Solutions

### 1. **File Not Available Immediately**
**Problem**: File might not be fully available in GCS right after upload finishes.

**Solution**: Added 1-second delay before generating signed URL (line 95 in uploadpdf.js)

### 2. **GCS Permissions**
**Problem**: Service account might not have permissions to generate signed URLs.

**Check**: Ensure the service account has:
- `storage.objects.get` permission
- `storage.objects.create` permission
- `iam.serviceAccounts.signBlob` permission (for signed URLs)

### 3. **File Doesn't Exist**
**Problem**: File might not exist when trying to generate signed URL.

**Solution**: Added file existence check before generating signed URL (line 99-102)

### 4. **Signed URL is Null**
**Problem**: If signed URL generation fails, it returns `null` but code continues.

**Solution**: Added fallback logic in scraper.js (line 322) to use:
1. `signedUrl` (preferred)
2. `row.Order.href` (original URL)
3. `gcsPath` (GCS path)
4. `'N/A'` (last resort)

## How to Debug

### Check Logs
Look for these log messages:
- `✅  GCS upload completed` - File uploaded successfully
- `🔍  File exists, generating signed URL...` - File check passed
- `🔗  Signed URL generated successfully` - Signed URL created
- `⚠️  Failed to generate signed URL` - Error occurred

### Common Error Messages
- `File does not exist` - File wasn't uploaded properly
- `Permission denied` - Service account lacks permissions
- `Invalid credentials` - GCS credentials not configured

### Test Signed URL
After generation, test the URL:
```bash
curl -I "YOUR_SIGNED_URL_HERE"
```
Should return `200 OK` if working.

