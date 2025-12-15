// Test script for District Court Cause List Scraper
const { DistrictCourtCauseListScrapper } = require('./districtCourtCauseListScrapper');

async function testCauseListScraper() {
    try {
        console.log('🧪 Testing District Court Cause List Scraper...');
        
        // Test parameters
        const testParams = {
            causeListDate: '2024-01-15', // Use a specific date
            courtComplex: 'District Court, Gurugram',
            courtNumber: 'Court No. 1',
            causeType: 'Civil'
        };
        
        console.log('📋 Test Parameters:', testParams);
        
        // Run the scraper
        const result = await DistrictCourtCauseListScrapper(
            testParams.causeListDate,
            testParams.courtComplex,
            null, // courtEstablishment
            testParams.courtNumber,
            testParams.causeType
        );
        
        console.log('✅ Scraping completed successfully!');
        console.log('📊 Results Summary:');
        console.log(`   - Total Courts: ${result.total_courts}`);
        console.log(`   - Total Cases: ${result.total_cases}`);
        console.log(`   - Court Name: ${result.court_name}`);
        console.log(`   - Search Timestamp: ${result.search_timestamp}`);
        
        // Display first few cases as sample
        if (result.cause_list && result.cause_list.length > 0) {
            console.log('\n📋 Sample Cases:');
            result.cause_list.slice(0, 3).forEach((caseItem, index) => {
                console.log(`   ${index + 1}. ${caseItem.case_details} - ${caseItem.petitioner} vs ${caseItem.respondent}`);
            });
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        throw error;
    }
}

// Example usage with different parameters
async function testWithDifferentParams() {
    console.log('\n🧪 Testing with different parameters...');
    
    try {
        // Test with Court Establishment instead of Court Complex
        const result = await DistrictCourtCauseListScrapper(
            '2024-01-15',
            null, // courtComplex
            'District and Sessions Court, Gurgram', // courtEstablishment
            'Court No. 2',
            'Criminal'
        );
        
        console.log('✅ Alternative parameters test completed!');
        console.log(`📊 Found ${result.total_cases} cases in ${result.total_courts} courts`);
        
    } catch (error) {
        console.error('❌ Alternative test failed:', error.message);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    (async () => {
        try {
            await testCauseListScraper();
            await testWithDifferentParams();
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    testCauseListScraper,
    testWithDifferentParams
};
