
 $uri = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/ncltCauseListScrapper"

# ----------- Function 1: Bench Matching -----------
# $benchBody = @{
#     action = "debugBenchMatch"
#     bench = "New Delhi Bench Court-II"
#     causeListDate = "2025-09-19"
# } | ConvertTo-Json

# Write-Host "Testing bench matching..." -ForegroundColor Yellow
# try {
#     $benchResponse = Invoke-RestMethod -Uri $uri -Method POST -Body $benchBody -ContentType "application/json"
#     Write-Host "Bench: $($benchResponse.bench)" -ForegroundColor Cyan
#     Write-Host "Search Pattern: $($benchResponse.searchPattern)" -ForegroundColor Cyan
#     Write-Host "Matching Files:" -ForegroundColor Cyan
#     $benchResponse.matchingFiles | ForEach-Object { Write-Host "  ✅ $_" -ForegroundColor Green }
#     Write-Host "Total matches: $($benchResponse.matchingFiles.Length)" -ForegroundColor Cyan
# } catch {
#     Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
# }

# # ----------- Function 2: List Bucket Files -----------
# $listBody = @{
#     action = "listBucketFiles"
# } | ConvertTo-Json

# Write-Host "`nListing all bucket files..." -ForegroundColor Yellow
# try {
#     $listResponse = Invoke-RestMethod -Uri $uri -Method POST -Body $listBody -ContentType "application/json"
#     Write-Host "Total files: $($listResponse.total)" -ForegroundColor Cyan
#     Write-Host "Files:" -ForegroundColor Green
#     $listResponse.files | ForEach-Object { Write-Host "  - $_" }
# } catch {
#     Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
# }

# $body = @{
#   bench = "Principal Bench Court-I"
#   causeListDate = "2025-09-19"
#   extractPdfs = $false
#   processNotificationsOnly = $true
# } | ConvertTo-Json
# Write-Host "`nSending request to process notifications for Principal Bench Court-I..." -ForegroundColor Yellow
# try {
#     $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType "application/json" -TimeoutSec 300
#     Write-Host "Response summary:" -ForegroundColor Green
#     Write-Host "Total matches: $($response.totalMatches)" -ForegroundColor Cyan
#     Write-Host "Notifications sent: $($response.notificationsSent)" -ForegroundColor Cyan
# } catch {
#     Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
# }




# $uri = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/ncltCauseListScrapper"

 
# $benches = @(
#     "Principal Bench Court-I",
#     "New Delhi Bench Court-II", 
#     "Mumbai Bench Court-I",
#     "Mumbai Bench Court-II",
#     "Chennai Bench Court-I",
#     "Chennai Bench Court-II",
#     "Kolkata Bench Court-I",
#     "Kolkata Bench Court-II",
#     "Ahmedabad Bench Court-I",
#     "Hyderabad Bench Court-I",
#     "Allahabad Bench Court-I",
#     "Bangalore Bench Court-I",
#     "Cuttack Bench Court-I",
#     "Guwahati Bench Court-I",
#     "Jaipur Bench Court-I",
#     "Jabalpur Bench Court-I",
#     "Chandigarh Bench Court-I"
# )

# $causeListDate = "2025-09-26"
# $totalBenches = $benches.Count
# $processedBenches = 0
# $totalMatches = 0
# $totalNotifications = 0

# $separator = "=" * 60

# Write-Host "Starting notification processing for ALL $totalBenches benches..." -ForegroundColor Yellow
# Write-Host "Date: $causeListDate" -ForegroundColor Cyan
# Write-Host $separator -ForegroundColor Gray

# foreach ($bench in $benches) {
#     $processedBenches++
    
#     Write-Host "`n[$processedBenches/$totalBenches] Processing bench: $bench..." -ForegroundColor Yellow
    
#     $body = @{
#         bench = $bench
#         causeListDate = $causeListDate
#         extractPdfs = $false
#         processNotificationsOnly = $true
#     } | ConvertTo-Json
    
#     try {
#         $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType "application/json" -TimeoutSec 300
        
#         $matches = $response.totalMatches
#         $notifications = $response.notificationsSent
        
#         $totalMatches += $matches
#         $totalNotifications += $notifications
        
#         Write-Host "  OK $bench - Matches: $matches, Notifications: $notifications" -ForegroundColor Green
        
#     } catch {
#         Write-Host "  ERROR $bench - Error: $($_.Exception.Message)" -ForegroundColor Red
#     }
# }

# Write-Host "`n$separator" -ForegroundColor Gray
# Write-Host "FINAL SUMMARY:" -ForegroundColor Cyan
# Write-Host "Total benches processed: $processedBenches/$totalBenches" -ForegroundColor White
# Write-Host "Total case matches found: $totalMatches" -ForegroundColor Green
# Write-Host "Total notifications sent: $totalNotifications" -ForegroundColor Green
# Write-Host $separator -ForegroundColor Gray






# Process ALL cases at once - NO bench loop
$body = @{
    causeListDate = "2025-09-26"
    extractPdfs = $false
    processNotificationsOnly = $true
    # Remove bench parameter completely to process all subscribed cases
} | ConvertTo-Json

Write-Host "🚀 Processing notifications for ALL cases..." -ForegroundColor Yellow
Write-Host "Date: 2025-09-26" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Body $body -ContentType "application/json" -TimeoutSec 600
    
    Write-Host "Response summary:" -ForegroundColor Green
    Write-Host "Total matches: $($response.totalMatches)" -ForegroundColor Cyan
    Write-Host "Notifications sent: $($response.notifications.length)" -ForegroundColor Cyan
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}