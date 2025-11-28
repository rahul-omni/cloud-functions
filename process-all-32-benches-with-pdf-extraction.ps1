# Process All 32 NCLT Benches with PDF Extraction and Bucket Upload
Write-Host "PROCESSING ALL 32 NCLT BENCHES WITH PDF EXTRACTION" -ForegroundColor Green
Write-Host "Processing benches in chunks with PDF extraction and bucket upload" -ForegroundColor Yellow
Write-Host "Target date: 2025-09-19" -ForegroundColor Cyan
Write-Host ""

$uri = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/ncltCauseListScrapper"

# Read the complete bench list
$allBenches = Get-Content "all-32-benches-consolidated.json" | ConvertFrom-Json
$benchList = $allBenches.bench

# Configuration
$chunkSize = 3  # Reduced chunk size for PDF extraction
$delayBetweenRequests = 30  # Increased delay for PDF processing
$requestTimeout = 1800  # 30 minutes for PDF extraction

# Calculate chunks
$totalChunks = [Math]::Ceiling($benchList.Count / $chunkSize)

# Initialize tracking arrays
$allResults = @()
$allPdfContent = @()
$successfulChunks = 0
$failedChunks = 0

Write-Host "=== PDF EXTRACTION PROCESSING CONFIGURATION ===" -ForegroundColor White
Write-Host "Target Date: 2025-09-19" -ForegroundColor White
Write-Host "Total benches: $($benchList.Count)" -ForegroundColor White
Write-Host "Chunk size: $chunkSize benches (reduced for PDF extraction)" -ForegroundColor White
Write-Host "Total chunks: $totalChunks" -ForegroundColor White
Write-Host "Delay between chunks: $delayBetweenRequests seconds" -ForegroundColor White
Write-Host "Request timeout: $requestTimeout seconds (30 minutes)" -ForegroundColor White
Write-Host "Bucket: ncltcauselistpdflinks" -ForegroundColor White
Write-Host ""

# Process each chunk
for ($chunkIndex = 0; $chunkIndex -lt $totalChunks; $chunkIndex++) {
    $startIndex = $chunkIndex * $chunkSize
    $endIndex = [Math]::Min($startIndex + $chunkSize - 1, $benchList.Count - 1)
    $currentChunk = $benchList[$startIndex..$endIndex]
    
    Write-Host "Processing Chunk $($chunkIndex + 1)/$totalChunks (Benches $($startIndex + 1)-$($endIndex + 1))..." -ForegroundColor Cyan
    
    # Display current chunk benches
    Write-Host "Current chunk benches:" -ForegroundColor Gray
    foreach ($bench in $currentChunk) {
        Write-Host "  - $($bench.name) [2025-09-19]" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Prepare request body for current chunk with PDF extraction
    $requestBody = @{
        benches = $currentChunk
        extractPdfs = $true
        consolidatedOutput = $true
        bucketName = "ncltcauselistpdflinks"
        savePdfContentToBucket = $true
        saveConsolidatedToBucket = $true
        chunkInfo = @{
            chunkNumber = $chunkIndex + 1
            totalChunks = $totalChunks
            benchesInChunk = $currentChunk.Count
            processingType = "PDF_EXTRACTION_ENABLED"
        }
    } | ConvertTo-Json -Depth 10
    
    try {
        Write-Host "Sending request with PDF extraction (timeout: $requestTimeout seconds)..." -ForegroundColor Yellow
        
        $response = Invoke-RestMethod -Uri $uri -Method POST -Body $requestBody -ContentType "application/json" -TimeoutSec $requestTimeout
        
        Write-Host "Chunk $($chunkIndex + 1) SUCCESS!" -ForegroundColor Green
        
        # Display response summary
        Write-Host "Response Summary:" -ForegroundColor White
        Write-Host "  Success: $($response.success)" -ForegroundColor White
        Write-Host "  Message: $($response.message)" -ForegroundColor White
        
        if ($response.data) {
            Write-Host "  Data records: $($response.data.Count)" -ForegroundColor White
        }
        if ($response.pdfUrls) {
            Write-Host "  PDF URLs: $($response.pdfUrls.Count)" -ForegroundColor White
        }
        if ($response.pdfContent) {
            Write-Host "  PDF Content: $($response.pdfContent.Count)" -ForegroundColor White
        }
        if ($response.benchSummary) {
            Write-Host "  Bench Summary: $($response.benchSummary.Count)" -ForegroundColor White
        }
        
        # Show bench results
        if ($response.benchSummary -and $response.benchSummary.Count -gt 0) {
            Write-Host "Bench Results:" -ForegroundColor Cyan
            foreach ($benchResult in $response.benchSummary) {
                $pdfCount = if ($benchResult.pdfCount) { $benchResult.pdfCount } else { 0 }
                Write-Host "  $($benchResult.benchName): $($benchResult.totalRecords) records, $pdfCount PDFs" -ForegroundColor White
            }
        }
        
        # Show bucket storage info
        if ($response.storage) {
            Write-Host "Bucket Storage:" -ForegroundColor Green
            Write-Host "  Cause List File: $($response.storage.causeListFile)" -ForegroundColor Gray
            if ($response.storage.pdfContentFile) {
                Write-Host "  PDF Content File: $($response.storage.pdfContentFile)" -ForegroundColor Gray
            }
        }
        
        # Collect PDF content from response
        if ($response.pdfContent -and $response.pdfContent.Count -gt 0) {
            Write-Host "PDF Extraction Results:" -ForegroundColor Green
            foreach ($pdfEntry in $response.pdfContent) {
                Write-Host "  PDF: $($pdfEntry.fileName)" -ForegroundColor White
                Write-Host "    Bench: $($pdfEntry.bench)" -ForegroundColor Gray
                if ($pdfEntry.extractedData -and $pdfEntry.extractedData.benches) {
                    $totalCases = 0
                    foreach ($bench in $pdfEntry.extractedData.benches) {
                        if ($bench.cases) {
                            $totalCases += $bench.cases.Count
                        }
                    }
                    Write-Host "    Cases: $totalCases" -ForegroundColor Gray
                }
                
                $allPdfContent += @{
                    chunkNumber = $chunkIndex + 1
                    fileName = $pdfEntry.fileName
                    url = $pdfEntry.url
                    success = $pdfEntry.success
                    extractedData = $pdfEntry.extractedData
                    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                }
            }
        }
        
        # Show PDF statistics
        if ($response.pdfStats) {
            Write-Host "PDF Statistics:" -ForegroundColor Cyan
            Write-Host "  Total PDFs: $($response.pdfStats.totalPdfs)" -ForegroundColor White
            Write-Host "  Successful: $($response.pdfStats.successfulExtractions)" -ForegroundColor Green
            Write-Host "  Failed: $($response.pdfStats.failedExtractions)" -ForegroundColor Red
        }
        
        # Add chunk info to response for tracking
        $chunkResult = @{
            chunkNumber = $chunkIndex + 1
            totalChunks = $totalChunks
            benchesProcessed = $currentChunk.Count
            benchNames = $currentChunk | ForEach-Object { $_.name }
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            response = $response
            pdfExtractionsCount = if ($response.pdfContent) { $response.pdfContent.Count } else { 0 }
            bucketFiles = @{
                causeListFile = $response.storage.causeListFile
                pdfContentFile = $response.storage.pdfContentFile
            }
        }
        
        $allResults += $chunkResult
        $successfulChunks++
        
        Write-Host "Benches processed in this chunk: $($currentChunk.Count)" -ForegroundColor White
        Write-Host "PDFs extracted in this chunk: $($chunkResult.pdfExtractionsCount)" -ForegroundColor White
        Write-Host "Total successful chunks so far: $successfulChunks" -ForegroundColor White
        
    } catch {
        Write-Host "Chunk $($chunkIndex + 1) FAILED: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Failed benches: $(($currentChunk | ForEach-Object { $_.name }) -join ', ')" -ForegroundColor Red
        $failedChunks++
    }
    
    # Add delay between chunks
    if ($chunkIndex -lt $totalChunks - 1) {
        Write-Host "Waiting $delayBetweenRequests seconds before next chunk..." -ForegroundColor Yellow
        Start-Sleep -Seconds $delayBetweenRequests
        Write-Host ""
    }
}

Write-Host ""
Write-Host "Creating final consolidated summary..." -ForegroundColor Yellow

# Create comprehensive summary
$allBenchSummary = @()
$totalRecords = 0
$totalPdfsExtracted = 0
$benchesWithData = 0
$benchesWithPdfs = 0
$allBucketFiles = @()

foreach ($chunkResult in $allResults) {
    if ($chunkResult.response -and $chunkResult.response.benchSummary) {
        foreach ($benchData in $chunkResult.response.benchSummary) {
            $benchSummary = @{
                bench = $benchData.benchName
                totalRecords = $benchData.totalRecords
                pdfCount = if ($benchData.pdfCount) { $benchData.pdfCount } else { 0 }
                chunkNumber = $chunkResult.chunkNumber
                processingTimestamp = $chunkResult.timestamp
                success = $benchData.success
            }
            
            $allBenchSummary += $benchSummary
            $totalRecords += $benchData.totalRecords
            
            if ($benchData.totalRecords -gt 0) {
                $benchesWithData++
            }
            
            if ($benchData.pdfCount -gt 0) {
                $benchesWithPdfs++
                $totalPdfsExtracted += $benchData.pdfCount
            }
        }
    }
    
    # Collect bucket file information
    if ($chunkResult.bucketFiles) {
        if ($chunkResult.bucketFiles.causeListFile) {
            $allBucketFiles += $chunkResult.bucketFiles.causeListFile
        }
        if ($chunkResult.bucketFiles.pdfContentFile) {
            $allBucketFiles += $chunkResult.bucketFiles.pdfContentFile
        }
    }
}

# Create final consolidated report
$finalReport = @{
    processingInfo = @{
        totalBenches = 32
        successfulChunks = $successfulChunks
        failedChunks = $failedChunks
        totalChunks = $totalChunks
        chunkSize = $chunkSize
        processingStrategy = "chunked_with_pdf_extraction"
        targetDate = "2025-09-19"
        completedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        bucketName = "ncltcauselistpdflinks"
    }
    summary = @{
        totalRecords = $totalRecords
        benchesProcessed = $allBenchSummary.Count
        benchesWithData = $benchesWithData
        benchesWithPdfs = $benchesWithPdfs
        totalPdfsExtracted = $totalPdfsExtracted
        pdfExtractionRate = if ($allBenchSummary.Count -gt 0) { [math]::Round(($benchesWithPdfs / $allBenchSummary.Count) * 100, 1) } else { 0 }
    }
    benchResults = $allBenchSummary
    pdfContent = $allPdfContent
    bucketFiles = $allBucketFiles | Sort-Object | Get-Unique
}

# Generate timestamped filename
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$finalReportFilename = "NCLT-Complete-32-Benches-PDF-Extraction-Report-$timestamp.json"

# Save consolidated report
$finalReport | ConvertTo-Json -Depth 10 | Out-File -FilePath $finalReportFilename -Encoding UTF8

Write-Host ""
Write-Host "PROCESSING COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor White
Write-Host "Successful Chunks: $successfulChunks/$totalChunks" -ForegroundColor White
Write-Host "Total Benches Processed: $($allBenchSummary.Count)/32" -ForegroundColor White
Write-Host "Benches with Data: $benchesWithData" -ForegroundColor White
Write-Host "Benches with PDFs: $benchesWithPdfs" -ForegroundColor White
Write-Host "Total Records Found: $totalRecords" -ForegroundColor White
Write-Host "Total PDFs Extracted: $totalPdfsExtracted" -ForegroundColor White
Write-Host "PDF Extraction Rate: $($finalReport.summary.pdfExtractionRate)%" -ForegroundColor White
Write-Host ""

Write-Host "BUCKET FILES CREATED:" -ForegroundColor Cyan
foreach ($bucketFile in $finalReport.bucketFiles) {
    Write-Host "  $bucketFile" -ForegroundColor Gray
}
Write-Host ""

Write-Host "LOCAL REPORT CREATED:" -ForegroundColor Cyan
Write-Host "  $finalReportFilename" -ForegroundColor Gray
Write-Host ""

if ($successfulChunks -eq $totalChunks) {
    Write-Host "ALL 32 BENCHES PROCESSED SUCCESSFULLY WITH PDF EXTRACTION!" -ForegroundColor Green
    Write-Host "All PDF content has been extracted and saved to bucket: ncltcauselistpdflinks" -ForegroundColor Green
    Write-Host "Check the bucket files listed above for the complete dataset" -ForegroundColor Green
} else {
    Write-Host "PARTIAL SUCCESS: $successfulChunks/$totalChunks chunks completed" -ForegroundColor Yellow
    Write-Host "Check individual chunk errors above for details" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Processing completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White

# Show top performing benches
if ($benchesWithPdfs -gt 0) {
    Write-Host ""
    Write-Host "TOP BENCHES WITH PDF EXTRACTIONS:" -ForegroundColor Cyan
    $topBenches = $allBenchSummary | Where-Object { $_.pdfCount -gt 0 } | Sort-Object pdfCount -Descending | Select-Object -First 10
    foreach ($bench in $topBenches) {
        Write-Host "  $($bench.bench): $($bench.pdfCount) PDFs, $($bench.totalRecords) records" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Check your Google Cloud Storage bucket 'ncltcauselistpdflinks'" -ForegroundColor White
Write-Host "2. Review the bucket files listed above for extracted PDF content" -ForegroundColor White
Write-Host "3. Verify the local report file: $finalReportFilename" -ForegroundColor White
Write-Host "4. All cause list data and PDF extractions are now stored in the bucket" -ForegroundColor White