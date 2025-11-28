/**
 * Example usage of NCLT Cause List Scrapper - Local Testing Version
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

async function testNCLTCauseListScrapper() {
    console.log('🚀 Testing NCLT Cause List Scrapper...');
    
    try {
        // Example 1: Test with Ahmedabad Bench (has data as shown in screenshot)
        // const basicPayload = {
        //     bench: 'Ahmedabad Bench Court-I',
        //     causeListDate: '2025-09-19'
        // };

        const basicPayload=  {
  "bench": [
    {"name": "Ahmedabad Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Ahmedabad Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Allahabad Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Amaravati Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Bengaluru Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Chandigarh Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Chandigarh Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Chennai Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Chennai Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Cuttack Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Guwahati Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Hyderabad Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Hyderabad Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Indore Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Jaipur Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Kochi Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Kolkata Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Kolkata Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Mumbai Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Mumbai Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Mumbai Bench Court-III", "causeListDate": "2025-09-19"},
    {"name": "Mumbai Bench Court-IV", "causeListDate": "2025-09-19"},
    {"name": "New Delhi Main Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "New Delhi Main Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "New Delhi Main Bench Court-III", "causeListDate": "2025-09-19"},
    {"name": "New Delhi Main Bench Court-IV", "causeListDate": "2025-09-19"},
    {"name": "New Delhi Main Bench Court-V", "causeListDate": "2025-09-19"},
    {"name": "Patna Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Pune Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Pune Bench Court-II", "causeListDate": "2025-09-19"},
    {"name": "Ranchi Bench Court-I", "causeListDate": "2025-09-19"},
    {"name": "Visakhapatnam Bench Court-I", "causeListDate": "2025-09-19"}
  ],
  "extractPdfs": true,
  "consolidatedOutput": true,
  "description": "All 32 NCLT Benches - Consolidated Processing"
}

        console.log('📝 Test payload for all 32 benches:', {
            totalBenches: basicPayload.bench.length,
            extractPdfs: basicPayload.extractPdfs,
            consolidatedOutput: basicPayload.consolidatedOutput
        });
        console.log('📋 Expected: Process all 32 NCLT benches with PDF extraction');
        console.log('⚡ Starting NCLT cause list scraper for all benches...');
        console.log(`🏛️  Processing ${basicPayload.bench.length} benches...`);
        
        const allResults = [];
        const allPdfUrls = [];
        const benchSummary = [];
        
        // Process all benches in the array
        console.log('\n🚀 PROCESSING ALL 32 BENCHES...');
        console.log('=' .repeat(60));
        
        // Loop through all benches
        for (let i = 0; i < basicPayload.bench.length; i++) {
            const benchInfo = basicPayload.bench[i];
            const benchName = benchInfo.name;
            const benchDate = benchInfo.causeListDate;
            
            console.log(`\n📍 Processing bench ${i + 1}/${basicPayload.bench.length}: ${benchName} for date ${benchDate}`);
            
            try {
                // Create form data object for bench
                const formData = {
                    bench: benchName,
                    causeListDate: benchDate
                };
                
                console.log(`[debug] Form data for ${benchName}:`, formData);
                
                // Fetch NCLT cause list data for this specific bench
                const result = await fetchNCLTCauseList(formData);
                
                console.log(`📊 ${benchName} Results:`, {
                    success: result.success,
                    totalRecords: result.totalRecords || 0,
                    pdfUrls: result.pdfUrls ? result.pdfUrls.length : 0,
                    hasData: result.data && result.data.length > 0,
                    hasPdfs: result.pdfUrls && result.pdfUrls.length > 0
                });
                
                if (result.success) {
                    // Add cause list records if available
                    if (result.data && result.data.length > 0) {
                        console.log(`✅ ${benchName}: Found ${result.totalRecords} records`);
                        
                        // Add bench info to each record and extract PDF URLs from entries
                        const benchResults = result.data.map(record => {
                            // Extract PDF URL from the record if it exists
                            if (record.rawData?.pdfUrl && !allPdfUrls.includes(record.rawData.pdfUrl)) {
                                console.log(`📄 Found PDF URL in record: ${record.rawData.pdfUrl}`);
                                allPdfUrls.push(record.rawData.pdfUrl);
                            }
                            
                            return {
                                ...record,
                                benchProcessed: benchName,
                                benchDate: benchDate
                            };
                        });
                        
                        allResults.push(...benchResults);
                    } else {
                        console.log(`📋 ${benchName}: No cause list table data found`);
                    }
                    
                // Collect PDF URLs if available (regardless of table data)
                if (result.pdfUrls && result.pdfUrls.length > 0) {
                    console.log(`📄 ${benchName}: Found ${result.pdfUrls.length} PDF URLs`);
                    result.pdfUrls.forEach((url, index) => {
                        console.log(`  ${index + 1}. ${url}`);
                    });
                    allPdfUrls.push(...result.pdfUrls);
                } else {
                    console.log(`📄 ${benchName}: No direct PDF URLs array found`);
                }
                
                // Also check if we found PDF URLs in the data entries themselves
                if (allPdfUrls.length === 0 && result.data && result.data.length > 0) {
                    const foundPdfUrls = result.data
                        .filter(record => record.rawData?.pdfUrl)
                        .map(record => record.rawData.pdfUrl);
                    
                    if (foundPdfUrls.length > 0) {
                        console.log(`📄 ${benchName}: Found ${foundPdfUrls.length} PDF URLs in data entries`);
                        foundPdfUrls.forEach((url, index) => {
                            console.log(`  ${index + 1}. ${url}`);
                        });
                        allPdfUrls.push(...foundPdfUrls);
                    }
                }                    // Add to bench summary
                    benchSummary.push({
                        benchName: benchName,
                        benchDate: benchDate,
                        recordsFound: result.totalRecords || 0,
                        pdfCount: result.pdfUrls ? result.pdfUrls.length : 0,
                        success: true
                    });
                    
                } else {
                    console.log(`❌ ${benchName}: No data found or error occurred`);
                    benchSummary.push({
                        benchName: benchName,
                        benchDate: benchDate,
                        recordsFound: 0,
                        success: false,
                        error: result.message || 'Unknown error'
                    });
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${benchName}:`, error.message);
                benchSummary.push({
                    benchName: benchName,
                    benchDate: benchDate,
                    recordsFound: 0,
                    success: false,
                    error: error.message
                });
            }
            
            // Add delay between benches to avoid overwhelming the server
            if (i < basicPayload.bench.length - 1) {
                console.log(`⏳ Waiting 3 seconds before next bench...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // STEP 2: PDF EXTRACTION - Download and extract all found PDFs
        console.log('\n🚀 STARTING PDF EXTRACTION PHASE...');
        console.log('=' .repeat(60));
        
        const allPdfContent = [];
        let successfulPdfExtractions = 0;
        let failedPdfExtractions = 0;
        
        if (allPdfUrls.length > 0) {
            console.log(`📄 Found ${allPdfUrls.length} PDF URLs to process`);
            
            for (let i = 0; i < allPdfUrls.length; i++) {
                const pdfUrl = allPdfUrls[i];
                const pdfFileName = pdfUrl.split('/').pop() || `pdf_${i + 1}.pdf`;
                
                console.log(`\n📄 Processing PDF ${i + 1}/${allPdfUrls.length}: ${pdfFileName}`);
                console.log(`🔗 URL: ${pdfUrl}`);
                
                try {
                    console.log(`⬇️  Downloading and extracting PDF content...`);
                    
                    // Use the existing PDF scrapper to extract content
                    const pdfExtractedData = await pdfScrapperNCLTCauseList(pdfUrl);
                    
                    console.log(`✅ PDF extraction successful!`);
                    console.log(`📊 Extracted data summary:`);
                    console.log(`   - Benches found: ${pdfExtractedData.benches ? pdfExtractedData.benches.length : 0}`);
                    
                    if (pdfExtractedData.benches) {
                        let totalCases = 0;
                        pdfExtractedData.benches.forEach(bench => {
                            totalCases += bench.cases ? bench.cases.length : 0;
                            console.log(`   - ${bench.benchName}: ${bench.cases ? bench.cases.length : 0} cases`);
                        });
                        console.log(`   - Total cases: ${totalCases}`);
                    }
                    
                    // Store the extracted PDF content with metadata
                    const pdfContentEntry = {
                        fileName: pdfFileName,
                        url: pdfUrl,
                        extractedAt: new Date().toISOString(),
                        sourceDate: '2025-09-19',
                        extractionSuccess: true,
                        extractedData: pdfExtractedData,
                        summary: {
                            benchesFound: pdfExtractedData.benches ? pdfExtractedData.benches.length : 0,
                            totalCases: pdfExtractedData.benches ? 
                                pdfExtractedData.benches.reduce((total, bench) => total + (bench.cases ? bench.cases.length : 0), 0) : 0
                        }
                    };
                    
                    allPdfContent.push(pdfContentEntry);
                    successfulPdfExtractions++;
                    
                } catch (pdfError) {
                    console.error(`❌ PDF extraction failed: ${pdfError.message}`);
                    
                    // Store failed extraction info
                    const failedPdfEntry = {
                        fileName: pdfFileName,
                        url: pdfUrl,
                        extractedAt: new Date().toISOString(),
                        sourceDate: '2025-09-19',
                        extractionSuccess: false,
                        error: pdfError.message,
                        extractedData: null
                    };
                    
                    allPdfContent.push(failedPdfEntry);
                    failedPdfExtractions++;
                }
                
                // Add delay between PDF extractions to avoid overwhelming the server
                if (i < allPdfUrls.length - 1) {
                    console.log(`⏳ Waiting 2 seconds before next PDF...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            console.log('\n📄 PDF EXTRACTION SUMMARY:');
            console.log(`✅ Successful extractions: ${successfulPdfExtractions}`);
            console.log(`❌ Failed extractions: ${failedPdfExtractions}`);
            console.log(`📊 Total PDFs processed: ${allPdfContent.length}`);
            
        } else {
            console.log('📄 No PDF URLs found - skipping PDF extraction phase');
        }

        // Create consolidated result with PDF content
        const consolidatedResult = {
            success: true,
            data: allResults,
            totalRecords: allResults.length,
            benchSummary: benchSummary,
            pdfUrls: allPdfUrls,
            pdfContent: allPdfContent,
            pdfExtractionSummary: {
                totalPdfs: allPdfUrls.length,
                successfulExtractions: successfulPdfExtractions,
                failedExtractions: failedPdfExtractions,
                extractionRate: allPdfUrls.length > 0 ? (successfulPdfExtractions / allPdfUrls.length * 100).toFixed(1) + '%' : '0%'
            },
            processedBenches: basicPayload.bench.length,
            message: `Successfully processed ${basicPayload.bench.length} benches with ${allResults.length} total entries and ${successfulPdfExtractions} PDF extractions`
        };
        
        console.log('\n🎉 CONSOLIDATED NCLT CAUSE LIST SCRAPER RESULTS:');
        console.log('=' .repeat(60));
        console.log(`📊 Total Records Found: ${consolidatedResult.totalRecords}`);
        console.log(`🏛️  Benches Processed: ${consolidatedResult.processedBenches}`);
        console.log(`📄 Total PDF URLs: ${consolidatedResult.pdfUrls.length}`);
        console.log(`📋 PDF Content Extracted: ${consolidatedResult.pdfContent.length}`);
        console.log(`✅ Successful PDF Extractions: ${consolidatedResult.pdfExtractionSummary.successfulExtractions}`);
        console.log(`❌ Failed PDF Extractions: ${consolidatedResult.pdfExtractionSummary.failedExtractions}`);
        console.log(`📈 PDF Extraction Rate: ${consolidatedResult.pdfExtractionSummary.extractionRate}`);
        
        // Bench Summary
        console.log('\n🏛️  BENCH PROCESSING SUMMARY:');
        consolidatedResult.benchSummary.forEach(bench => {
            const status = bench.success ? '✅' : '❌';
            console.log(`${status} ${bench.benchName}: ${bench.recordsFound} records`);
            if (!bench.success && bench.error) {
                console.log(`   Error: ${bench.error}`);
            }
        });
        
        if (consolidatedResult.data && consolidatedResult.data.length > 0) {
            console.log('\n📄 SAMPLE CAUSE LIST RECORDS:');
            consolidatedResult.data.slice(0, 3).forEach((record, index) => {
                console.log(`${index + 1}. ID: ${record.id}`);
                console.log(`   📋 Case: ${record.caseNumber}`);
                console.log(`   👥 Parties: ${record.parties}`);
                console.log(`   📍 Stage: ${record.stage}`);
                console.log(`   🏛️  Court: ${record.courtRoom}`);
                console.log(`   ⏰ Time: ${record.listingTime}`);
                console.log(`   🏛️  Bench: ${record.benchProcessed}`);
                console.log('');
            });
            
            if (consolidatedResult.data.length > 3) {
                console.log(`   ... and ${consolidatedResult.data.length - 3} more records`);
            }
        }
        
        // Sample PDF URLs
        if (consolidatedResult.pdfUrls && consolidatedResult.pdfUrls.length > 0) {
            console.log('\n📄 FOUND PDF URLs:');
            consolidatedResult.pdfUrls.forEach((url, index) => {
                console.log(`${index + 1}. ${url}`);
            });
        }
        
        // PDF Content Summary
        if (consolidatedResult.pdfContent && consolidatedResult.pdfContent.length > 0) {
            console.log('\n📋 PDF EXTRACTION RESULTS:');
            consolidatedResult.pdfContent.forEach((pdf, index) => {
                const status = pdf.extractionSuccess ? '✅' : '❌';
                console.log(`${status} ${index + 1}. ${pdf.fileName}`);
                console.log(`   🔗 URL: ${pdf.url}`);
                
                if (pdf.extractionSuccess && pdf.summary) {
                    console.log(`   📊 Benches Found: ${pdf.summary.benchesFound}`);
                    console.log(`   📋 Total Cases: ${pdf.summary.totalCases}`);
                    
                    // Show sample cases from first bench
                    if (pdf.extractedData.benches && pdf.extractedData.benches.length > 0) {
                        const firstBench = pdf.extractedData.benches[0];
                        if (firstBench.cases && firstBench.cases.length > 0) {
                            console.log(`   📄 Sample Case: ${firstBench.cases[0].caseNumber || 'No case number'}`);
                            console.log(`   👥 Sample Parties: ${firstBench.cases[0].parties || 'No parties listed'}`);
                        }
                    }
                } else if (!pdf.extractionSuccess) {
                    console.log(`   ❌ Error: ${pdf.error}`);
                }
                console.log('');
            });
        }
        
        // Save results to JSON files for bucket upload
        console.log('\n💾 SAVING RESULTS TO JSON FILES:');
        console.log('=' .repeat(60));
        
        try {
            // Save complete consolidated result
            const completeCauseListFile = `nclt-complete-result-all-32-benches-2025-09-19.json`;
            fs.writeFileSync(completeCauseListFile, JSON.stringify(consolidatedResult, null, 2));
            console.log(`✅ Complete result saved: ${completeCauseListFile}`);
            
            // Save only PDF content for easier access
            if (consolidatedResult.pdfContent.length > 0) {
                const pdfContentFile = `nclt-pdf-content-all-32-benches-2025-09-19.json`;
                const pdfOnlyData = {
                    extractionInfo: {
                        totalBenches: basicPayload.bench.length,
                        sourceDate: '2025-09-19',
                        extractedAt: new Date().toISOString(),
                        totalPdfs: consolidatedResult.pdfContent.length
                    },
                    pdfExtractionSummary: consolidatedResult.pdfExtractionSummary,
                    extractedContent: consolidatedResult.pdfContent
                };
                fs.writeFileSync(pdfContentFile, JSON.stringify(pdfOnlyData, null, 2));
                console.log(`✅ PDF content saved: ${pdfContentFile}`);
            }
            
            // Save cause list data separately
            if (consolidatedResult.data.length > 0) {
                const causeListFile = `nclt-cause-list-all-32-benches-2025-09-19.json`;
                const causeListData = {
                    benchInfo: {
                        totalBenches: basicPayload.bench.length,
                        date: '2025-09-19',
                        processedAt: new Date().toISOString()
                    },
                    summary: {
                        totalRecords: consolidatedResult.totalRecords,
                        benchesProcessed: consolidatedResult.processedBenches
                    },
                    causeList: consolidatedResult.data
                };
                fs.writeFileSync(causeListFile, JSON.stringify(causeListData, null, 2));
                console.log(`✅ Cause list data saved: ${causeListFile}`);
            }
            
            console.log('\n📁 Files ready for bucket upload:');
            console.log(`   1. Complete result: ${completeCauseListFile}`);
            if (consolidatedResult.pdfContent.length > 0) {
                console.log(`   2. PDF content: nclt-pdf-content-all-32-benches-2025-09-19.json`);
            }
            if (consolidatedResult.data.length > 0) {
                console.log(`   3. Cause list: nclt-cause-list-all-32-benches-2025-09-19.json`);
            }
            
        } catch (saveError) {
            console.error('❌ Error saving files:', saveError.message);
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 LOCAL TESTING COMPLETED SUCCESSFULLY!');
        console.log('💡 All benches processed individually with proper form handling');
        
        return consolidatedResult;
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Export for testing
module.exports = {
    testNCLTCauseListScrapper
};

// Run test if this file is executed directly
if (require.main === module) {
    testNCLTCauseListScrapper();
}
