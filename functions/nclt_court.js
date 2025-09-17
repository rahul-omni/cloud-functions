// Set OpenAI API key for testing (you need to add your actual key)
// process.env.OPENAI_API_KEY = "your-open"  // const testPayload = {
    //     bench: "Mumbai",
    //     case_type: "Contempt Petition(Companies Act)", 
    //     diary_number:   "8", //"85",
    //     year: "2016" ,// "2014"
    // };
    //  const testPayload = {
    //     bench: "kolkata",
    //     case_type:  "CP(AA) Merger and Amalgamation(Companies Act)", 
    //     diary_number:   "31", //"85",
    //     year: "2024" ,// "2014"
    // };
require('dotenv').config({ path: '../.env' });
const apiKey = process.env.OPENAI_API_KEY;
console.log('✅ OpenAI API key loaded:', apiKey);

const { NCLTCourtJudgmentsScrapper } = require('./src/ncltCourtScrapper/ncltCourtScrapper.js');

async function testNCLTWithRealPayload() {
    console.log('🚀 Testing NCLT with REAL working payload...');
    
    // Check if API key is set
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.length < 10) {
        console.error('❌ Please set your OPENAI_API_KEY in the test file or environment variables');
        console.log('💡 You can:');
        console.log('   1. Edit test_nclt.js and replace "your-openai-api-key-here" with your actual key');
        console.log('   2. Or set environment variable: $env:OPENAI_API_KEY="your-key"');
        return;
    }
    
    console.log('✅ OpenAI API key loaded:', process.env.OPENAI_API_KEY.substring(0, 20) + '...');
    
    // Real working payload from the user that works on the website
    // const testPayload = {
    //     bench: "Principal Bench",
    //     case_type: "Company Petition IB (IBC)", 
    //     diary_number: "36",
    //     year: "2022"
    // };
    //  const testPayload = {
    //     bench: "kolkata",
    //     case_type: "Company Petition IB (IBC)", 
    //     diary_number: "650",
    //     year: "2018"
    // };
    //  const testPayload = {
    //     bench: "Amravati",
    //     case_type: "Company Petition IB (IBC)", 
    //     diary_number: "54",
    //     year: "2021"
    // };
    // const testPayload = {
    //     bench: "Mumbai",
    //     case_type: "Contempt Petition(Companies Act)", 
    //     diary_number:   "8", //"85",
    //     year: "2016" ,// "2014"
    // };
    //  const testPayload = {
    //     bench: "kolkata",
    //     case_type:  "CP(AA) Merger and Amalgamation(Companies Act)", 
    //     diary_number:   "3111", // Valid case number that we know works
    //     year: "2024" ,// "2014"
    // };
    const testPayload = {
        bench: "jaipur",
        case_type:  "Transfer Petition(Companies Act)", 
        diary_number:   "1200", //"85",
        year: "2023" ,// "2014"
    };
    //  const testPayload = {
    //     bench: "jaipur",
    //     case_type:  "Company Petition (Companies Act)", 
    //     diary_number:   "250", //"85",
    //     year: "2019" ,// "2014"
    // };
    // const testPayload = {
    //     bench: "jaipur",
    //     case_type:  "Company Petition (Companies Act)", 
    //     diary_number:   "92", //"85",
    //     year: "2017" ,// "2014"
    // };
    //  const testPayload = {
    //     bench: "jaipur",
    //     case_type:  "Company Petition (Companies Act)", 
    //     diary_number:   "372", //"85",
    //     year: "2017" ,// "2014"
    // };
    console.log('📝 Test payload (confirmed working on website):', testPayload);
    
    try {
        console.log('⚡ Starting NCLT scraper with real payload...');
        
        // Call the main scraper function with the working parameters as an object
        const result = await NCLTCourtJudgmentsScrapper({
            bench: testPayload.bench,
            caseType: testPayload.case_type,
            diaryNumber: testPayload.diary_number, 
            year: testPayload.year
        });
        
        console.log('✅ NCLT Scraper Result:', result);
        
        if (result && result.judgments) {
            console.log(`📊 Found ${result.judgments.length} cases`);
            
            // Log sample case data if any found
            if (result.judgments.length > 0) {
                const firstCase = result.judgments[0];
                console.log('📄 Sample case data:', {
                    filingNumber: firstCase.filingNumber,
                    caseNumber: firstCase.caseNumber,
                    status: firstCase.status,
                    hasStatusLink: !!firstCase.statusLink,
                    source: firstCase.source,
                    cellCount: firstCase.cellCount,
                    hasDetailedInfo: firstCase.hasDetailedInfo,
                    listingHistoryCount: firstCase.listingHistory?.length || 0
                });
                
                // 🔍 DETAILED PDF LINK EXTRACTION
                console.log('\n🔗 PDF LINKS EXTRACTION:');
                console.log('=' .repeat(50));
                
                if (firstCase.listingHistory && firstCase.listingHistory.length > 0) {
                    console.log(`📋 Found ${firstCase.listingHistory.length} listing history entries`);
                    
                    let totalPdfLinks = 0;
                    let entriesWithPdfs = 0;
                    
                    firstCase.listingHistory.forEach((entry, index) => {
                        const hasPdfLinks = entry.pdfLinks && entry.pdfLinks.length > 0;
                        const hasPdfUrl = !!entry.pdfUrl;
                        
                        if (hasPdfLinks || hasPdfUrl) {
                            entriesWithPdfs++;
                            console.log(`\n📄 Entry ${index + 1}:`);
                            console.log(`   S.No: ${entry.serialNo}`);
                            console.log(`   Date of Listing: ${entry.dateOfListing}`);
                            console.log(`   Date of Upload: ${entry.dateOfUpload}`);
                            console.log(`   Order/Judgement: ${entry.orderJudgement}`);
                            
                            if (entry.pdfUrl) {
                                console.log(`   📎 Primary PDF URL: ${entry.pdfUrl}`);
                            }
                            
                            if (entry.pdfLinks && entry.pdfLinks.length > 0) {
                                console.log(`   📎 All PDF Links (${entry.pdfLinks.length}):`);
                                entry.pdfLinks.forEach((pdfLink, pdfIndex) => {
                                    console.log(`      ${pdfIndex + 1}. Text: "${pdfLink.text}" | URL: ${pdfLink.url}`);
                                });
                                // Count unique PDF links (prefer pdfLinks over pdfUrl to avoid double counting)
                                totalPdfLinks += entry.pdfLinks.length;
                            } else if (entry.pdfUrl) {
                                // Only count pdfUrl if no pdfLinks exist to avoid double counting
                                totalPdfLinks++;
                            }
                        }
                    });
                    
                    console.log('\n📊 PDF EXTRACTION SUMMARY:');
                    console.log(`   Total Entries: ${firstCase.listingHistory.length}`);
                    console.log(`   Entries with PDFs: ${entriesWithPdfs}`);
                    console.log(`   Total PDF Links: ${totalPdfLinks}`);
                    
                    // Show first 5 PDF URLs for quick reference
                    console.log('\n🔗 FIRST 5 PDF URLS FOR DATABASE:');
                    const pdfUrls = [];
                    const uniqueUrls = new Set();
                    
                    firstCase.listingHistory.forEach(entry => {
                        if (entry.pdfLinks && entry.pdfLinks.length > 0) {
                            entry.pdfLinks.forEach(link => {
                                if (!uniqueUrls.has(link.url)) {
                                    uniqueUrls.add(link.url);
                                    pdfUrls.push(link.url);
                                }
                            });
                        } else if (entry.pdfUrl && !uniqueUrls.has(entry.pdfUrl)) {
                            uniqueUrls.add(entry.pdfUrl);
                            pdfUrls.push(entry.pdfUrl);
                        }
                    });
                    
                    pdfUrls.slice(0, 5).forEach((url, index) => {
                        console.log(`   ${index + 1}. ${url}`);
                    });
                    
                    if (pdfUrls.length > 5) {
                        console.log(`   ... and ${pdfUrls.length - 5} more PDF URLs`);
                    }
                    
                } else {
                    console.log('❌ No listing history found in case details');
                }
                
                // Log all cases found
                result.judgments.forEach((caseData, index) => {
                    // Calculate unique PDF count correctly
                    let uniquePdfCount = 0;
                    const seenUrls = new Set();
                    
                    if (caseData.listingHistory) {
                        caseData.listingHistory.forEach(entry => {
                            if (entry.pdfLinks && entry.pdfLinks.length > 0) {
                                entry.pdfLinks.forEach(link => {
                                    if (!seenUrls.has(link.url)) {
                                        seenUrls.add(link.url);
                                        uniquePdfCount++;
                                    }
                                });
                            } else if (entry.pdfUrl && !seenUrls.has(entry.pdfUrl)) {
                                seenUrls.add(entry.pdfUrl);
                                uniquePdfCount++;
                            }
                        });
                    }
                    
                    console.log(`\n📋 Case ${index + 1}:`, {
                        filing: caseData.filingNumber,
                        status: caseData.status,
                        hasLink: !!caseData.statusLink,
                        cells: caseData.cellCount,
                        pdfCount: uniquePdfCount
                    });
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testNCLTWithRealPayload();
