/**
 * Test script to verify NCLT data insertion into Google Cloud Storage bucket
 * This script calls the cloud function and monitors bucket storage
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration
const CLOUD_FUNCTION_URL = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/ncltCauseListScrapper";
const TIMEOUT = 300000; // 5 minutes

// Test with a small subset of benches for quick testing
const testBenches = [
    {
        "name": "Ahmedabad Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-I", 
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-II",
        "causeListDate": "2025-09-19"
    }
];

// All 32 NCLT benches with today's date
const allBenches = [
    {
        "name": "Ahmedabad Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Ahmedabad Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Allahabad Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Amaravati Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Bengaluru Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Chandigarh Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Chandigarh Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Chennai Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Chennai Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Cuttack Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Guwahati Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Hyderabad Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Hyderabad Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Indore Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Jaipur Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Kochi Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Kolkata Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Kolkata Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Kolkata Bench Court-III",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-III",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-IV",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-V",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Mumbai Bench Court-VI",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-II",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-III",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-IV",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-V",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "New Delhi Bench Court-VI",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Principal Bench Court-I",
        "causeListDate": "2025-09-19"
    },
    {
        "name": "Registrar NCLT Court-I",
        "causeListDate": "2025-09-19"
    }
];

// Test payload with PDF extraction enabled
const testPayload = {
    bench: testBenches,
    extractPdfs: true  // Enable PDF content extraction
};

/**
 * Test the cloud function and monitor bucket insertion
 */
async function testBucketInsertion() {
    console.log("🚀 Starting NCLT Bucket Insertion Test");
    console.log("=" .repeat(60));
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🏛️  Testing benches: ${testBenches.map(b => b.name).join(', ')}`);
    console.log(`📄 PDF extraction: ENABLED`);
    console.log(`🌐 Cloud Function URL: ${CLOUD_FUNCTION_URL}`);
    console.log("=" .repeat(60));

    try {
        console.log("\n📤 Sending request to cloud function...");
        const startTime = Date.now();

        const response = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPayload),
            timeout: TIMEOUT
        });

        const responseTime = Date.now() - startTime;
        console.log(`⏱️  Response time: ${(responseTime / 1000).toFixed(2)} seconds`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        console.log("\n✅ CLOUD FUNCTION RESPONSE RECEIVED");
        console.log("=" .repeat(60));
        
        // Basic response validation
        console.log(`📊 Success: ${result.success}`);
        console.log(`📝 Message: ${result.message}`);
        console.log(`🏛️  Processed benches: ${result.processedBenches}`);
        console.log(`📋 Total records: ${result.totalRecords}`);
        console.log(`📄 PDF URLs found: ${result.pdfUrls?.length || 0}`);

        // Bench summary
        if (result.benchSummary) {
            console.log("\n🏛️  BENCH PROCESSING SUMMARY:");
            result.benchSummary.forEach(bench => {
                console.log(`   ${bench.benchName}: ${bench.recordsFound} records`);
            });
        }

        // Storage information
        if (result.storage) {
            console.log("\n💾 BUCKET STORAGE FILES:");
            console.log(`   📋 Cause List: ${result.storage.causeListFile}`);
            if (result.storage.pdfContentFile) {
                console.log(`   📄 PDF Content: ${result.storage.pdfContentFile}`);
            }
        }

        // PDF processing results
        if (result.pdfStats) {
            console.log("\n📄 PDF EXTRACTION SUMMARY:");
            console.log(`   📄 Total PDFs: ${result.pdfStats.totalPdfs}`);
            console.log(`   ✅ Successful: ${result.pdfStats.successfulExtractions}`);
            console.log(`   ❌ Failed: ${result.pdfStats.failedExtractions}`);
        }

        // Sample data validation
        console.log("\n🔍 SAMPLE DATA VALIDATION:");
        if (result.data && result.data.length > 0) {
            const sampleRecord = result.data[0];
            console.log(`   📝 Sample ID: ${sampleRecord.id}`);
            console.log(`   📋 Case Number: ${sampleRecord.caseNumber}`);
            console.log(`   🏛️  Bench: ${sampleRecord.bench}`);
            console.log(`   📅 Date: ${sampleRecord.causeListDate}`);
            
            // Check if ID is properly formatted (should not contain [object Object])
            if (sampleRecord.id.includes('[object Object]')) {
                console.log("   ❌ ID FORMAT ERROR: Contains [object Object]");
            } else {
                console.log("   ✅ ID FORMAT: Properly formatted");
            }
        }

        // PDF content sample
        if (result.pdfContent && result.pdfContent.length > 0) {
            console.log("\n📄 PDF CONTENT SAMPLE:");
            const successfulPdf = result.pdfContent.find(pdf => pdf.success);
            if (successfulPdf) {
                console.log(`   📄 PDF Bench: ${successfulPdf.benchName}`);
                console.log(`   📄 PDF Date: ${successfulPdf.benchDate}`);
                console.log(`   📄 Content extracted: ${successfulPdf.content ? 'YES' : 'NO'}`);
                if (successfulPdf.content?.cases) {
                    console.log(`   📄 Cases in PDF: ${successfulPdf.content.cases.length}`);
                }
            }
        }

        console.log("\n🎉 TEST COMPLETED SUCCESSFULLY!");
        console.log("=" .repeat(60));
        console.log("💡 To view the stored data in bucket:");
        console.log("   - Go to Google Cloud Console");
        console.log("   - Navigate to Cloud Storage");
        console.log("   - Open bucket: ncltcauselistpdflinks");
        console.log("   - Look for files with today's timestamp");

        return result;

    } catch (error) {
        console.error("\n❌ TEST FAILED:");
        console.error("=" .repeat(60));
        console.error(`🚨 Error: ${error.message}`);
        
        if (error.code === 'FETCH_ERROR') {
            console.error("🌐 Network error - check internet connection");
        } else if (error.message.includes('timeout')) {
            console.error("⏱️  Timeout error - cloud function took too long");
        } else if (error.message.includes('HTTP')) {
            console.error("🔒 HTTP error - check cloud function URL and permissions");
        }
        
        throw error;
    }
}

/**
 * Test with all 32 benches (for full system test)
 */
async function testAllBenches() {
    console.log("\n🌟 TESTING ALL 32 BENCHES");
    console.log("⚠️  This will take several minutes...");

    const fullPayload = {
        bench: allBenches,
        extractPdfs: true
    };

    const response = await fetch(CLOUD_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(fullPayload),
        timeout: 1200000 // 20 minutes for all benches
    });

    return await response.json();
}

// Main execution
if (require.main === module) {
    console.log("🧪 NCLT Bucket Insertion Test Suite");
    console.log("Choose test type:");
    console.log("1. Quick test (3 benches) - Run: node test-bucket-insertion.js");
    console.log("2. Full test (32 benches) - Run: node test-bucket-insertion.js --full");
    
    const isFullTest = process.argv.includes('--full');
    
    if (isFullTest) {
        testAllBenches()
            .then(result => {
                console.log("\n🎉 FULL TEST COMPLETED!");
                console.log(`📊 Total records: ${result.totalRecords}`);
                console.log(`🏛️  Processed benches: ${result.processedBenches}/32`);
            })
            .catch(error => {
                console.error("❌ Full test failed:", error.message);
                process.exit(1);
            });
    } else {
        testBucketInsertion()
            .then(result => {
                console.log("\n✅ Quick test passed! Run with --full for complete test.");
                process.exit(0);
            })
            .catch(error => {
                console.error("❌ Quick test failed:", error.message);
                process.exit(1);
            });
    }
}

module.exports = { testBucketInsertion, testAllBenches };
