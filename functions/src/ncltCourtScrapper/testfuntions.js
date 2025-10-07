const https = require('https');

// Test with the exact same parameters that worked locally
const data = JSON.stringify({
    bench: "Mumbai",
    case_type: "CP(AA) Merger and Amalgamation(Companies Act)",
    cp_no: "146",
    year: "2022"
});

console.log('Testing NCLT Court Scraper with payload:');
console.log(JSON.parse(data));
console.log('\nSending request...\n');

const options = {
    hostname: 'asia-south1-booming-order-465208-t8.cloudfunctions.net',
    path: '/fetchNCLTCourtJudgments',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    let body = '';
    
    res.on('data', (chunk) => {
        body += chunk;
    });
    
    res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Headers:', res.headers);
        
        try {
            const jsonResponse = JSON.parse(body);
            console.log('\n=== RESPONSE ANALYSIS ===');
            console.log('Success:', jsonResponse.success);
            console.log('Total Records:', jsonResponse.total_records);
            console.log('Message:', jsonResponse.message);
            console.log('Error Type:', jsonResponse.errorType || 'None');
            
            if (jsonResponse.success && jsonResponse.total_records > 0) {
                console.log('\n✅ SUCCESS - Found records!');
                console.log('Court Name:', jsonResponse.court_name);
                console.log('Data Count:', jsonResponse.data?.length || 0);
                
                if (jsonResponse.data && jsonResponse.data.length > 0) {
                    const firstCase = jsonResponse.data[0];
                    console.log('\nFirst Case Details:');
                    console.log('- Filing Number:', firstCase.filingNumber);
                    console.log('- Case Number:', firstCase.caseNumber);
                    console.log('- Party Name:', firstCase.partyName);
                    console.log('- PDF Links:', firstCase.pdfLinks?.length || 0);
                }
            } else {
                console.log('\n❌ NO RECORDS FOUND');
                console.log('Possible reasons:');
                console.log('1. Captcha solving failed');
                console.log('2. Case parameters are incorrect');
                console.log('3. Form submission failed');
            }
            
            console.log('\n=== FULL RESPONSE ===');
            console.log(JSON.stringify(jsonResponse, null, 2));
            
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError.message);
            console.log('Raw response body:', body);
        }
    });
});

req.on('error', (error) => {
    console.error('Request Error:', error);
});

req.setTimeout(600000, () => {
    console.error('Request timeout after 10 minutes');
    req.destroy();
});

req.write(data);
req.end();