const functions = require('firebase-functions');
const regionFunctions = functions.region('asia-south1');

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

exports.ncltCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {
     const requestData = req.method === 'GET' ? req.query : req.body;
    console.log("[debug] Request data received:", JSON.stringify(requestData, null, 2));
    
    // Debug endpoint for testing bench matching
if (requestData.action === "debugBenchMatch") {
  try {
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    const bucketName = "ncltcauselistpdflinks";
    const targetBench = requestData.bench;
    
    console.log(`[debug] Testing bench match for: ${targetBench}`);
    
    // Get files from bucket
    const [files] = await storage.bucket(bucketName).getFiles();
    
    // Get location name (first word)
    const location = targetBench.toLowerCase().split(' ')[0];
    
    // Check for matching files
    const matchingFiles = files.filter(file => 
      file.name.toLowerCase().includes(location) && 
      file.name.includes('19-09-2025')
    ).map(file => file.name);
    
    console.log(`[debug] Found ${matchingFiles.length} matching files for "${targetBench}"`);
    
    return res.status(200).json({
      success: true,
      bench: targetBench,
      matchingFiles: matchingFiles,
      searchPattern: location
    });
  } catch (error) {
    console.error('[error] Debug bench match error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 🔹 ADD THIS: Return early for other debug actions
    if (requestData.action === "listBucketFiles") {
      try {
        const { Storage } = require('@google-cloud/storage');
        const storage = new Storage();
        const bucketName = "ncltcauselistpdflinks";
        
        const [files] = await storage.bucket(bucketName).getFiles();
        const fileNames = files.map(f => f.name);
        
        return res.status(200).json({
          success: true,
          files: fileNames,
          total: fileNames.length
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
    
    // 🔹 ADD THIS: Early return for any debug actions to prevent main processing
    if (requestData.action) {
      return res.status(400).json({
        success: false,
        error: `Unknown action: ${requestData.action}`
      });
    }
    
    // Now continue with your main processing logic...
    console.log('Starting initialization...');
    // Load heavy dependencies inside the handler to avoid deployment timeout
    console.log('Starting initialization...');
    
    const { fetchNCLTCauseList } = require('./ncltCauseListScrapper');
    const { getNCLTSubscribedCases, insertNCLTNotifications } = require('./components/db');
    const { pdfScrapperNCLTCauseList } = require('./pdfScrapperCauseList');
    const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");
    const { Storage } = require('@google-cloud/storage');
    const {
      findExactBenchFiles,
      processCaseMatchingInBucketFiles
    } = require('./processNcltScrapping');
    
    console.log('Firebase functions loaded.');
    
    // Initialize configuration and clients
    const WHATSAPP_TEMPLATE_NAME = functions.config()?.environment?.whatsapp_nclt_template || 'order_status';
    const storage = new Storage();
    const bucketName = "ncltcauselistpdflinks";

    console.log("[start] [ncltCauseListScrapper] scraper service started at:", new Date().toISOString());

    // Get parameters from request (support both GET and POST)
    // const requestData = req.method === 'GET' ? req.query : req.body;
    console.log("[debug] Request data received:", JSON.stringify(requestData, null, 2));
    
 

// Continue with normal processing...
// Check for notifications-only mode
const processNotificationsOnly = requestData.processNotificationsOnly === true || 
                                 requestData.action === "sendNotificationsOnly";

if (processNotificationsOnly) {
  console.log("[info] Running in notifications-only mode");
  
  try {
    // Get subscribed cases
    const subscribedCases = await getNCLTSubscribedCases();
    console.log(`[info] Found ${subscribedCases.length} subscribed NCLT cases`);
    
    // Filter by bench if specified
    const targetBench = requestData.bench;
    const targetDate = requestData.causeListDate || new Date().toISOString().split('T')[0];
    
    console.log(`[info] Processing notifications for bench: ${targetBench}, date: ${targetDate}`);
    
    const filteredCases = targetBench 
      ? subscribedCases.filter(c => c.bench === targetBench) 
      : subscribedCases;
    
    console.log(`[info] Filtered to ${filteredCases.length} cases for specified bench`);
    
    // Get bucket files
    const [bucketFiles] = await storage.bucket(bucketName).getFiles();
    console.log(`[info] Found ${bucketFiles.length} files in bucket`);
    
    // Extract unique benches
    const uniqueBenches = Array.from(
      new Set(filteredCases.map(c => c.bench).filter(Boolean))
    );
    
    // Find matching files
    const benchFileMap = await findExactBenchFiles(uniqueBenches, bucketFiles);
    
    // Process notifications
    const results = await processCaseMatchingInBucketFiles(
      filteredCases, 
      benchFileMap, 
      WHATSAPP_TEMPLATE_NAME
    );
    
    return res.status(200).json({
      success: true,
      mode: "notifications-only",
      totalCases: filteredCases.length,
      totalMatches: results.totalMatches,
      notificationsSent: results.notifications.length,
      notifications: results.notifications,
      benchesProcessed: uniqueBenches.length
    });
  } catch (error) {
    console.error('[error] Error in notifications-only mode:', error);
    return res.status(500).json({
      success: false,
      mode: "notifications-only",
      error: error.message
    });
  }
}

// Continue with normal processing if not in notifications-only mode
    // Handle both single bench and multiple benches
    let benchesToProcess = [];
    
    if (requestData.benches && Array.isArray(requestData.benches)) {
      benchesToProcess = requestData.benches;
    } else if (requestData.bench) {
      if (Array.isArray(requestData.bench)) {
        benchesToProcess = requestData.bench;
      } else {
        const targetDate = requestData.causeListDate || (() => {
          const date = new Date();
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })();
        
        benchesToProcess = [{
          name: requestData.bench,
          causeListDate: targetDate
        }];
      }
    } else {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const defaultDate = `${year}-${month}-${day}`;
      
      benchesToProcess = [{
        name: 'Ahmedabad Bench Court-II',
        causeListDate: defaultDate
      }];
    }

    console.log("[debug] Benches to process:", JSON.stringify(benchesToProcess, null, 2));
    const extractPdfs = requestData.extractPdfs !== undefined ? requestData.extractPdfs : true;

    console.log(`[info] [ncltCauseListScrapper] Processing ${benchesToProcess.length} benches...`);
    
    try {
      let allResults = [];
      let allPdfUrls = [];
      let allPdfData = [];
      let allPdfContentResults = [];
      let benchSummary = [];

      // Process each bench
      for (let i = 0; i < benchesToProcess.length; i++) {
        const benchConfig = benchesToProcess[i];
        const benchName = benchConfig.name;
        const benchDate = benchConfig.causeListDate;

        console.log(`[info] [ncltCauseListScrapper] Processing bench ${i + 1}/${benchesToProcess.length}: ${benchName} for date ${benchDate}`);

        try {
          const formData = {
            bench: benchName,
            causeListDate: benchDate
          };

          console.log("[debug] [ncltCauseListScrapper] Form data:", formData);

          const results = await fetchNCLTCauseList(formData);

          if (results.success && results.data && results.data.length > 0) {
            console.log(`[info] [ncltCauseListScrapper] Found ${results.totalRecords} cause list entries for ${benchName}`);

            const benchResults = results.data.map(entry => ({
              ...entry,
              benchName: benchName,
              benchDate: benchDate
            }));

            allResults = allResults.concat(benchResults);

            const benchPdfUrls = [];
            const benchPdfData = [];
            
            results.data.forEach((entry, index) => {
              if (entry.rawData && entry.rawData.pdfUrl) {
                benchPdfUrls.push(entry.rawData.pdfUrl);
                benchPdfData.push({
                  index: allPdfData.length + index + 1,
                  benchName: benchName,
                  benchDate: benchDate,
                  title: entry.rawData.title,
                  court: entry.rawData.court,
                  numberOfEntries: entry.rawData.numberOfEntries,
                  pdfUrl: entry.rawData.pdfUrl,
                  pdfFileName: entry.rawData.pdfFileName,
                  fileSize: entry.rawData.fileSize,
                  causeDate: entry.rawData.causeDate
                });
              }
            });

            allPdfUrls = allPdfUrls.concat(benchPdfUrls);
            allPdfData = allPdfData.concat(benchPdfData);

            benchSummary.push({
              benchName: benchName,
              benchDate: benchDate,
              totalRecords: results.totalRecords,
              pdfCount: benchPdfUrls.length,
              success: true
            });

            console.log(`[success] [ncltCauseListScrapper] Completed ${benchName}: ${results.totalRecords} records, ${benchPdfUrls.length} PDFs`);

          } else {
            console.log(`[info] [ncltCauseListScrapper] No results found for bench: ${benchName}`);
            benchSummary.push({
              benchName: benchName,
              benchDate: benchDate,
              totalRecords: 0,
              pdfCount: 0,
              success: true,
              message: "No data found"
            });
          }

          if (i < benchesToProcess.length - 1) {
            console.log(`[info] [ncltCauseListScrapper] Waiting 3 seconds before next bench...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

        } catch (benchError) {
          console.error(`[error] [ncltCauseListScrapper] Failed to process bench ${benchName}:`, benchError);
          benchSummary.push({
            benchName: benchName,
            benchDate: benchDate,
            totalRecords: 0,
            pdfCount: 0,
            success: false,
            error: benchError.message
          });
        }
      }

      if (allResults.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No cause list results found across all benches",
          data: [],
          pdfUrls: [],
          pdfContent: [],
          benchSummary: benchSummary
        });
      }

      console.log(`[info] [ncltCauseListScrapper] Total across all benches: ${allResults.length} entries, ${allPdfUrls.length} PDFs`);
 
      const formatToDDMMYYYY = (iso) => {
        try {
          if (!iso) return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
          if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`;
          }
          const dObj = new Date(iso);
          if (isNaN(dObj)) return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
          const dd = String(dObj.getDate()).padStart(2, '0');
          const mm = String(dObj.getMonth() + 1).padStart(2, '0');
          const yyyy = dObj.getFullYear();
          return `${dd}-${mm}-${yyyy}`;
        } catch (e) {
          return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
        }
      };

      const uniqueDates = Array.from(new Set(benchesToProcess.map(b => b.causeListDate).filter(Boolean)));
      let fileDateForName;
      if (uniqueDates.length === 1) {
        fileDateForName = formatToDDMMYYYY(uniqueDates[0]);
      } else if (uniqueDates.length > 1) {
        const sorted = uniqueDates.slice().sort();
        fileDateForName = `${formatToDDMMYYYY(sorted[0])}_to_${formatToDDMMYYYY(sorted[sorted.length - 1])}`;
      } else {
        fileDateForName = formatToDDMMYYYY(new Date());
      }

      let chunkLocationName = 'mixed';
      let chunkIdentifier = 'single';
      
      if (requestData.chunkInfo && requestData.chunkInfo.chunkLocation) {
        chunkLocationName = requestData.chunkInfo.chunkLocation;
        chunkIdentifier = `chunk-${requestData.chunkInfo.chunkNumber}`;
      } else if (benchesToProcess.length === 1) {
        const benchName = benchesToProcess[0].name;
        chunkLocationName = benchName.toLowerCase()
          .replace(/bench court.*$/i, '')
          .replace(/court.*$/i, '')
          .replace(/bench.*$/i, '')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        chunkIdentifier = 'single';
      } else {
        const locations = benchesToProcess.map(bench => 
          bench.name.toLowerCase()
            .replace(/bench court.*$/i, '')
            .replace(/court.*$/i, '')
            .replace(/bench.*$/i, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
        );
        
        const uniqueLocations = [...new Set(locations)];
        if (uniqueLocations.length === 1) {
          chunkLocationName = uniqueLocations[0];
        } else {
          chunkLocationName = 'multiple_locations';
        }
        chunkIdentifier = `chunk-${benchesToProcess.length}`;
      }

      console.log(`[debug] [ncltCauseListScrapper] Chunk location: ${chunkLocationName}, identifier: ${chunkIdentifier}`);

      const pdfContentFileName = `${chunkLocationName}-${chunkIdentifier}-${fileDateForName}.json`;

      console.log(`[info] [ncltCauseListScrapper] Will save PDF content to: ${pdfContentFileName}`);
 
      // 🔹 Extract PDF content if requested
      if (extractPdfs && allPdfUrls.length > 0) {
        console.log(`[info] [ncltCauseListScrapper] Starting PDF content extraction for ${allPdfUrls.length} PDFs across all benches...`);
        
        for (let i = 0; i < allPdfData.length; i++) {
          const pdfInfo = allPdfData[i];
          
          try {
            console.log(`[info] [ncltCauseListScrapper] Processing PDF ${i + 1}/${allPdfData.length}: ${pdfInfo.pdfFileName} (${pdfInfo.benchName})`);
            
            const parsedPdfData = await pdfScrapperNCLTCauseList(pdfInfo.pdfUrl);
            
            const pdfResult = {
              index: pdfInfo.index,
              benchName: pdfInfo.benchName,
              benchDate: pdfInfo.benchDate,
              metadata: pdfInfo,
              content: parsedPdfData,
              extractedAt: new Date().toISOString(),
              success: true
            };
            
            allPdfContentResults.push(pdfResult);
            console.log(`[success] [ncltCauseListScrapper] Successfully processed PDF ${i + 1}: ${pdfInfo.pdfFileName} (${pdfInfo.benchName})`);
            
            if (i < allPdfData.length - 1) {
              console.log(`[info] [ncltCauseListScrapper] Waiting 2 seconds before next PDF...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
          } catch (error) {
            console.error(`[error] [ncltCauseListScrapper] Failed to process PDF ${i + 1} (${pdfInfo.pdfFileName}):`, error);
            
            const failedPdf = {
              index: pdfInfo.index,
              benchName: pdfInfo.benchName,
              benchDate: pdfInfo.benchDate,
              metadata: pdfInfo,
              content: null,
              extractedAt: new Date().toISOString(),
              success: false,
              error: error.message
            };
            
            allPdfContentResults.push(failedPdf);
          }
        }

        // 🔹 Save PDF content to bucket
        try {
          const pdfContentFile = storage.bucket(bucketName).file(pdfContentFileName);
          await pdfContentFile.save(JSON.stringify(allPdfContentResults, null, 2), {
            contentType: "application/json",
          });
          console.log(`[info] [ncltCauseListScrapper] Saved PDF content to gs://${bucketName}/${pdfContentFileName}`);
        } catch (err) {
          console.error("[error] [ncltCauseListScrapper] Failed to save PDF content to bucket:", err);
        }

        console.log(`[success] [ncltCauseListScrapper] PDF content extraction completed. Success: ${allPdfContentResults.filter(pdf => pdf.success).length}/${allPdfContentResults.length}`);
      }

      // 🔹 PROCESS NOTIFICATIONS WITH EXACT BENCH MATCHING
      console.log("[info] [ncltCauseListScrapper] Starting notification processing with exact bench matching...");
      
      try {
        // Get all subscribed NCLT cases
        const subscribedCases = await getNCLTSubscribedCases();
        console.log(`[info] [ncltCauseListScrapper] Found ${subscribedCases.length} subscribed NCLT cases`);

        if (subscribedCases.length === 0) {
          console.log("[info] [ncltCauseListScrapper] No subscribed cases found, skipping notification processing");
        } else {
          // Get all bucket files
          const [bucketFiles] = await storage.bucket(bucketName).getFiles();
          console.log(`[info] [ncltCauseListScrapper] Found ${bucketFiles.length} total files in bucket`);

          // Extract unique bench names from subscribed cases
          const uniqueBenches = Array.from(new Set(subscribedCases.map(row => row.bench).filter(Boolean)));
          console.log(`[info] [ncltCauseListScrapper] Unique benches in database:`, uniqueBenches);

          // STEP 1: Find exact matching files for each bench
          const benchFileMap = await findExactBenchFiles(uniqueBenches, bucketFiles);
          
          // Print summary of bench-file matching
          console.log(`\n[info] ===== BENCH-FILE MATCHING SUMMARY =====`);
          Object.entries(benchFileMap).forEach(([bench, data]) => {
            console.log(`[summary] Bench: "${bench}" -> ${data.fileCount} matching files`);
            data.files.forEach(file => {
              console.log(`[summary]        📁 ${file.name}`);
            });
          });
          console.log(`[info] ======================================\n`);

          // STEP 2: Process case number matching in the found files
          const { totalMatches, notifications } = await processCaseMatchingInBucketFiles(
            subscribedCases, 
            benchFileMap, 
            WHATSAPP_TEMPLATE_NAME
          );
          
          console.log(`[success] [ncltCauseListScrapper] Notification processing completed. Found ${totalMatches} case matches across all files`);
          
          // Save notifications to database if needed
          if (notifications.length > 0) {
            await insertNCLTNotifications(notifications);
            console.log(`[success] Saved ${notifications.length} notifications to database`);
          }
        }

      } catch (notificationError) {
        console.error("[error] [ncltCauseListScrapper] Error during notification processing:", notificationError);
      }

      // Final response
      return res.status(200).json({
        success: true,
        message: "NCLT cause list scraping completed successfully",
        data: allResults,
        pdfUrls: allPdfUrls,
        pdfContent: allPdfContentResults,
        benchSummary: benchSummary,
        totalBenchesProcessed: benchesToProcess.length
      });

    } catch (outerError) {
      console.error('[error] [ncltCauseListScrapper] Outer error during scraping service: ', outerError);
      res.status(500).json({
        success: false,
        error: outerError.message
      });
    }
  });