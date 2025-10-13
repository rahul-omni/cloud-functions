const https = require('https');

// Test with automatic AI captcha solving
const data = JSON.stringify({
    bench: "Mumbai",
    case_type: "CP(AA) Merger and Amalgamation(Companies Act)",
    cp_no: "146",
    year: "2022"
    // No manual captcha - let AI solve it automatically
});

console.log('Testing NCLT Court Scraper with automatic AI captcha solving:');
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
    
    console.log(`Response Status: ${res.statusCode}`);
    console.log('Response Headers:', res.headers);
    
    res.on('data', (chunk) => {
        body += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(body);
            
            console.log('\n=== RESPONSE ANALYSIS ===');
            console.log('Success:', response.success);
            console.log('Total Records:', response.total_records || 0);
            console.log('Message:', response.message || 'None');
            console.log('Error Type:', response.error_type || 'None');
            
            if (response.total_records > 0) {
                console.log('\n✅ RECORDS FOUND');
                console.log('Data Preview:', JSON.stringify(response.data?.slice(0, 1), null, 2));
            } else {
                console.log('\n❌ NO RECORDS FOUND');
                console.log('Possible reasons:');
                console.log('1. Captcha solving failed');
                console.log('2. Case parameters are incorrect');
                console.log('3. Form submission failed');
            }
            
            console.log('\n=== FULL RESPONSE ===');
            console.log(JSON.stringify(response, null, 2));
            
        } catch (parseError) {
            console.error('Failed to parse response:', parseError.message);
            console.log('Raw response:', body);
        }
    });
});

req.on('error', (error) => {
    console.error('Request failed:', error.message);
});

req.setTimeout(600000, () => {
    console.error('Request timeout after 10 minutes');
    req.destroy();
});

req.write(data);
req.end();