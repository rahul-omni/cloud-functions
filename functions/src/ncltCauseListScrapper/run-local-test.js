/**
 * Local test runner for NCLT examples.js
 * This runs the scraper locally without cloud function calls
 */

console.log("🚀 Running NCLT Examples.js Locally");
console.log("=" .repeat(60));
console.log(`📅 Date: ${new Date().toISOString()}`);
console.log("🏛️  Testing all configured benches with PDF extraction");
console.log("=" .repeat(60));

async function runLocalTest() {
    try {
        // Import and run the examples
        const examples = require('./examples.js');
        console.log("✅ Examples.js executed successfully!");
        console.log("📊 Check the output above for results");
        
    } catch (error) {
        console.error("❌ Error running examples.js:", error.message);
        console.error("🔍 Full error:", error);
    }
}

// Run the test
runLocalTest();





// console.log('Starting initialization...');
// const functions = require('firebase-functions');
// console.log('Firebase functions loaded.');
// const regionFunctions = functions.region('asia-south1');
// const { fetchNCLTCauseList } = require('./ncltCauseListScrapper');
// const { getNCLTSubscribedCases, insertNCLTNotifications } = require('./components/db');
// const pdfParse = require("pdf-parse");
// const axios = require('axios');
// const { processWhatsAppNotifications , processWhatsAppNotificationsWithTemplate} = require("../notification/processWhatsappNotification");
// const { pdfScrapperNCLTCauseList } = require('./pdfScrapperCauseList');
// const { Storage } = require('@google-cloud/storage');
// const WHATSAPP_TEMPLATE_NAME = functions.config()?.environment?.whatsapp_nclt_template || 'nclt_case_update';

// // Create storage client
// const storage = new Storage();
// const bucketName = "ncltcauselistpdflinks"; // 🔹 Replace with your bucket name

// // Runtime options for the function
// const runtimeOpts = {
//   timeoutSeconds: 540,
//   memory: '2GB',
// };



// /**
//  * HTTP Cloud Function for scraping NCLT cases
//  */
// exports.ncltCauseListScrapper = regionFunctions.runWith(runtimeOpts).https
//   .onRequest(async (req, res) => {

//     console.log("[start] [ncltCauseListScrapper] scraper service started at:", new Date().toISOString());

//     // Get parameters from request (support both GET and POST)
//     const requestData = req.method === 'GET' ? req.query : req.body;
//     console.log("[debug] Request data received:", JSON.stringify(requestData, null, 2));
    
//     // Handle both single bench and multiple benches
//     let benchesToProcess = [];
    
//     if (requestData.benches && Array.isArray(requestData.benches)) {
//       // Multiple benches format from PowerShell: { benches: [{ name: "...", causeListDate: "..." }, ...] }
//       benchesToProcess = requestData.benches;
//     } else if (requestData.bench) {
//       if (Array.isArray(requestData.bench)) {
//         // Multiple benches format: { bench: [{ name: "...", causeListDate: "..." }, ...] }
//         benchesToProcess = requestData.bench;
//       } else {
//         // Single bench format: { bench: "Ahmedabad Bench Court-II", causeListDate: "2025-09-17" }
//         const targetDate = requestData.causeListDate || (() => {
//           const date = new Date();
//           const year = date.getFullYear();
//           const month = String(date.getMonth() + 1).padStart(2, '0');
//           const day = String(date.getDate()).padStart(2, '0');
//           return `${year}-${month}-${day}`;
//         })();
        
//         benchesToProcess = [{
//           name: requestData.bench,
//           causeListDate: targetDate
//         }];
//       }
//     } else {
//       // Default fallback
//       const date = new Date();
//       const year = date.getFullYear();
//       const month = String(date.getMonth() + 1).padStart(2, '0');
//       const day = String(date.getDate()).padStart(2, '0');
//       const defaultDate = `${year}-${month}-${day}`;
      
//       benchesToProcess = [{
//         name: 'Ahmedabad Bench Court-II',
//         causeListDate: defaultDate
//       }];
//     }

//     console.log("[debug] Benches to process:", JSON.stringify(benchesToProcess, null, 2));
//     const extractPdfs = requestData.extractPdfs !== undefined ? requestData.extractPdfs : true;

//     console.log(`[info] [ncltCauseListScrapper] Processing ${benchesToProcess.length} benches...`);
    
    
//     try {
//       let allResults = [];
//       let allPdfUrls = [];
//       let allPdfData = [];
//       let allPdfContentResults = [];
//       let benchSummary = [];

//       // Process each bench
//       for (let i = 0; i < benchesToProcess.length; i++) {
//         const benchConfig = benchesToProcess[i];
//         const benchName = benchConfig.name;
//         const benchDate = benchConfig.causeListDate;

//         console.log(`[info] [ncltCauseListScrapper] Processing bench ${i + 1}/${benchesToProcess.length}: ${benchName} for date ${benchDate}`);

//         try {
//           // Create form data object for NCLT scraping
//           const formData = {
//             bench: benchName,
//             causeListDate: benchDate
//           };

//           console.log("[debug] [ncltCauseListScrapper] Form data:", formData);

//           // 🔹 Fetch NCLT cause list data
//           const results = await fetchNCLTCauseList(formData);

//           if (results.success && results.data && results.data.length > 0) {
//             console.log(`[info] [ncltCauseListScrapper] Found ${results.totalRecords} cause list entries for ${benchName}`);

//             // Add bench identifier to each result
//             const benchResults = results.data.map(entry => ({
//               ...entry,
//               benchName: benchName,
//               benchDate: benchDate
//             }));

//             allResults = allResults.concat(benchResults);

//             // Extract PDF URLs from the results
//             const benchPdfUrls = [];
//             const benchPdfData = [];
            
//             results.data.forEach((entry, index) => {
//               if (entry.rawData && entry.rawData.pdfUrl) {
//                 benchPdfUrls.push(entry.rawData.pdfUrl);
//                 benchPdfData.push({
//                   index: allPdfData.length + index + 1,
//                   benchName: benchName,
//                   benchDate: benchDate,
//                   title: entry.rawData.title,
//                   court: entry.rawData.court,
//                   numberOfEntries: entry.rawData.numberOfEntries,
//                   pdfUrl: entry.rawData.pdfUrl,
//                   pdfFileName: entry.rawData.pdfFileName,
//                   fileSize: entry.rawData.fileSize,
//                   causeDate: entry.rawData.causeDate
//                 });
//               }
//             });

//             allPdfUrls = allPdfUrls.concat(benchPdfUrls);
//             allPdfData = allPdfData.concat(benchPdfData);

//             benchSummary.push({
//               benchName: benchName,
//               benchDate: benchDate,
//               totalRecords: results.totalRecords,
//               pdfCount: benchPdfUrls.length,
//               success: true
//             });

//             console.log(`[success] [ncltCauseListScrapper] Completed ${benchName}: ${results.totalRecords} records, ${benchPdfUrls.length} PDFs`);

//           } else {
//             console.log(`[info] [ncltCauseListScrapper] No results found for bench: ${benchName}`);
//             benchSummary.push({
//               benchName: benchName,
//               benchDate: benchDate,
//               totalRecords: 0,
//               pdfCount: 0,
//               success: true,
//               message: "No data found"
//             });
//           }

//           // Add delay between benches to avoid overwhelming the server
//           if (i < benchesToProcess.length - 1) {
//             console.log(`[info] [ncltCauseListScrapper] Waiting 3 seconds before next bench...`);
//             await new Promise(resolve => setTimeout(resolve, 3000));
//           }

//         } catch (benchError) {
//           console.error(`[error] [ncltCauseListScrapper] Failed to process bench ${benchName}:`, benchError);
//           benchSummary.push({
//             benchName: benchName,
//             benchDate: benchDate,
//             totalRecords: 0,
//             pdfCount: 0,
//             success: false,
//             error: benchError.message
//           });
//         }
//       }

//       if (allResults.length === 0) {
//         return res.status(200).json({
//           success: true,
//           message: "No cause list results found across all benches",
//           data: [],
//           pdfUrls: [],
//           pdfContent: [],
//           benchSummary: benchSummary
//         });
//       }

//       console.log(`[info] [ncltCauseListScrapper] Total across all benches: ${allResults.length} entries, ${allPdfUrls.length} PDFs`);
 
//       const formatToDDMMYYYY = (iso) => {
//         try {
//           if (!iso) return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
//           // accept "YYYY-MM-DD"
//           if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
//             const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`;
//           }
//           const dObj = new Date(iso);
//           if (isNaN(dObj)) return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
//           const dd = String(dObj.getDate()).padStart(2, '0');
//           const mm = String(dObj.getMonth() + 1).padStart(2, '0');
//           const yyyy = dObj.getFullYear();
//           return `${dd}-${mm}-${yyyy}`;
//         } catch (e) {
//           return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
//         }
//       };

//       // collect dates from benchesToProcess (bench.causeListDate expected as YYYY-MM-DD)
//       const uniqueDates = Array.from(new Set(benchesToProcess.map(b => b.causeListDate).filter(Boolean)));
//       let fileDateForName;
//       if (uniqueDates.length === 1) {
//         fileDateForName = formatToDDMMYYYY(uniqueDates[0]); // e.g. "19-09-2025"
//       } else if (uniqueDates.length > 1) {
//         const sorted = uniqueDates.slice().sort();
//         fileDateForName = `${formatToDDMMYYYY(sorted[0])}_to_${formatToDDMMYYYY(sorted[sorted.length - 1])}`;
//       } else {
//         fileDateForName = formatToDDMMYYYY(new Date());
//       }

     
//       // Only keep PDF content in the bucket; do not save consolidated cause-list file
//       const causeListFileName = null;

     

//       // Get location/chunk identifier from the request or bench names
//       let chunkLocationName = 'mixed';
//       let chunkIdentifier = 'single';
      
//       if (requestData.chunkInfo && requestData.chunkInfo.chunkLocation) {
//         // Use provided chunk location from request
//         chunkLocationName = requestData.chunkInfo.chunkLocation;
//         chunkIdentifier = `chunk-${requestData.chunkInfo.chunkNumber}`;
//       } else if (benchesToProcess.length === 1) {
//         // Single bench - derive location from bench name
//         const benchName = benchesToProcess[0].name;
//         chunkLocationName = benchName.toLowerCase()
//           .replace(/bench court.*$/i, '')
//           .replace(/court.*$/i, '')
//           .replace(/bench.*$/i, '')
//           .replace(/[^a-zA-Z0-9]/g, '_')
//           .replace(/_+/g, '_')
//           .replace(/^_|_$/g, '');
//         chunkIdentifier = 'single';
//       } else {
//         // Multiple benches - try to find common location
//         const locations = benchesToProcess.map(bench => 
//           bench.name.toLowerCase()
//             .replace(/bench court.*$/i, '')
//             .replace(/court.*$/i, '')
//             .replace(/bench.*$/i, '')
//             .replace(/[^a-zA-Z0-9]/g, '_')
//             .replace(/_+/g, '_')
//             .replace(/^_|_$/g, '')
//         );
        
//         const uniqueLocations = [...new Set(locations)];
//         if (uniqueLocations.length === 1) {
//           chunkLocationName = uniqueLocations[0];
//         } else {
//           chunkLocationName = 'multiple_locations';
//         }
//         chunkIdentifier = `chunk-${benchesToProcess.length}`;
//       }

//       console.log(`[debug] [ncltCauseListScrapper] Chunk location: ${chunkLocationName}, identifier: ${chunkIdentifier}`);

//       // Create location-based file name using the bench group name
//       const pdfContentFileName = `${chunkLocationName}-${chunkIdentifier}-${fileDateForName}.json`;

//       console.log(`[info] [ncltCauseListScrapper] Will save PDF content to: ${pdfContentFileName}`);
 
//       // 🔹 Extract PDF content if requested
//       if (extractPdfs && allPdfUrls.length > 0) {
//         console.log(`[info] [ncltCauseListScrapper] Starting PDF content extraction for ${allPdfUrls.length} PDFs across all benches...`);
        
//         for (let i = 0; i < allPdfData.length; i++) {
//           const pdfInfo = allPdfData[i];
          
//           try {
//             console.log(`[info] [ncltCauseListScrapper] Processing PDF ${i + 1}/${allPdfData.length}: ${pdfInfo.pdfFileName} (${pdfInfo.benchName})`);
            
//             // Use the NCLT-specific PDF scrapper with OpenAI parsing
//             const parsedPdfData = await pdfScrapperNCLTCauseList(pdfInfo.pdfUrl);
            
//             const pdfResult = {
//               index: pdfInfo.index,
//               benchName: pdfInfo.benchName,
//               benchDate: pdfInfo.benchDate,
//               metadata: pdfInfo,
//               content: parsedPdfData,
//               extractedAt: new Date().toISOString(),
//               success: true
//             };
            
//             allPdfContentResults.push(pdfResult);
//             console.log(`[success] [ncltCauseListScrapper] Successfully processed PDF ${i + 1}: ${pdfInfo.pdfFileName} (${pdfInfo.benchName})`);
            
//             // Add delay between requests to avoid overwhelming the server
//             if (i < allPdfData.length - 1) {
//               console.log(`[info] [ncltCauseListScrapper] Waiting 2 seconds before next PDF...`);
//               await new Promise(resolve => setTimeout(resolve, 2000));
//             }
            
//           } catch (error) {
//             console.error(`[error] [ncltCauseListScrapper] Failed to process PDF ${i + 1} (${pdfInfo.pdfFileName}):`, error);
            
//             const failedPdf = {
//               index: pdfInfo.index,
//               benchName: pdfInfo.benchName,
//               benchDate: pdfInfo.benchDate,
//               metadata: pdfInfo,
//               content: null,
//               extractedAt: new Date().toISOString(),
//               success: false,
//               error: error.message
//             };
            
//             allPdfContentResults.push(failedPdf);
//           }
//         }

//         // 🔹 Save PDF content to bucket
//         try {
//           const pdfContentFile = storage.bucket(bucketName).file(pdfContentFileName);
//           await pdfContentFile.save(JSON.stringify(allPdfContentResults, null, 2), {
//             contentType: "application/json",
//           });
//           console.log(`[info] [ncltCauseListScrapper] Saved PDF content to gs://${bucketName}/${pdfContentFileName}`);
//         } catch (err) {
//           console.error("[error] [ncltCauseListScrapper] Failed to save PDF content to bucket:", err);
//         }

//         console.log(`[success] [ncltCauseListScrapper] PDF content extraction completed. Success: ${allPdfContentResults.filter(pdf => pdf.success).length}/${allPdfContentResults.length}`);
//       }

//       // 🔹 Process notifications for extracted PDF content
//               // 🔹 Process notifications for extracted PDF content
//       console.log("[info] [ncltCauseListScrapper] Starting notification processing...");
//       let totalNotifications = 0;

//       try {
//         // Get all subscribed NCLT cases using the imported function
//         const subscribedCases = await getNCLTSubscribedCases();

//         console.log(`[info] [ncltCauseListScrapper] Found ${subscribedCases.length} subscribed NCLT cases`);
//         console.log(`[debug] [ncltCauseListScrapper] Subscribed cases:`, JSON.stringify(subscribedCases, null, 2));

//         if (subscribedCases.length === 0) {
//           console.log("[info] [ncltCauseListScrapper] No subscribed cases found, skipping notification processing");
//         } else {
//           // Extract unique bench names
//           const benchNames = Array.from(new Set(subscribedCases.map(row => row.bench)));
//           console.log(`[info] [ncltCauseListScrapper] Found ${benchNames.length} unique bench names:`, benchNames);

//           // Get all bucket files
//           const [bucketFiles] = await storage.bucket(bucketName).getFiles();
//           console.log(`[info] [ncltCauseListScrapper] Found ${bucketFiles.length} total files in bucket`);

//           // Filter bucket files based on bench names - IMPROVED VERSION
// const relevantFiles = bucketFiles.filter(file => {
//   const fileName = file.name.toLowerCase();
  
//   return benchNames.some(bench => {
//     if (!bench) return false;
    
//     const benchLower = bench.toLowerCase();
    
//     // Create specific mapping patterns for each bench type
//     let searchPatterns = [];
    
//     if (benchLower.includes('new delhi bench court-ii')) {
//       searchPatterns = ['new_delhi_bench_court_ii', 'new_delhi_bench_court_2'];
//     } else if (benchLower.includes('new delhi bench court-i') && !benchLower.includes('ii')) {
//       searchPatterns = ['new_delhi_bench_court_i', 'new_delhi_bench_court_1'];
//     } else if (benchLower.includes('mumbai')) {
//       searchPatterns = ['mumbai'];
//     } else if (benchLower.includes('ahmedabad bench court-i')) {
//       searchPatterns = ['ahmedabad'];
//     } else if (benchLower.includes('allahabad bench court-i')) {
//       searchPatterns = ['allahabad'];
//     } else if (benchLower.includes('hyderabad')) {
//       searchPatterns = ['hyderabad'];
//     } else if (benchLower.includes('chennai')) {
//       searchPatterns = ['chennai'];
//     } else if (benchLower.includes('kolkata')) {
//       searchPatterns = ['kolkata'];
//     } else if (benchLower.includes('bengaluru')) {
//       searchPatterns = ['bengaluru'];
//     } else if (benchLower.includes('chandigarh')) {
//       searchPatterns = ['chandigarh'];
//     } else if (benchLower.includes('amaravati') || benchLower.includes('amravati')) {
//       searchPatterns = ['amravati', 'amaravati'];
//     } else if (benchLower.includes('cuttack') || benchLower.includes('cuttak')) {
//       searchPatterns = ['cuttack', 'cuttak'];
//     } else if (benchLower.includes('guwahati')) {
//       searchPatterns = ['guwahati'];
//     } else if (benchLower.includes('indore')) {
//       searchPatterns = ['indore'];
//     } else if (benchLower.includes('jaipur')) {
//       searchPatterns = ['jaipur'];
//     } else if (benchLower.includes('kochi')) {
//       searchPatterns = ['kochi'];
//     } else if (benchLower.includes('principal')) {
//       searchPatterns = ['principal'];
//     } else {
//       // Fallback: create pattern from bench name
//       const pattern = benchLower
//         .replace(/bench\s+court[-\s]*ii/gi, '_bench_court_ii')
//         .replace(/bench\s+court[-\s]*i(?!i)/gi, '_bench_court_i')
//         .replace(/[^a-zA-Z0-9]/g, '_')
//         .replace(/_+/g, '_')
//         .replace(/^_|_$/g, '');
//       searchPatterns = [pattern];
//     }
    
//     // Check if filename matches any of the search patterns
//     const matches = searchPatterns.some(pattern => fileName.includes(pattern));
    
//     if (matches) {
//       console.log(`[debug] ✅ Bench "${bench}" matched file "${file.name}" using pattern: ${searchPatterns.join(', ')}`);
//     }
    
//     return matches;
//   });
// });

// console.log(`[info] [ncltCauseListScrapper] Found ${relevantFiles.length} relevant files in the bucket:`, relevantFiles.map(file => file.name));   


//         }

//         console.log(`[success] [ncltCauseListScrapper] Notification processing completed. Sent ${totalNotifications} notifications`);

//       } catch (notificationError) {
//         console.error("[error] [ncltCauseListScrapper] Error during notification processing:", notificationError);
//       }         
 


//   }catch (outerError) {
//   console.error('[error] [ncltCauseListScrapper] Outer error during scraping service: ', outerError);
//   res.status(500).json({
//     success: false,
//     error: outerError.message
//   });
//   }



//   })

