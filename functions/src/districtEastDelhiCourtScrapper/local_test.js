// Load .env from parent directory
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

 // Set the API key directly first
process.env.OPENAI_API_KEY =  "YOUR_OPENAI_API_KEY_HERE"; // Replace with your actual OpenAI API key
const { EastDelhiDistrictCourtScrapper } = require('./districtCourtScrapper');

async function testLocalScraping() {
    try {
        console.log('🚀 Starting local test of East Delhi District Court Scraper...');
        console.log('� Checking environment...');
        
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not found in environment variables');
        }
        
        console.log('✅ OpenAI API Key found');
        
        const testPayload = {
            caseNumber: "212",              // Case number from form
            caseYear: "2022",            // Year from form
            caseType: "CR Cases",           // Case type dropdown value
            courtComplex: "Karkardooma Court Complex", // Court complex dropdown value
            courtName: "East District Court, Delhi"
        };

        console.log('📝 Test configuration:', JSON.stringify(testPayload, null, 2));
        console.log('\n🔄 Starting scraping process...\n');

        // Call the scraper with form values
        const result = await EastDelhiDistrictCourtScrapper(
            null,                     // date (null since we're searching by case number)
            `${testPayload.caseNumber}/${testPayload.caseYear}`,  // Combined case number and year
            testPayload.courtName,    // Court name
            testPayload.caseType,     // Case type
            testPayload.courtComplex  // Court complex
        );

        console.log('\n✅ SUCCESS! Function completed:');
        console.log('📊 Results:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
}

testLocalScraping();