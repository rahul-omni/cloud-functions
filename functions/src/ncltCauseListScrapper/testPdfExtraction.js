const { ncltCauseListScrapper } = require('./ncltCauseListScrapper');
const { extractAllPdfUrls, extractAllPdfContent, extractSinglePdfContent } = require('./pdfExtractor');

/**
 * Test PDF URL extraction
 */
async function testPdfUrlExtraction() {
    console.log('\n🔗 Testing PDF URL Extraction...');
    console.log('=' * 50);
    
    try {
        // First scrape the cause list
        const scraperResult = await ncltCauseListScrapper({
            bench: 'Ahmedabad Bench Court-II',
            causeListDate: '2025-09-17'
        });
        
        console.log(`📋 Scraper found ${scraperResult.totalRecords} entries`);
        
        // Extract PDF URLs
        const pdfUrlsResult = extractAllPdfUrls(scraperResult);
        
        console.log('\n📄 PDF URLs Extraction Result:');
        console.log(JSON.stringify(pdfUrlsResult, null, 2));
        
        return pdfUrlsResult;
        
    } catch (error) {
        console.error('❌ PDF URL extraction test failed:', error);
        throw error;
    }
}

/**
 * Test single PDF content extraction
 */
async function testSinglePdfExtraction() {
    console.log('\n📖 Testing Single PDF Content Extraction...');
    console.log('=' * 50);
    
    try {
        // Use a known PDF URL from the previous test
        const pdfUrl = 'https://nclt.gov.in/sites/default/files/pdf_cause_list/17-09-2025%20%20C-2%20Shailesh.pdf';
        
        console.log(`📥 Extracting content from: ${pdfUrl}`);
        
        const result = await extractSinglePdfContent(pdfUrl, {
            title: 'Test PDF',
            court: 'Ahmedabad Bench Court-II'
        });
        
        console.log('\n📄 Single PDF Content Extraction Result:');
        console.log(JSON.stringify(result, null, 2));
        
        return result;
        
    } catch (error) {
        console.error('❌ Single PDF extraction test failed:', error);
        throw error;
    }
}

/**
 * Test complete PDF content extraction for all PDFs
 */
async function testAllPdfContentExtraction() {
    console.log('\n📚 Testing Complete PDF Content Extraction...');
    console.log('=' * 50);
    
    try {
        // First scrape the cause list
        console.log('🔍 Step 1: Scraping NCLT cause list...');
        const scraperResult = await ncltCauseListScrapper({
            bench: 'Ahmedabad Bench Court-II',
            causeListDate: '2025-09-17'
        });
        
        console.log(`📋 Found ${scraperResult.totalRecords} cause list entries`);
        
        // Extract all PDF content
        console.log('\n📥 Step 2: Extracting content from all PDFs...');
        const allPdfContent = await extractAllPdfContent(scraperResult);
        
        console.log('\n📄 Complete PDF Content Extraction Result:');
        console.log('Summary:');
        console.log(`- Total PDFs: ${allPdfContent.totalPdfs}`);
        console.log(`- Successful extractions: ${allPdfContent.successfulExtractions}`);
        console.log(`- Failed extractions: ${allPdfContent.failedExtractions}`);
        
        if (allPdfContent.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            allPdfContent.errors.forEach(error => {
                console.log(`  - ${error.pdfFileName}: ${error.error}`);
            });
        }
        
        console.log('\n📊 Full extraction result:');
        console.log(JSON.stringify(allPdfContent, null, 2));
        
        return allPdfContent;
        
    } catch (error) {
        console.error('❌ Complete PDF extraction test failed:', error);
        throw error;
    }
}

/**
 * Test just the PDF URLs extraction (quick test)
 */
async function testQuickPdfUrls() {
    console.log('\n⚡ Quick PDF URLs Test...');
    console.log('=' * 30);
    
    try {
        // Use existing scraper result format for testing
        const mockScraperResult = {
            success: true,
            data: [
                {
                    rawData: {
                        title: "Ahmedabad Bench Cause List",
                        court: "Ahmedabad Bench Court-II",
                        numberOfEntries: "53",
                        pdfUrl: "https://nclt.gov.in/sites/default/files/pdf_cause_list/17-09-2025%20%20C-2%20Shailesh.pdf",
                        pdfFileName: "17-09-2025  C-2 Shailesh.pdf",
                        fileSize: "319.99 KB",
                        causeDate: "17/09/2025"
                    }
                },
                {
                    rawData: {
                        title: "Ahmedabad Special Bench Cause List",
                        court: "Ahmedabad Bench Court-II",
                        numberOfEntries: "1",
                        pdfUrl: "https://nclt.gov.in/sites/default/files/pdf_cause_list/17-09-2025%20%20C-2%20Special%20Bench..pdf",
                        pdfFileName: "17-09-2025  C-2 Special Bench..pdf",
                        fileSize: "256.33 KB",
                        causeDate: "17/09/2025"
                    }
                }
            ],
            metadata: {
                bench: "Ahmedabad Bench Court-II",
                causeListDate: "2025-09-17",
                scrapedAt: new Date().toISOString()
            }
        };
        
        const pdfUrls = extractAllPdfUrls(mockScraperResult);
        
        console.log('🔗 Extracted PDF URLs:');
        pdfUrls.pdfUrls.forEach((url, index) => {
            console.log(`${index + 1}. ${url}`);
        });
        
        console.log('\n📋 Full PDF data:');
        console.log(JSON.stringify(pdfUrls, null, 2));
        
        return pdfUrls;
        
    } catch (error) {
        console.error('❌ Quick PDF URLs test failed:', error);
        throw error;
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('🧪 Starting PDF Extraction Tests...');
    console.log('=' * 60);
    
    try {
        // Test 1: Quick PDF URLs extraction
        await testQuickPdfUrls();
        
        // Test 2: Real PDF URL extraction
        await testPdfUrlExtraction();
        
        // Test 3: Single PDF content extraction
        await testSinglePdfExtraction();
        
        // Test 4: Complete PDF content extraction (this will take longer)
        console.log('\n⏳ Running complete extraction test (this may take a few minutes)...');
        await testAllPdfContentExtraction();
        
        console.log('\n✅ All PDF extraction tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ PDF extraction tests failed:', error);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testPdfUrlExtraction,
    testSinglePdfExtraction,
    testAllPdfContentExtraction,
    testQuickPdfUrls,
    runAllTests
};
