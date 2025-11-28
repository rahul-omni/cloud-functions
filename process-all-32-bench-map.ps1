# Process All NCLT Benches with Location-Based Chunking
Write-Host "PROCESSING NCLT BENCHES BY LOCATION CHUNKS" -ForegroundColor Green
Write-Host "Creating chunks based on bench group names from JSON" -ForegroundColor Yellow
Write-Host "Target date: 2025-09-19" -ForegroundColor Cyan
Write-Host ""

$uri = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/ncltCauseListScrapper"

# Read the nested bench structure
$allBenches = Get-Content "all-32-bench-map.json" | ConvertFrom-Json
$benchGroups = $allBenches.bench

$delayBetweenRequests = 30
$requestTimeout = 1800  # 30 minutes timeout

# Tracking
$allResults = @()
$successfulChunks = 0
$failedChunks = 0

# Helper function to normalize names
function Normalize-Name($name) {
    return ($name.ToLower() -replace '[^a-zA-Z0-9]', '_' -replace '_+', '_' -replace '^_|_$', "")
}

Write-Host "=== LOCATION-BASED CHUNKING CONFIGURATION ===" -ForegroundColor White
Write-Host "Target Date: 2025-09-19" -ForegroundColor White
Write-Host "Total bench groups: $($benchGroups.Count)" -ForegroundColor White
Write-Host "Processing: One chunk per location" -ForegroundColor White
Write-Host "Delay between chunks: $delayBetweenRequests seconds" -ForegroundColor White
Write-Host "Bucket: ncltcauselistpdflinks" -ForegroundColor White
Write-Host ""

# Show all locations to be processed
Write-Host "=== LOCATIONS TO PROCESS ===" -ForegroundColor Yellow
$totalCourts = 0
foreach ($benchGroup in $benchGroups) {
    $courtCount = $benchGroup.courts.Count
    $totalCourts += $courtCount
    $locationName = Normalize-Name $benchGroup.name
    
    $highlight = if ($benchGroup.name -eq "Allahabad") { "Yellow" } else { "Gray" }
    Write-Host ("  Location: " + $benchGroup.name + " -> " + $locationName + " (" + $courtCount + " courts)") -ForegroundColor $highlight
    
    if ($benchGroup.name -eq "Allahabad") {
        Write-Host "    Target Location for Co. Pet. 147/2014" -ForegroundColor Yellow
    }
}
Write-Host "Total courts: $totalCourts" -ForegroundColor White
Write-Host ""

# Process each location as a separate chunk
$chunkNumber = 1
foreach ($benchGroup in $benchGroups) {
    $locationName = $benchGroup.name
    $courts = $benchGroup.courts
    $fileLocationName = Normalize-Name $locationName
    
    Write-Host "=== CHUNK $chunkNumber - PROCESSING: $($locationName.ToUpper()) ===" -ForegroundColor Green
    Write-Host "Courts to process:" -ForegroundColor White
    foreach ($court in $courts) {
        Write-Host ("  - " + $court.name) -ForegroundColor Gray
    }
    
    $expectedFileName = "$fileLocationName-$chunkNumber-19-09-2025.json"
    Write-Host "Expected file: $expectedFileName" -ForegroundColor Magenta
    
    # Special highlight for Allahabad
    if ($locationName -eq "Allahabad") {
        Write-Host "Target Chunk: Processing Allahabad for case Co. Pet. 147/2014" -ForegroundColor Yellow
    }
    Write-Host ""

    try {
        # Prepare request body with location-specific chunk info
        $requestBody = @{
            bench = $courts
            extractPdfs = $true
            consolidatedOutput = $false
            bucketName = "ncltcauselistpdflinks"
            savePdfContentToBucket = $true
            saveConsolidatedToBucket = $false
            chunkInfo = @{
                chunkNumber = $chunkNumber
                totalChunks = $benchGroups.Count
                chunkLocation = $fileLocationName
                locationDisplayName = $locationName
                courtsInChunk = $courts.Count
                processingType = "LOCATION_BASED_CHUNKS"
                description = "Chunk $chunkNumber - $locationName courts"
                expectedFileName = $expectedFileName
            }
        } | ConvertTo-Json -Depth 10

        Write-Host "Sending request for $locationName (Chunk $chunkNumber)..." -ForegroundColor Yellow
        Write-Host "Courts in chunk: $($courts.Count)" -ForegroundColor Gray
        
        $response = Invoke-RestMethod -Uri $uri -Method POST -Body $requestBody -ContentType "application/json" -TimeoutSec $requestTimeout

        Write-Host "Chunk $chunkNumber ($locationName) SUCCESS!" -ForegroundColor Green

        # Display response summary
        Write-Host "Response Summary:" -ForegroundColor White
        Write-Host "  Success: $($response.success)" -ForegroundColor White
        Write-Host "  Total Records: $($response.totalRecords)" -ForegroundColor Yellow
        
        if ($response.pdfStats) {
            Write-Host "  PDF Files: $($response.pdfStats.totalPdfs)" -ForegroundColor White
            Write-Host "  PDF Extractions: $($response.pdfStats.successfulExtractions)" -ForegroundColor Green
        }
        
        if ($response.notifications) {
            Write-Host "  Notifications Sent: $($response.notifications.totalSent)" -ForegroundColor Cyan
        }
        
        if ($response.storage -and $response.storage.pdfContentFile) {
            Write-Host "  Bucket File: $($response.storage.pdfContentFile)" -ForegroundColor Magenta
        }

        # Track results
        $chunkResult = @{
            chunkNumber = $chunkNumber
            locationName = $locationName
            fileLocationName = $fileLocationName
            expectedFileName = $expectedFileName
            actualFileName = if ($response.storage) { $response.storage.pdfContentFile } else { $null }
            success = $response.success
            totalRecords = $response.totalRecords
            courtsProcessed = $courts.Count
            courtNames = $courts | ForEach-Object { $_.name }
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            pdfExtractionsCount = if ($response.pdfStats) { $response.pdfStats.successfulExtractions } else { 0 }
            notificationsSent = if ($response.notifications) { $response.notifications.totalSent } else { 0 }
        }
        $allResults += $chunkResult
        $successfulChunks++

    } catch {
        Write-Host "Chunk $chunkNumber ($locationName) FAILED: $($_.Exception.Message)" -ForegroundColor Red
        
        $chunkResult = @{
            chunkNumber = $chunkNumber
            locationName = $locationName
            fileLocationName = $fileLocationName
            expectedFileName = $expectedFileName
            success = $false
            error = $_.Exception.Message
            courtsProcessed = $courts.Count
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        }
        $allResults += $chunkResult
        $failedChunks++
    }

    $chunkNumber++

    # Wait between chunks
    if ($chunkNumber -le $benchGroups.Count) {
        Write-Host "Waiting $delayBetweenRequests seconds before next chunk..." -ForegroundColor Yellow
        Start-Sleep -Seconds $delayBetweenRequests
        Write-Host ""
    }
}

# Save processing report
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$reportFilename = "Location-Based-Report-$timestamp.json"
$allResults | ConvertTo-Json -Depth 5 | Out-File -FilePath $reportFilename -Encoding UTF8
Write-Host "Report saved: $reportFilename" -ForegroundColor Gray
