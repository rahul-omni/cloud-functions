/**
 * FOCUSED PDF EXTRACTION TEST - Process only benches with confirmed data
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

async function testPdfExtractionForDataBenches() {
    console.log('🎯 FOCUSED PDF EXTRACTION TEST - CONFIRMED DATA BENCHES');
    console.log('=' .repeat(70));
    
    // Only test benches we know have data for 2025-09-19
    const benchesWithData = [
        { name: "Allahabad Bench Court-I", causeListDate: "2025-09-19", expectedEntries: 3 },
        { name: "Amaravati Bench Court-I", causeListDate: "2025-09-19", expectedEntries: 1 },
        { name: "Chandigarh Bench Court-I", causeListDate: "2025-09-19", expectedEntries: 27 },
        { name: "Chandigarh Bench Court-II", causeListDate: "2025-09-19", expectedEntries: 29 },
        { name: "Chennai Bench Court-I", causeListDate: "2025-09-19", expectedEntries: 20 },
        { name: "Jaipur Bench Court-I", causeListDate: "2025-09-19", expectedEntries: 2 }
    ];

    const allResults = [];
    const allPdfContent = [];
    let totalCasesExtracted = 0;

    for (let i = 0; i < benchesWithData.length; i++) {
        const bench = benchesWithData[i];
        console.log(`\n📍 Processing ${i + 1}/${benchesWithData.length}: ${bench.name}`);
        console.log(`📋 Expected entries: ${bench.expectedEntries}`);
        
        try {
            // Step 1: Get cause list data
            console.log('🔍 Step 1: Fetching cause list data...');
            const result = await fetchNCLTCauseList({
                bench: bench.name,
                causeListDate: bench.causeListDate
            });

            if (result.success && result.data && result.data.length > 0) {
                console.log(`✅ Found ${result.data.length} cause list records`);
                allResults.push(...result.data);

                // Step 2: Extract PDF URLs
                const pdfUrls = result.data
                    .filter(record => record.rawData?.pdfUrl)
                    .map(record => record.rawData.pdfUrl);

                if (pdfUrls.length > 0) {
                    console.log(`📄 Found ${pdfUrls.length} PDF URLs:`);
                    pdfUrls.forEach((url, index) => {
                        console.log(`  ${index + 1}. ${url.split('/').pop()}`);
                    });

                    // Step 3: Extract PDF content
                    for (let j = 0; j < pdfUrls.length; j++) {
                        const pdfUrl = pdfUrls[j];
                        const fileName = pdfUrl.split('/').pop();
                        
                        console.log(`\n📥 Step 3.${j + 1}: Extracting PDF: ${fileName}`);
                        
                        try {
                            const pdfData = await pdfScrapperNCLTCauseList(pdfUrl);
                            
                            if (pdfData && pdfData.benches && pdfData.benches.length > 0) {
                                const totalCases = pdfData.benches.reduce((sum, bench) => sum + (bench.cases ? bench.cases.length : 0), 0);
                                
                                console.log(`✅ PDF extraction successful!`);
                                console.log(`   📊 Benches found: ${pdfData.benches.length}`);
                                console.log(`   📋 Total cases: ${totalCases}`);
                                
                                totalCasesExtracted += totalCases;

                                // Store extracted content
                                const pdfContent = {
                                    benchName: bench.name,
                                    fileName: fileName,
                                    url: pdfUrl,
                                    extractedAt: new Date().toISOString(),
                                    expectedEntries: bench.expectedEntries,
                                    actualEntries: totalCases,
                                    matchesExpected: totalCases === bench.expectedEntries,
                                    extractedData: pdfData,
                                    summary: {
                                        benchesFound: pdfData.benches.length,
                                        totalCases: totalCases,
                                        sampleCases: pdfData.benches[0]?.cases?.slice(0, 3) || []
                                    }
                                };

                                allPdfContent.push(pdfContent);

                                // Show sample cases
                                if (pdfData.benches[0]?.cases?.length > 0) {
                                    console.log(`   📄 Sample cases:`);
                                    pdfData.benches[0].cases.slice(0, 3).forEach((caseData, idx) => {
                                        console.log(`     ${idx + 1}. ${caseData.caseNumber || 'No case number'}`);
                                    });
                                }
                            } else {
                                console.log(`❌ PDF extraction failed - no valid data structure returned`);
                            }

                        } catch (pdfError) {
                            console.error(`❌ PDF extraction error: ${pdfError.message}`);
                        }
                    }
                } else {
                    console.log(`📄 No PDF URLs found in data records`);
                }
            } else {
                console.log(`❌ No cause list data found for ${bench.name}`);
            }

        } catch (error) {
            console.error(`❌ Error processing ${bench.name}: ${error.message}`);
        }

        // Brief delay between benches
        if (i < benchesWithData.length - 1) {
            console.log(`⏳ Waiting 3 seconds before next bench...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    // Generate final report
    console.log('\n' + '=' .repeat(70));
    console.log('🎉 PDF EXTRACTION COMPLETION REPORT');
    console.log('=' .repeat(70));
    
    console.log(`📊 Summary:`);
    console.log(`   🏛️  Benches tested: ${benchesWithData.length}`);
    console.log(`   📋 Cause list records: ${allResults.length}`);
    console.log(`   📄 PDFs extracted: ${allPdfContent.length}`);
    console.log(`   ⚖️  Total cases extracted: ${totalCasesExtracted}`);
    
    if (allPdfContent.length > 0) {
        console.log(`\n📄 PDF EXTRACTION RESULTS:`);
        allPdfContent.forEach((pdf, index) => {
            const status = pdf.matchesExpected ? '✅' : '⚠️';
            console.log(`${status} ${index + 1}. ${pdf.benchName}`);
            console.log(`     📁 File: ${pdf.fileName}`);
            console.log(`     📊 Cases: ${pdf.actualEntries}/${pdf.expectedEntries}`);
            console.log(`     🎯 Match: ${pdf.matchesExpected ? 'Yes' : 'No'}`);
        });

        // Save comprehensive results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = `pdf-extraction-test-results-${timestamp}.json`;
        
        const finalResults = {
            testInfo: {
                testType: "focused_pdf_extraction",
                targetDate: "2025-09-19",
                benchesTested: benchesWithData.length,
                extractedAt: new Date().toISOString()
            },
            summary: {
                causeListRecords: allResults.length,
                pdfsExtracted: allPdfContent.length,
                totalCasesExtracted: totalCasesExtracted,
                successRate: `${allPdfContent.length}/${benchesWithData.length}`
            },
            causeListData: allResults,
            pdfExtractionResults: allPdfContent
        };

        fs.writeFileSync(resultsFile, JSON.stringify(finalResults, null, 2));
        console.log(`\n💾 Results saved to: ${resultsFile}`);
        console.log(`📁 File contains complete cause list data and extracted PDF content in JSON format`);
        console.log(`☁️  Ready for bucket upload!`);
    }

    console.log('\n🎯 FOCUSED TEST COMPLETED!');
    return { allResults, allPdfContent, totalCasesExtracted };
}

// Run test if this file is executed directly
if (require.main === module) {
    testPdfExtractionForDataBenches();
}

module.exports = { testPdfExtractionForDataBenches };
