/**
 * Full Pipeline NCLT Cause List Scrapper - WITH PDF Processing and Local Storage
 * This version downloads PDFs and extracts their content just like the cloud function
 */

// Load environment variables from the main .env file
require('dotenv').config({ path: '../../../.env' });

// Mock Firebase Functions for local testing
if (!global.functions) {
    global.functions = {
        config: () => ({
            environment: {
                openai_api_key: process.env.OPENAI_API_KEY || 'your-openai-key-here'
            }
        })
    };
}

const { fetchNCLTCauseList } = require('./ncltCauseListScrapper');
const { pdfScrapperNCLTCauseList } = require('./pdfScrapperCauseList');
const fs = require('fs');
const path = require('path');

async function fullPipelineNCLTScrapper() {
    console.log('🚀 Testing NCLT Cause List Scrapper with FULL PDF PROCESSING...');
    
    // Configuration - you can modify this
    const ENABLE_PDF_PROCESSING = true;
    const SAVE_TO_LOCAL_FILES = true;
    const OUTPUT_DIR = './output';
    
    // Ensure output directory exists
    if (SAVE_TO_LOCAL_FILES && !fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    try {
        // Define benches to process (you can modify this list)
        const benchesToProcess = [
            { name: 'Ahmedabad Bench Court-I', causeListDate: '2025-09-19' },
            { name: 'Ahmedabad Bench Court-II', causeListDate: '2025-09-19' },
            { name: 'Allahabad Bench Court-I', causeListDate: '2025-09-19' },
            { name: 'Amaravati Bench Court-I', causeListDate: '2025-09-19' },
            { name: 'Chandigarh Bench Court-I', causeListDate: '2025-09-19' },
            { name: 'Chennai Bench Court-I', causeListDate: '2025-09-19' }
            // Add more benches as needed
        ];

        console.log(`📝 Processing ${benchesToProcess.length} benches with full PDF extraction...`);
        
        let allResults = [];
        let allPdfUrls = [];
        let allPdfData = [];
        let allPdfContentResults = [];
        let benchSummary = [];

        // Process each bench individually
        for (let i = 0; i < benchesToProcess.length; i++) {
            const benchConfig = benchesToProcess[i];
            const benchName = benchConfig.name;
            const benchDate = benchConfig.causeListDate;

            console.log(`\n📍 Processing bench ${i + 1}/${benchesToProcess.length}: ${benchName} for date ${benchDate}`);

            try {
                // Create form data object for NCLT scraping
                const formData = {
                    bench: benchName,
                    causeListDate: benchDate
                };

                console.log(`[debug] Form data for ${benchName}:`, formData);

                // 🔹 Step 1: Fetch NCLT cause list data (same as examples.js)
                const results = await fetchNCLTCauseList(formData);

                if (results.success && results.data && results.data.length > 0) {
                    console.log(`✅ ${benchName}: Found ${results.totalRecords} records`);

                    // Add bench identifier to each result
                    const benchResults = results.data.map(entry => ({
                        ...entry,
                        benchName: benchName,
                        benchDate: benchDate
                    }));

                    allResults = allResults.concat(benchResults);

                    // 🔹 Step 2: Extract PDF URLs from the results
                    const benchPdfUrls = [];
                    const benchPdfData = [];
                    
                    results.data.forEach((entry, index) => {
                        if (entry.rawData && entry.rawData.pdfUrl) {
                            console.log(`📄 Found PDF: ${entry.rawData.title}`);
                            console.log(`🔗 PDF URL: ${entry.rawData.pdfUrl}`);
                            
                            benchPdfUrls.push(entry.rawData.pdfUrl);
                            benchPdfData.push({
                                index: allPdfData.length + index + 1,
                                benchName: benchName,
                                benchDate: benchDate,
                                title: entry.rawData.title,
                                court: entry.rawData.court,
                                numberOfEntries: entry.rawData.entries || entry.rawData.numberOfEntries,
                                pdfUrl: entry.rawData.pdfUrl,
                                extractionMethod: entry.rawData.extractionMethod
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

                } else {
                    console.log(`✅ ${benchName}: Found 0 records`);
                    benchSummary.push({
                        benchName: benchName,
                        benchDate: benchDate,
                        totalRecords: 0,
                        pdfCount: 0,
                        success: true,
                        message: "No data found"
                    });
                }

                // Add delay between benches to avoid overwhelming the server
                if (i < benchesToProcess.length - 1) {
                    console.log('⏱️  Waiting 3 seconds before next bench...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (benchError) {
                console.error(`❌ Failed to process bench ${benchName}:`, benchError.message);
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

        // 🔹 Step 3: Save consolidated cause list data
        console.log(`\n📊 SUMMARY: Total across all benches: ${allResults.length} entries, ${allPdfUrls.length} PDFs`);
        
        const timestamp = new Date().toISOString().split('T')[0];
        const causeListFileName = `cause-list-full-pipeline-${timestamp}.json`;
        
        const consolidatedResults = {
            success: true,
            data: allResults,
            totalRecords: allResults.length,
            benchSummary: benchSummary,
            pdfUrls: allPdfUrls,
            metadata: {
                processedBenches: benchesToProcess.length,
                scrapedAt: new Date().toISOString(),
                enabledPdfProcessing: ENABLE_PDF_PROCESSING,
                outputDirectory: OUTPUT_DIR
            },
            message: `Successfully processed ${benchesToProcess.length} benches with ${allResults.length} total entries`
        };

        if (SAVE_TO_LOCAL_FILES) {
            const causeListPath = path.join(OUTPUT_DIR, causeListFileName);
            fs.writeFileSync(causeListPath, JSON.stringify(consolidatedResults, null, 2));
            console.log(`💾 Saved consolidated cause list data to: ${causeListPath}`);
        }

        // 🔹 Step 4: Process PDFs with OpenAI (THIS IS THE NEW PART!)
        if (ENABLE_PDF_PROCESSING && allPdfUrls.length > 0) {
            console.log(`\n🔍 Starting PDF content extraction for ${allPdfUrls.length} PDFs...`);
            
            for (let i = 0; i < allPdfData.length; i++) {
                const pdfInfo = allPdfData[i];
                
                try {
                    console.log(`\n📑 Processing PDF ${i + 1}/${allPdfData.length}: ${pdfInfo.title} (${pdfInfo.benchName})`);
                    console.log(`🔗 PDF URL: ${pdfInfo.pdfUrl}`);
                    
                    // 🔹 Use the NCLT-specific PDF scrapper with OpenAI parsing
                    console.log('🤖 Extracting PDF content with OpenAI...');
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
                    console.log(`✅ Successfully processed PDF ${i + 1}: ${pdfInfo.title}`);
                    
                    if (parsedPdfData && parsedPdfData.cases) {
                        console.log(`📋 Extracted ${parsedPdfData.cases.length} cases from PDF`);
                        // Show first case as example
                        if (parsedPdfData.cases.length > 0) {
                            const firstCase = parsedPdfData.cases[0];
                            console.log(`📄 Sample case: ${firstCase.caseNumber || firstCase.case_number || 'N/A'} - ${firstCase.petitioner || firstCase.title || 'N/A'}`);
                        }
                    }
                    
                    // Add delay between PDF requests
                    if (i < allPdfData.length - 1) {
                        console.log('⏱️  Waiting 2 seconds before next PDF...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                } catch (pdfError) {
                    console.error(`❌ Failed to process PDF ${pdfInfo.title}:`, pdfError.message);
                    allPdfContentResults.push({
                        index: pdfInfo.index,
                        benchName: pdfInfo.benchName,
                        benchDate: pdfInfo.benchDate,
                        metadata: pdfInfo,
                        content: null,
                        extractedAt: new Date().toISOString(),
                        success: false,
                        error: pdfError.message
                    });
                }
            }

            // 🔹 Step 5: Save PDF content results
            if (SAVE_TO_LOCAL_FILES && allPdfContentResults.length > 0) {
                const pdfContentFileName = `pdf-content-full-pipeline-${timestamp}.json`;
                const pdfContentPath = path.join(OUTPUT_DIR, pdfContentFileName);
                
                const pdfContentData = {
                    success: true,
                    totalPdfs: allPdfContentResults.length,
                    successfulExtractions: allPdfContentResults.filter(r => r.success).length,
                    failedExtractions: allPdfContentResults.filter(r => !r.success).length,
                    pdfResults: allPdfContentResults,
                    extractedAt: new Date().toISOString()
                };
                
                fs.writeFileSync(pdfContentPath, JSON.stringify(pdfContentData, null, 2));
                console.log(`💾 Saved PDF content results to: ${pdfContentPath}`);
            }

            console.log(`\n🎉 PDF Processing Complete!`);
            console.log(`✅ Successfully processed: ${allPdfContentResults.filter(r => r.success).length}/${allPdfContentResults.length} PDFs`);
        }

        // 🔹 Final Summary
        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`📊 Total Benches Processed: ${benchesToProcess.length}`);
        console.log(`📋 Total Cause List Entries: ${allResults.length}`);
        console.log(`📄 Total PDFs Found: ${allPdfUrls.length}`);
        if (ENABLE_PDF_PROCESSING) {
            console.log(`🤖 PDF Extractions Successful: ${allPdfContentResults.filter(r => r.success).length}`);
            console.log(`❌ PDF Extractions Failed: ${allPdfContentResults.filter(r => !r.success).length}`);
        }
        
        if (SAVE_TO_LOCAL_FILES) {
            console.log(`📁 Output files saved in: ${OUTPUT_DIR}`);
        }

        console.log('\n✨ Full pipeline processing completed successfully!');

    } catch (error) {
        console.error('❌ Error during full pipeline processing:', error);
        throw error;
    }
}

// Run the full pipeline
if (require.main === module) {
    fullPipelineNCLTScrapper()
        .then(() => {
            console.log('\n🎉 Full pipeline test completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Full pipeline test failed:', error);
            process.exit(1);
        });
}

module.exports = { fullPipelineNCLTScrapper };
