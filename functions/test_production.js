// Production test for NCLT Cloud Function
// Tests the deployed GCP function to ensure same performance as local

const https = require('https');

async function testProductionNCLTFunction() {
    console.log('🌐 Testing PRODUCTION NCLT Cloud Function...');
    console.log('📋 This should extract the same 34 PDF links as local test');
    
    // Your working payload from local tests
    const testPayload = {
        bench: "Principal Bench",
        caseType: "Company Petition IB (IBC)", 
        diaryNumber: "36",
        year: "2022"
    };
    
    console.log('📝 Test payload (same as local):', testPayload);
    
    // Replace with your actual GCP project ID
    const projectId = 'your-project-id'; // ⚠️ Replace this!
    const functionUrl = `https://asia-south1-${projectId}.cloudfunctions.net/fetchNCLTCourtJudgments`;
    
    console.log('🔗 Testing URL:', functionUrl);
    
    const postData = JSON.stringify(testPayload);
    
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 600000 // 10 minutes timeout
    };
    
    return new Promise((resolve, reject) => {
        console.log('⚡ Calling production NCLT function...');
        
        const req = https.request(functionUrl, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    console.log('✅ Production function response received!');
                    console.log(`📊 Status: ${res.statusCode}`);
                    
                    if (result.success && result.judgments) {
                        console.log(`📋 Found ${result.judgments.length} cases in production`);
                        
                        if (result.judgments.length > 0) {
                            const firstCase = result.judgments[0];
                            
                            // Count PDF links (same logic as local test)
                            let totalPdfLinks = 0;
                            const seenUrls = new Set();
                            
                            if (firstCase.listingHistory) {
                                firstCase.listingHistory.forEach(entry => {
                                    if (entry.pdfLinks && entry.pdfLinks.length > 0) {
                                        entry.pdfLinks.forEach(link => {
                                            if (!seenUrls.has(link.url)) {
                                                seenUrls.add(link.url);
                                                totalPdfLinks++;
                                            }
                                        });
                                    } else if (entry.pdfUrl && !seenUrls.has(entry.pdfUrl)) {
                                        seenUrls.add(entry.pdfUrl);
                                        totalPdfLinks++;
                                    }
                                });
                            }
                            
                            console.log('🎯 PRODUCTION RESULTS:');
                            console.log(`   Case Number: ${firstCase.caseNumber}`);
                            console.log(`   Filing Number: ${firstCase.filingNumber}`);
                            console.log(`   Status: ${firstCase.status}`);
                            console.log(`   Listing History Entries: ${firstCase.listingHistory?.length || 0}`);
                            console.log(`   📄 Total PDF Links Extracted: ${totalPdfLinks}`);
                            
                            if (totalPdfLinks === 34) {
                                console.log('🎉 SUCCESS! Production extracts same 34 PDFs as local test!');
                            } else {
                                console.log(`⚠️  PDF count differs: Production=${totalPdfLinks}, Local=34`);
                            }
                            
                            // Show first few PDF URLs
                            if (totalPdfLinks > 0) {
                                console.log('🔗 First 3 PDF URLs from production:');
                                const pdfUrls = Array.from(seenUrls);
                                pdfUrls.slice(0, 3).forEach((url, index) => {
                                    console.log(`   ${index + 1}. ${url}`);
                                });
                            }
                        }
                    } else {
                        console.log('❌ Production function returned no results');
                        console.log('Response:', result);
                    }
                    
                    resolve(result);
                    
                } catch (error) {
                    console.error('❌ Error parsing production response:', error.message);
                    console.log('Raw response:', data);
                    reject(error);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('❌ Production function request failed:', error.message);
            reject(error);
        });
        
        req.on('timeout', () => {
            console.error('❌ Production function timed out (10 minutes)');
            req.destroy();
            reject(new Error('Function timeout'));
        });
        
        req.write(postData);
        req.end();
    });
}

// Run the production test
if (require.main === module) {
    testProductionNCLTFunction()
        .then(() => {
            console.log('✅ Production test completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Production test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testProductionNCLTFunction };
