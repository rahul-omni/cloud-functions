const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");

const { Storage } = require('@google-cloud/storage');

 
const { insertNCLTNotifications } = require('./components/db');

// File content cache for performance
const fileContentCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// 🔧 ADD THIS: Bench to Court Mapping
const BENCH_COURT_MAPPING = {
  "Principal Bench": ["Principal Bench Court-I"],
  "New Delhi Bench Court-II": ["New Delhi Bench Court-II"],
  "New Delhi Bench Court-III": ["New Delhi Bench Court-III"],
  "New Delhi Bench Court-IV": ["New Delhi Bench Court-IV"],
  "New Delhi Bench Court-V": ["New Delhi Bench Court-V"],
  "New Delhi Bench Court-VI": ["New Delhi Bench Court-VI"],
  "Ahmedabad": ["Ahmedabad Bench Court-I", "Ahmedabad Bench Court-II"],
  "Allahabad": ["Allahabad Bench Court-I"],
  "Amravati": ["Amaravati Bench Court-I"],
  "Bengaluru": ["Bengaluru Bench Court-I"],
  "Chandigarh": ["Chandigarh Bench Court-I", "Chandigarh Bench Court-II"],
  "Chennai": ["Chennai Bench Court-I", "Chennai Bench Court-II"],
  "Cuttak": ["Cuttack Bench Court-I"],
  "Guwahati": ["Guwahati Bench Court-I"],
  "Hyderabad": ["Hyderabad Bench Court-I", "Hyderabad Bench Court-II"],
  "Indore": ["Indore Bench Court-I"],
  "Jaipur": ["Jaipur Bench Court-I"],
  "Kochi": ["Kochi Bench Court-I"],
  "Kolkata": ["Kolkata Bench Court-I", "Kolkata Bench Court-II", "Kolkata Bench Court-3"],
  "Mumbai": ["Mumbai Bench Court-II", "Mumbai Bench Court-III", "Mumbai Bench Court-IV", "Mumbai Bench Court-V", "Mumbai Bench Court-VI"],
  "Registrar NCLT Court-I": ["Registrar NCLT Court-I"]
};

/**
 * Find exact bench files - UPDATED to handle bench-to-court mapping
 */
/**
 * Find exact bench files - UPDATED for location-based matching
 */
async function findExactBenchFiles(benchNames, bucketFiles) {
    const benchFileMap = new Map();
    
    for (const benchName of benchNames) {
        const courts = BENCH_COURT_MAPPING[benchName] || [benchName]; // Fallback to bench name if no mapping
        const matchingFiles = [];
        
        console.log(`[debug] Finding files for bench "${benchName}" with courts:`, courts);
        
        // Extract location from bench name for file matching
        const location = extractLocationFromBench(benchName);
        console.log(`[debug] Extracted location: "${location}"`);
        
        // Find files that match this location
        const locationFiles = bucketFiles.filter(file => {
            const fileName = file.name.toLowerCase();
            // Match files containing the location and date pattern
            return fileName.includes(location.toLowerCase()) && 
                   fileName.includes('2025') && // Include year to avoid old files
                   fileName.endsWith('.json');
        });
        
        console.log(`[debug] Found ${locationFiles.length} files for location "${location}":`, locationFiles.map(f => f.name));
        matchingFiles.push(...locationFiles);
        
        // Remove duplicates
        const uniqueFiles = matchingFiles.filter((file, index, self) => 
            index === self.findIndex(f => f.name === file.name)
        );
        
        benchFileMap.set(benchName, uniqueFiles);
        console.log(`[info] Bench "${benchName}" has ${uniqueFiles.length} matching files`);
    }
    
    return benchFileMap;
}

/**
 * Extract location from bench name for file matching
 */
function extractLocationFromBench(benchName) {
    // Handle specific cases
    if (benchName.toLowerCase().includes('new delhi')) {
        return 'new-delhi';
    }
    if (benchName.toLowerCase().includes('principal bench')) {
        return 'principal-bench';
    }
    if (benchName.toLowerCase().includes('mumbai')) {
        return 'mumbai';
    }
    if (benchName.toLowerCase().includes('kolkata')) {
        return 'kolkata';
    }
    if (benchName.toLowerCase().includes('hyderabad')) {
        return 'hyderabad';
    }
    if (benchName.toLowerCase().includes('jaipur')) {
        return 'jaipur';
    }
    if (benchName.toLowerCase().includes('bengaluru')) {
        return 'bengaluru';
    }
    if (benchName.toLowerCase().includes('ahmedabad') || benchName.toLowerCase().includes('ahemdabad')) {
        return 'ahmedabad';
    }
    if (benchName.toLowerCase().includes('chandigarh')) {
        return 'chandigarh';
    }
    
    // Default: take first word and clean it
    const firstWord = benchName.toLowerCase().split(' ')[0];
    return firstWord.replace(/[^a-z0-9]/g, '');
}

/**
 * IMPROVED: Process case number matching in SPECIFIC bucket files
 */
async function processCaseMatchingInBucketFiles(subscribedCases, benchFileMap, WHATSAPP_TEMPLATE_NAME) {
    console.log(`[info] Processing case matching for ${subscribedCases.length} subscribed cases`);
    
    let totalMatches = 0;
    const notifications = [];
    
    // Group cases by bench for efficient processing
    const casesByBench = subscribedCases.reduce((acc, caseItem) => {
        const benchName = caseItem.bench?.trim();
        if (!benchName) return acc;
        
        if (!acc[benchName]) acc[benchName] = [];
        acc[benchName].push(caseItem);
        return acc;
    }, {});
    
    console.log(`[info] Cases grouped by bench:`, Object.keys(casesByBench));
    
    // Process each bench group
    for (const [benchName, cases] of Object.entries(casesByBench)) {
        console.log(`\n[info] 🔍 Processing bench: "${benchName}" with ${cases.length} cases`);
        
        // Get matching files for this bench
        const benchFiles = benchFileMap.get(benchName) || [];
        
        if (benchFiles.length === 0) {
            console.log(`[warn] ❌ No files found for bench: "${benchName}", skipping ${cases.length} cases`);
            continue;
        }
        
        console.log(`[info] 📁 Found ${benchFiles.length} files for bench "${benchName}":`);
        benchFiles.forEach(file => console.log(`       - ${file.name}`));
        
        // Process each case for this bench
        for (const caseItem of cases) {
            const caseNumber = caseItem.case_number?.trim();
            
            if (!caseNumber) {
                console.log(`[warn] Skipping case - missing case number for bench "${benchName}"`);
                continue;
            }
            
            console.log(`[info] 🔎 Searching case: "${caseNumber}" in ${benchFiles.length} files for bench "${benchName}"`);
            
            let caseFoundInAnyFile = false;
            
            // Search for case number in each file for this bench
            for (const file of benchFiles) {
                try {
                    console.log(`[debug] Checking file: ${file.name} for case "${caseNumber}"`);
                    
                    const caseFound = await searchCaseInFile(caseNumber, file);
                    
                    if (caseFound) {
                        console.log(`[success] ✅✅ CASE FOUND: "${caseNumber}" in file: ${file.name} for bench "${benchName}"`);
                        
                        caseFoundInAnyFile = true;
                        
                        // Create notification with PDF URL
                        const notification = {
                            user_id: caseItem.user_id,
                            case_number: caseNumber,
                            bench: benchName,
                            matching_file: file.name,
                            found_content: caseFound.case,
                            pdfUrl: caseFound.pdfUrl,
                            timestamp: new Date().toISOString(),
                            mobile_number: caseItem.mobile_number,
                            email: caseItem.email
                        };
                        
                        notifications.push(notification);
                        totalMatches++;
                        
                        // Send WhatsApp notification
                        await sendCaseNotification(notification, caseItem, WHATSAPP_TEMPLATE_NAME);
                        
                        break; // Stop searching in other files once found
                    }
                    
                } catch (error) {
                    console.error(`[error] Error processing file ${file.name} for case ${caseNumber}:`, error);
                }
            }
            
            if (!caseFoundInAnyFile) {
                console.log(`[info] Case "${caseNumber}" NOT found in any files for bench "${benchName}"`);
            }
        }
    }
    
    return { totalMatches, notifications };
}

 

/**
 * Send WhatsApp notification - UPDATED for template messages
 */
/**
 * Send WhatsApp notification - UPDATED to match scCauseListScrapper pattern
 */
async function sendCaseNotification(notification, caseItem, WHATSAPP_TEMPLATE_NAME) {
    let insertedNotification = null;
    
    try {
        console.log(`[info] Sending WhatsApp template notification for case ${notification.case_number} to ${notification.mobile_number}`);
        
        // Get PDF URL from notification (already extracted)
        const pdfUrl = notification.pdfUrl || '';
        if (pdfUrl) {
            console.log(`[debug] Using PDF URL: ${pdfUrl}`);
        }
        
        // Prepare template data - MATCH scCauseListScrapper format (3 parameters)
        const templateData = [
            notification.case_number,  // {1} Case number
            notification.bench,        // {2} Bench name  
            pdfUrl || 'N/A'           // {3} PDF URL (instead of date)
        ];
        
        // First, insert the notification into the database
        const notificationData = {
            user_id: notification.user_id,
            case_number: notification.case_number,
            bench: notification.bench,
            mobile_number: notification.mobile_number,
            email: notification.email,
            method: 'whatsapp',
            contact: notification.mobile_number,
            message: `Case ${notification.case_number} updated in ${notification.bench} bench. PDF: ${pdfUrl}`, // Keep for logging
            status: 'pending',
            created_at: new Date(),
            dairy_number: notification.case_number
        };
        
        console.log(`[debug] Inserting notification into database:`, notificationData);
        insertedNotification = await insertNCLTNotifications(notificationData);
        
        if (!insertedNotification || !insertedNotification.id) {
            throw new Error('Failed to insert notification into database');
        }
        
        console.log(`[success] Notification inserted with ID: ${insertedNotification.id}`);
        
        // Use template message function - MATCH scCauseListScrapper call
        console.log(`[debug] Calling WhatsApp template message function with data:`, templateData);
        
        await processWhatsAppNotificationsWithTemplate(
            insertedNotification.id,    // notification ID
            WHATSAPP_TEMPLATE_NAME,     // template name (e.g., 'case_update')
            templateData                // array of parameters
        );
        
        console.log(`[success] WhatsApp template notification sent for case ${notification.case_number}`);
        
    } catch (error) {
        console.error(`[error] Failed to send WhatsApp template notification for case ${notification.case_number}:`, error);
        
        if (insertedNotification && insertedNotification.id) {
            try {
                const { update_notification_status } = require('../db/notificationProcess');
                await update_notification_status(insertedNotification.id, 'failed');
            } catch (updateError) {
                console.error(`[error] Failed to update notification status:`, updateError);
            }
        }
        
        throw error;
    }
}

// ... existing code ...

/**
 * Enhanced searchCaseInFile with JSON parsing and caching - UPDATED for array structure
 */
async function searchCaseInFile(caseNumber, file) {
    try {
        let jsonData;
        const cacheKey = file.name;
        
        // Check cache first
        if (fileContentCache.has(cacheKey)) {
            console.log(`[cache] Using cached JSON data for ${file.name}`);
            jsonData = fileContentCache.get(cacheKey).data;
        } else {
            // Read and parse JSON content
            console.log(`[debug] Downloading and parsing JSON file ${file.name}`);
            const [fileContent] = await file.download();
            jsonData = JSON.parse(fileContent.toString());
            
            // Cache the parsed data
            fileContentCache.set(cacheKey, {
                data: jsonData,
                timestamp: Date.now()
            });
            
            console.log(`[cache] Cached JSON data for ${file.name}`);
        }
        
        // Search for case number in JSON structure
        const searchTerm = normalizeCaseNumber(caseNumber);
        console.log(`[debug] Searching for case: "${searchTerm}" in JSON structure of ${file.name}`);
        
        const foundCase = findCaseInJson(jsonData, searchTerm);
        
        if (foundCase) {
            console.log(`[success] ✅ Case "${caseNumber}" found in ${file.name}`);
            
            // Extract PDF URL from metadata - FIXED for array structure
            let pdfUrl = '';
            if (Array.isArray(jsonData) && jsonData[0]?.metadata?.pdfUrl) {
                pdfUrl = jsonData[0].metadata.pdfUrl;
            } else if (jsonData.metadata?.pdfUrl) {
                pdfUrl = jsonData.metadata.pdfUrl;
            } else if (jsonData.pdfUrl) {
                pdfUrl = jsonData.pdfUrl;
            }
            
            if (pdfUrl) {
                console.log(`[debug] Found PDF URL: ${pdfUrl}`);
            } else {
                console.log(`[debug] No PDF URL found in file metadata`);
            }
            
            return {
                case: JSON.stringify(foundCase, null, 2),
                pdfUrl: pdfUrl
            };
        }
        
        console.log(`[debug] Case "${caseNumber}" not found in ${file.name}`);
        return null;
        
    } catch (error) {
        console.error(`[error] Error reading/parsing file ${file.name}:`, error);
        return null;
    }
}

/**
 * Find case in JSON structure - UPDATED to check ALL array items
 */
function findCaseInJson(jsonData, searchCaseNumber) {
    try {
        console.log(`[debug] Searching for: "${searchCaseNumber}"`);
        
        // 🔧 FIXED: Handle array structure - check ALL items, not just first
        if (Array.isArray(jsonData)) {
            console.log(`[debug] JSON is array with ${jsonData.length} items, checking all`);
            
            for (const item of jsonData) {
                if (item && item.content && item.content.benches) {
                    for (const bench of item.content.benches) {
                        if (bench.cases && Array.isArray(bench.cases)) {
                            console.log(`[debug] Found ${bench.cases.length} cases in bench`);
                            for (const caseItem of bench.cases) {
                                if (!caseItem || typeof caseItem !== 'object') continue;
                                
                                const caseNum = normalizeCaseNumber(
                                    caseItem.caseNumber || 
                                    caseItem.case_number || 
                                    caseItem.caseNo ||
                                    caseItem['Case Number'] ||
                                    caseItem.case ||
                                    ''
                                );
                                
                                console.log(`[debug] Checking case: "${caseNum}" against "${searchCaseNumber}"`);
                                
                                if (caseNum && caseNum === searchCaseNumber) {
                                    console.log(`[success] Found matching case:`, caseItem);
                                    return caseItem;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Structure 1: { content: { benches: [{ cases: [...] }] } }
        if (jsonData.content && jsonData.content.benches) {
            console.log(`[debug] Checking content.benches structure`);
            for (const bench of jsonData.content.benches) {
                if (bench.cases && Array.isArray(bench.cases)) {
                    console.log(`[debug] Found ${bench.cases.length} cases in bench`);
                    for (const caseItem of bench.cases) {
                        if (!caseItem || typeof caseItem !== 'object') continue;
                        
                        const caseNum = normalizeCaseNumber(
                            caseItem.caseNumber || 
                            caseItem.case_number || 
                            caseItem.caseNo ||
                            caseItem['Case Number'] ||
                            caseItem.case ||
                            ''
                        );
                        
                        console.log(`[debug] Checking case: "${caseNum}" against "${searchCaseNumber}"`);
                        
                        if (caseNum && caseNum === searchCaseNumber) {
                            console.log(`[success] Found matching case:`, caseItem);
                            return caseItem;
                        }
                    }
                }
            }
        }
        
        // Structure 2: Direct array of cases
        if (Array.isArray(jsonData)) {
            console.log(`[debug] Checking direct array structure`);
            for (const caseItem of jsonData) {
                if (!caseItem || typeof caseItem !== 'object') continue;
                
                const caseNum = normalizeCaseNumber(
                    caseItem.caseNumber || caseItem.case_number || caseItem.caseNo || ''
                );
                
                if (caseNum && caseNum === searchCaseNumber) {
                    return caseItem;
                }
            }
        }
        
        // Structure 3: { cases: [...] }
        if (jsonData.cases && Array.isArray(jsonData.cases)) {
            console.log(`[debug] Checking cases array structure`);
            for (const caseItem of jsonData.cases) {
                if (!caseItem || typeof caseItem !== 'object') continue;
                
                const caseNum = normalizeCaseNumber(
                    caseItem.caseNumber || caseItem.case_number || caseItem.caseNo || ''
                );
                
                if (caseNum && caseNum === searchCaseNumber) {
                    return caseItem;
                }
            }
        }
        
        console.log(`[debug] Case "${searchCaseNumber}" not found in any structure`);
        return null;
        
    } catch (error) {
        console.error(`[error] Error searching JSON structure:`, error);
        return null;
    }
}

/**
 * Normalize case number for better matching - FIXED for undefined/null values
 */
function normalizeCaseNumber(caseNumber) {
    if (caseNumber == null || caseNumber === '' || typeof caseNumber === 'undefined') {
        return '';
    }
    
    return String(caseNumber)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[\.\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    findExactBenchFiles,
    processCaseMatchingInBucketFiles,
    searchCaseInFile,
    sendCaseNotification
};



//  const { processWhatsAppNotificationsWithTemplate } = require("../notification/processWhatsappNotification");
 
// const { Storage } = require('@google-cloud/storage');
 
// const { BENCH_MAPPING } = require('./benchMapping');
// const { insertNCLTNotifications } = require('./components/db');

// // File content cache for performance
// const fileContentCache = new Map();
// const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// /**
//  * IMPROVED: Find exact matching files for each bench in the database
//  * Now handles your specific bucket file naming format
//  */
// // async function findExactBenchFiles(dbBenches, bucketFiles) {
// //     console.log(`[info] Finding exact bench files for ${dbBenches.length} benches`);
    
// //     const benchFileMap = {};
    
// //     for (const bench of dbBenches) {
// //         if (!bench) continue;
        
// //         const benchName = bench.trim();
// //         console.log(`[debug] 🔍 Searching files for bench: "${benchName}"`);
        
// //         // Find all files that match this bench EXACTLY
// //         const matchingFiles = findExactMatchingFilesForBench(benchName, bucketFiles);
        
// //         benchFileMap[benchName] = {
// //             files: matchingFiles,
// //             fileCount: matchingFiles.length
// //         };
        
// //         if (matchingFiles.length > 0) {
// //             console.log(`[success] ✅ Bench "${benchName}" matched ${matchingFiles.length} files:`);
// //             matchingFiles.forEach(file => {
// //                 console.log(`       📁 ${file.name}`);
// //             });
// //         } else {
// //             console.log(`[warn] ❌ Bench "${benchName}" - NO matching files found`);
// //         }
// //     }
    
// //     return benchFileMap;
// // }

// /**
//  * Find exact bench files - UPDATED to handle bench-to-court mapping
//  */
// async function findExactBenchFiles(benchNames, bucketFiles) {
//     const benchFileMap = new Map();
    
//     for (const benchName of benchNames) {
//         const courts = BENCH_COURT_MAPPING[benchName] || [benchName]; // Fallback to bench name if no mapping
//         const matchingFiles = [];
        
//         console.log(`[debug] Finding files for bench "${benchName}" with courts:`, courts);
        
//         for (const courtName of courts) {
//             // Find files that match this court
//             const courtFiles = bucketFiles.filter(file => {
//                 const fileName = file.name.toLowerCase();
//                 const courtPattern = courtName.toLowerCase().replace(/[^a-z0-9]/g, '-');
//                 return fileName.includes(courtPattern) && fileName.endsWith('.json');
//             });
            
//             console.log(`[debug] Found ${courtFiles.length} files for court "${courtName}":`, courtFiles.map(f => f.name));
//             matchingFiles.push(...courtFiles);
//         }
        
//         // Remove duplicates
//         const uniqueFiles = matchingFiles.filter((file, index, self) => 
//             index === self.findIndex(f => f.name === file.name)
//         );
        
//         benchFileMap.set(benchName, uniqueFiles);
//         console.log(`[info] Bench "${benchName}" has ${uniqueFiles.length} matching files`);
//     }
    
//     return benchFileMap;
// }
// /**
//  * IMPROVED: Process case number matching in SPECIFIC bucket files
//  */
// async function processCaseMatchingInBucketFiles(subscribedCases, benchFileMap, WHATSAPP_TEMPLATE_NAME) {
//     console.log(`[info] Processing case matching for ${subscribedCases.length} subscribed cases`);
    
//     let totalMatches = 0;
//     const notifications = [];
    
//     // Group cases by bench for efficient processing
//     const casesByBench = subscribedCases.reduce((acc, caseItem) => {
//         const benchName = caseItem.bench?.trim();
//         if (!benchName) return acc;
        
//         if (!acc[benchName]) acc[benchName] = [];
//         acc[benchName].push(caseItem);
//         return acc;
//     }, {});
    
//     console.log(`[info] Cases grouped by bench:`, Object.keys(casesByBench));
    
//     // Process each bench group
//     for (const [benchName, cases] of Object.entries(casesByBench)) {
//         console.log(`\n[info] 🔍 Processing bench: "${benchName}" with ${cases.length} cases`);
        
//         // Get matching files for this bench
//         const benchFiles = benchFileMap[benchName]?.files || [];
        
//         if (benchFiles.length === 0) {
//             console.log(`[warn] ❌ No files found for bench: "${benchName}", skipping ${cases.length} cases`);
//             continue;
//         }
        
//         console.log(`[info] 📁 Found ${benchFiles.length} files for bench "${benchName}":`);
//         benchFiles.forEach(file => console.log(`       - ${file.name}`));
        
//         // Process each case for this bench
//         for (const caseItem of cases) {
//             const caseNumber = caseItem.case_number?.trim();
            
//             if (!caseNumber) {
//                 console.log(`[warn] Skipping case - missing case number for bench "${benchName}"`);
//                 continue;
//             }
            
//             console.log(`[info] 🔎 Searching case: "${caseNumber}" in ${benchFiles.length} files for bench "${benchName}"`);
            
//             let caseFoundInAnyFile = false;
            
//             // Search for case number in each file for this bench
//             for (const file of benchFiles) {
//                 try {
//                     console.log(`[debug] Checking file: ${file.name} for case "${caseNumber}"`);
                    
//                     const caseFound = await searchCaseInFile(caseNumber, file);
                    
//                     if (caseFound) {
//                         console.log(`[success] ✅✅ CASE FOUND: "${caseNumber}" in file: ${file.name} for bench "${benchName}"`);
                        
//                         caseFoundInAnyFile = true;
                        
//                         // Create notification
//                         // const notification = {
//                         //     user_id: caseItem.user_id,
//                         //     case_number: caseNumber,
//                         //     bench: benchName,
//                         //     matching_file: file.name,
//                         //     found_content: caseFound.substring(0, 200) + "...", // Truncate for logging
//                         //     timestamp: new Date().toISOString(),
//                         //     mobile_number: caseItem.mobile_number,
//                         //     email: caseItem.email
//                         // };
//                         // Create notification with PDF URL
//                            const notification = {
//                 user_id: caseItem.user_id,
//                 case_number: caseNumber,
//                 bench: benchName,
//                 matching_file: file.name,
//                 found_content: caseFound.case, // FIX: Use caseFound instead of result
//                 pdfUrl: caseFound.pdfUrl,      // FIX: Use caseFound instead of result
//                 timestamp: new Date().toISOString(),
//                 mobile_number: caseItem.mobile_number,
//                 email: caseItem.email
//             };
                        
//                         notifications.push(notification);
//                         totalMatches++;
                        
//                         // Send WhatsApp notification
//                         await sendCaseNotification(notification, caseItem, WHATSAPP_TEMPLATE_NAME);
                        
//                         break; // Stop searching in other files once found
//                     }
                    
//                 } catch (error) {
//                     console.error(`[error] Error processing file ${file.name} for case ${caseNumber}:`, error);
//                 }
//             }
            
//             if (!caseFoundInAnyFile) {
//                 console.log(`[info] Case "${caseNumber}" NOT found in any files for bench "${benchName}"`);
//             }
//         }
//     }
    
//     return { totalMatches, notifications };
// }

 

// /**
//  * Extract relevant content around the match
//  */
// function extractRelevantContent(contentString, searchTerm) {
//     const index = contentString.indexOf(searchTerm);
//     if (index === -1) return null;
    
//     const start = Math.max(0, index - 100);
//     const end = Math.min(contentString.length, index + searchTerm.length + 100);
    
//     return contentString.substring(start, end);
// }

// /**
//  * Send WhatsApp notification
//  */
// // Add this import at the top

// /**
//  * Send WhatsApp notification - FIXED error handling
//  */
// // Update imports to include the text message function
// const { processWhatsAppNotifications } = require("../notification/processWhatsappNotification");
// const { update_notification_status } = require('../db/notificationProcess');

// /**
//  * Send WhatsApp notification - FIXED to use text message
//  */
// async function sendCaseNotification1(notification, caseItem, WHATSAPP_TEMPLATE_NAME) {
//     let insertedNotification = null;
    
//     try {
//         console.log(`[info] Sending WhatsApp notification for case ${notification.case_number} to ${notification.mobile_number}`);
        
//         // First, insert the notification into the database
//         const notificationData = {
//             user_id: notification.user_id,
//             case_number: notification.case_number,
//             bench: notification.bench,
//             mobile_number: notification.mobile_number,
//             email: notification.email,
//             method: 'whatsapp',
//             contact: notification.mobile_number,
//             message: `Case ${notification.case_number} has been updated in ${notification.bench} bench on ${new Date().toISOString().split('T')[0]}. Hello ${caseItem.name || 'User'}!`,  // Full message for text
//             status: 'pending',
//             created_at: new Date(),
//             dairy_number: notification.case_number
//         };
        
//         console.log(`[debug] Inserting notification into database:`, notificationData);
//         insertedNotification = await insertNCLTNotifications(notificationData);
        
//         if (!insertedNotification || !insertedNotification.id) {
//             throw new Error('Failed to insert notification into database');
//         }
        
//         console.log(`[success] Notification inserted with ID: ${insertedNotification.id}`);
        
//         // Use text message function instead of template
//         console.log(`[debug] Calling WhatsApp text message function`);
        
//         // Call text message function: (id, template_name, data) - but it ignores the last two
//         const result = await processWhatsAppNotifications(
//             insertedNotification.id,    // notification ID
//             null,                       // template_name (ignored for text)
//             null                        // data (ignored for text)
//         );
        
//         console.log(`[success] WhatsApp notification sent for case ${notification.case_number}`);
//         return result;
        
//     } catch (error) {
//         console.error(`[error] Failed to send WhatsApp notification for case ${notification.case_number}:`, error);
        
//         // Only try to update status if notification was inserted
//         if (insertedNotification && insertedNotification.id) {
//             try {
//                 await update_notification_status(insertedNotification.id, 'failed');
//             } catch (updateError) {
//                 console.error(`[error] Failed to update notification status:`, updateError);
//             }
//         }
        
//         throw error;
//     }
// }

// /**
//  * Send WhatsApp notification - FIXED to include PDF URL
//  */
//  /**
//  * Send WhatsApp notification - FIXED to include PDF URL
//  */
// async function sendCaseNotification(notification, caseItem, WHATSAPP_TEMPLATE_NAME) {
//     let insertedNotification = null;
    
//     try {
//         console.log(`[info] Sending WhatsApp notification for case ${notification.case_number} to ${notification.mobile_number}`);
        
//         // Get PDF URL from notification (already extracted)
//         const pdfUrl = notification.pdfUrl || '';
//         if (pdfUrl) {
//             console.log(`[debug] Using PDF URL: ${pdfUrl}`);
//         }
        
//         // First, insert the notification into the database
//         const notificationData = {
//             user_id: notification.user_id,
//             case_number: notification.case_number,
//             bench: notification.bench,
//             mobile_number: notification.mobile_number,
//             email: notification.email,
//             method: 'whatsapp',
//             contact: notification.mobile_number,
//             message: `Case ${notification.case_number} has been updated in ${notification.bench} bench on ${new Date().toISOString().split('T')[0]}. Hello ${caseItem.name || 'User'}!${pdfUrl ? ` PDF: ${pdfUrl}` : ''}`,  // Include PDF URL if available
//             status: 'pending',
//             created_at: new Date(),
//             dairy_number: notification.case_number
//         };
        
//         console.log(`[debug] Inserting notification into database:`, notificationData);
//         insertedNotification = await insertNCLTNotifications(notificationData);
        
//         if (!insertedNotification || !insertedNotification.id) {
//             throw new Error('Failed to insert notification into database');
//         }
        
//         console.log(`[success] Notification inserted with ID: ${insertedNotification.id}`);
        
//         // Use text message function instead of template
//         console.log(`[debug] Calling WhatsApp text message function`);
        
//         // Call text message function: (id, template_name, data) - but it ignores the last two
//         const result = await processWhatsAppNotifications(
//             insertedNotification.id,    // notification ID
//             null,                       // template_name (ignored for text)
//             null                        // data (ignored for text)
//         );
        
//         console.log(`[success] WhatsApp notification sent for case ${notification.case_number}`);
//         return result;
        
//     } catch (error) {
//         console.error(`[error] Failed to send WhatsApp notification for case ${notification.case_number}:`, error);
        
//         // Only try to update status if notification was inserted
//         if (insertedNotification && insertedNotification.id) {
//             try {
//                 await update_notification_status(insertedNotification.id, 'failed');
//             } catch (updateError) {
//                 console.error(`[error] Failed to update notification status:`, updateError);
//             }
//         }
        
//         throw error;
//     }
// }
// /**
//  * Find matching files for a bench using BENCH_MAPPING
//  */
// function findExactMatchingFilesForBench(benchName, bucketFiles) {
//     const benchLower = benchName.toLowerCase().trim();
//     console.log(`[debug] Finding matches for bench: "${benchName}"`);
    
//     // Get search patterns from mapping
//     const searchPatterns = BENCH_MAPPING[benchLower] || [];
    
//     // Add fallback patterns
//     const locationName = benchLower.split(' ')[0];
//     const fallbackPatterns = [
//         `${locationName}-chunk`,
//         `${locationName}_bench_court`,
//         locationName
//     ];
    
//     const allPatterns = [...new Set([...searchPatterns, ...fallbackPatterns])];
//     console.log(`[debug] Search patterns for "${benchName}":`, allPatterns);
    
//     const matchingFiles = [];
    
//     for (const file of bucketFiles) {
//         const fileName = file.name.toLowerCase();
        
//         let matched = false;
//         let matchedPattern = '';
        
//         // Check each pattern
//         for (const pattern of allPatterns) {
//           if (fileName.includes(pattern)) {
//             matched = true;
//             matchedPattern = pattern;
//             console.log(`[match] Pattern "${pattern}" matched file "${fileName}"`);
//             break;
//           }
//         }
        
//         // Additional check: location name + date
//         if (!matched && fileName.includes(locationName) && fileName.includes('19-09-2025')) {
//           matched = true;
//           matchedPattern = 'location+date';
//           console.log(`[match] Location+date fallback matched file "${fileName}"`);
//         }
        
//         if (matched) {
//           console.log(`[match] ✅ Bench "${benchName}" matched file "${file.name}"`);
//           matchingFiles.push(file);
//         }
//     }
    
//     console.log(`[info] Found ${matchingFiles.length} files for bench "${benchName}"`);
//     return matchingFiles;
// }

// /**
//  * Debug JSON structure to understand your data format
//  */
// function debugJsonStructure(jsonData, fileName) {
//     console.log(`[debug] === JSON Structure Analysis for ${fileName} ===`);
//     console.log(`[debug] Root type:`, typeof jsonData);
//     console.log(`[debug] Root keys:`, Object.keys(jsonData));
    
//     if (jsonData.content) {
//         console.log(`[debug] Has content, keys:`, Object.keys(jsonData.content));
//         if (jsonData.content.benches && Array.isArray(jsonData.content.benches)) {
//             console.log(`[debug] Benches count:`, jsonData.content.benches.length);
//             if (jsonData.content.benches[0]) {
//                 console.log(`[debug] First bench keys:`, Object.keys(jsonData.content.benches[0]));
//                 if (jsonData.content.benches[0].cases && Array.isArray(jsonData.content.benches[0].cases)) {
//                     console.log(`[debug] Cases in first bench:`, jsonData.content.benches[0].cases.length);
//                     if (jsonData.content.benches[0].cases[0]) {
//                         console.log(`[debug] First case keys:`, Object.keys(jsonData.content.benches[0].cases[0]));
//                         console.log(`[debug] First case data:`, JSON.stringify(jsonData.content.benches[0].cases[0], null, 2));
//                     }
//                 }
//             }
//         }
//     }
    
//     if (Array.isArray(jsonData)) {
//         console.log(`[debug] Is array, length:`, jsonData.length);
//         if (jsonData[0]) {
//             console.log(`[debug] First item type:`, typeof jsonData[0]);
//             console.log(`[debug] First item keys:`, Object.keys(jsonData[0]));
//         }
//     }
// }

//  /**
//  * Enhanced searchCaseInFile with JSON parsing and caching - FIXED for array structure
//  */
// async function searchCaseInFile1(caseNumber, file) {
//     try {
//         let jsonData;
//         const cacheKey = file.name;
        
//         // Check cache first
//         if (fileContentCache.has(cacheKey)) {
//             console.log(`[cache] Using cached JSON data for ${file.name}`);
//             jsonData = fileContentCache.get(cacheKey).data;
//         } else {
//             // Read and parse JSON content
//             console.log(`[debug] Downloading and parsing JSON file ${file.name}`);
//             const [fileContent] = await file.download();
//             jsonData = JSON.parse(fileContent.toString());
            
//             // Cache the parsed data
//             fileContentCache.set(cacheKey, {
//                 data: jsonData,
//                 timestamp: Date.now()
//             });
            
//             console.log(`[cache] Cached JSON data for ${file.name}`);
//              // 🔹 ADD THIS CALL HERE - right after parsing
//             debugJsonStructure(jsonData, file.name);
//         }
        
//         // Search for case number in JSON structure
//         const searchTerm = normalizeCaseNumber(caseNumber);
//         console.log(`[debug] Searching for case: "${searchTerm}" in JSON structure of ${file.name}`);
        
//         const foundCase = findCaseInJson(jsonData, searchTerm);
        
//         if (foundCase) {
//             console.log(`[success] ✅ Case "${caseNumber}" found in ${file.name}`);
            
//             // Extract PDF URL from metadata - FIXED for array structure
//             let pdfUrl = '';
//             if (Array.isArray(jsonData) && jsonData[0]?.metadata?.pdfUrl) {
//                 pdfUrl = jsonData[0].metadata.pdfUrl;
//             } else if (jsonData.metadata?.pdfUrl) {
//                 pdfUrl = jsonData.metadata.pdfUrl;
//             } else if (jsonData.pdfUrl) {
//                 pdfUrl = jsonData.pdfUrl;
//             }
            
//             if (pdfUrl) {
//                 console.log(`[debug] Found PDF URL: ${pdfUrl}`);
//             } else {
//                 console.log(`[debug] No PDF URL found in file metadata`);
//             }
            
//             // Return both case data and PDF URL
//             return {
//                 case: JSON.stringify(foundCase, null, 2),
//                 pdfUrl: pdfUrl
//             };
//         }
        
//         console.log(`[debug] Case "${caseNumber}" not found in ${file.name}`);
//         return null;
        
//     } catch (error) {
//         console.error(`[error] Error reading/parsing file ${file.name}:`, error);
//         return null;
//     }
// }

// /**
//  * Enhanced searchCaseInFile with JSON parsing and caching - UPDATED for array structure
//  */
// async function searchCaseInFile(caseNumber, file) {
//     try {
//         let jsonData;
//         const cacheKey = file.name;
        
//         // Check cache first
//         if (fileContentCache.has(cacheKey)) {
//             console.log(`[cache] Using cached JSON data for ${file.name}`);
//             jsonData = fileContentCache.get(cacheKey).data;
//         } else {
//             // Read and parse JSON content
//             console.log(`[debug] Downloading and parsing JSON file ${file.name}`);
//             const [fileContent] = await file.download();
//             jsonData = JSON.parse(fileContent.toString());
            
//             // Cache the parsed data
//             fileContentCache.set(cacheKey, {
//                 data: jsonData,
//                 timestamp: Date.now()
//             });
            
//             console.log(`[cache] Cached JSON data for ${file.name}`);
//         }
        
//         // Search for case number in JSON structure
//         const searchTerm = normalizeCaseNumber(caseNumber);
//         console.log(`[debug] Searching for case: "${searchTerm}" in JSON structure of ${file.name}`);
        
//         const foundCase = findCaseInJson(jsonData, searchTerm);
        
//         if (foundCase) {
//             console.log(`[success] ✅ Case "${caseNumber}" found in ${file.name}`);
            
//             // Extract PDF URL from metadata - FIXED for array structure
//             let pdfUrl = '';
//             if (Array.isArray(jsonData) && jsonData[0]?.metadata?.pdfUrl) {
//                 pdfUrl = jsonData[0].metadata.pdfUrl;
//             } else if (jsonData.metadata?.pdfUrl) {
//                 pdfUrl = jsonData.metadata.pdfUrl;
//             } else if (jsonData.pdfUrl) {
//                 pdfUrl = jsonData.pdfUrl;
//             }
            
//             if (pdfUrl) {
//                 console.log(`[debug] Found PDF URL: ${pdfUrl}`);
//             } else {
//                 console.log(`[debug] No PDF URL found in file metadata`);
//             }
            
//             // Return both case data and PDF URL
//             return {
//                 case: JSON.stringify(foundCase, null, 2),
//                 pdfUrl: pdfUrl
//             };
//         }
        
//         console.log(`[debug] Case "${caseNumber}" not found in ${file.name}`);
//         return null;
        
//     } catch (error) {
//         console.error(`[error] Error reading/parsing file ${file.name}:`, error);
//         return null;
//     }
// }


 
  
// function findCaseInJson(jsonData, searchCaseNumber) {
//     try {
//         console.log(`[debug] Searching for: "${searchCaseNumber}"`);
        
//         // Handle array structure first
//         if (Array.isArray(jsonData)) {
//             console.log(`[debug] JSON is array, checking first item`);
//             if (jsonData[0] && jsonData[0].content && jsonData[0].content.benches) {
//                 for (const bench of jsonData[0].content.benches) {
//                     if (bench.cases && Array.isArray(bench.cases)) {
//                         console.log(`[debug] Found ${bench.cases.length} cases in bench`);
//                         for (const caseItem of bench.cases) {
//                             if (!caseItem || typeof caseItem !== 'object') continue;
                            
//                             const caseNum = normalizeCaseNumber(
//                                 caseItem.caseNumber || 
//                                 caseItem.case_number || 
//                                 caseItem.caseNo ||
//                                 caseItem['Case Number'] ||
//                                 caseItem.case ||
//                                 ''
//                             );
                            
//                             console.log(`[debug] Checking case: "${caseNum}" against "${searchCaseNumber}"`);
                            
//                             if (caseNum && caseNum === searchCaseNumber) {
//                                 console.log(`[success] Found matching case:`, caseItem);
//                                 return caseItem;
//                             }
//                         }
//                     }
//                 }
//             }
//         }
        
//         // Structure 1: { content: { benches: [{ cases: [...] }] } }
//         if (jsonData.content && jsonData.content.benches) {
//             console.log(`[debug] Checking content.benches structure`);
//             for (const bench of jsonData.content.benches) {
//                 if (bench.cases && Array.isArray(bench.cases)) {
//                     console.log(`[debug] Found ${bench.cases.length} cases in bench`);
//                     for (const caseItem of bench.cases) {
//                         if (!caseItem || typeof caseItem !== 'object') continue;
                        
//                         const caseNum = normalizeCaseNumber(
//                             caseItem.caseNumber || 
//                             caseItem.case_number || 
//                             caseItem.caseNo ||
//                             caseItem['Case Number'] ||
//                             caseItem.case ||
//                             ''
//                         );
                        
//                         console.log(`[debug] Checking case: "${caseNum}" against "${searchCaseNumber}"`);
                        
//                         if (caseNum && caseNum === searchCaseNumber) {
//                             console.log(`[success] Found matching case:`, caseItem);
//                             return caseItem;
//                         }
//                     }
//                 }
//             }
//         }
        
//         // 🔹 NEW: Structure 4: { "0": { content: { benches: [...] } } } - YOUR FORMAT
//         if (jsonData["0"] && jsonData["0"].content && jsonData["0"].content.benches) {
//             console.log(`[debug] Checking "0".content.benches structure (your format)`);
//             for (const bench of jsonData["0"].content.benches) {
//                 if (bench.cases && Array.isArray(bench.cases)) {
//                     console.log(`[debug] Found ${bench.cases.length} cases in bench`);
//                     for (const caseItem of bench.cases) {
//                         if (!caseItem || typeof caseItem !== 'object') continue;
                        
//                         const caseNum = normalizeCaseNumber(
//                             caseItem.caseNumber || 
//                             caseItem.case_number || 
//                             caseItem.caseNo ||
//                             caseItem['Case Number'] ||
//                             caseItem.case ||
//                             ''
//                         );
                        
//                         console.log(`[debug] Checking case: "${caseNum}" against "${searchCaseNumber}"`);
                        
//                         if (caseNum && caseNum === searchCaseNumber) {
//                             console.log(`[success] Found matching case:`, caseItem);
//                             return caseItem;
//                         }
//                     }
//                 }
//             }
//         }
        
//         // Structure 2: Direct array of cases
//         if (Array.isArray(jsonData)) {
//             console.log(`[debug] Checking direct array structure`);
//             for (const caseItem of jsonData) {
//                 if (!caseItem || typeof caseItem !== 'object') continue;
                
//                 const caseNum = normalizeCaseNumber(
//                     caseItem.caseNumber || caseItem.case_number || caseItem.caseNo || ''
//                 );
                
//                 if (caseNum && caseNum === searchCaseNumber) {
//                     return caseItem;
//                 }
//             }
//         }
        
//         // Structure 3: { cases: [...] }
//         if (jsonData.cases && Array.isArray(jsonData.cases)) {
//             console.log(`[debug] Checking cases array structure`);
//             for (const caseItem of jsonData.cases) {
//                 if (!caseItem || typeof caseItem !== 'object') continue;
                
//                 const caseNum = normalizeCaseNumber(
//                     caseItem.caseNumber || caseItem.case_number || caseItem.caseNo || ''
//                 );
                
//                 if (caseNum && caseNum === searchCaseNumber) {
//                     return caseItem;
//                 }
//             }
//         }
        
//         console.log(`[debug] Case "${searchCaseNumber}" not found in any structure`);
//         return null;
        
//     } catch (error) {
//         console.error(`[error] Error searching JSON structure:`, error);
//         return null;
//     }
// }
//  /**
//  * Normalize case number for better matching - FIXED for undefined/null values
//  */
// function normalizeCaseNumber(caseNumber) {
//     // More robust checking
//     if (caseNumber == null || caseNumber === '' || typeof caseNumber === 'undefined') {
//         return '';
//     }
    
//     // Use String() instead of .toString() to handle more types safely
//     return String(caseNumber)
//         .toLowerCase()
//         .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
//         .replace(/[\.\-]/g, ' ')   // Replace dots and hyphens with spaces
//         .replace(/\s+/g, ' ')      // Clean up again
//         .trim();
// }

// module.exports = {
//     findExactBenchFiles,
//     processCaseMatchingInBucketFiles,
//     findExactMatchingFilesForBench,
//     searchCaseInFile,
//     sendCaseNotification
// };

 
