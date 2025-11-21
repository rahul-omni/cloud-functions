

// D:\cloud\cloud-functions\functions\src\districtEastDelhiCourtScrapper\test.js
const fetch = require('node-fetch');

async function testCloudFunction() {
    const url = "https://asia-south1-booming-order-465208-t8.cloudfunctions.net/fetchEastDelhiDistrictJudgments";
    
    const payload1 = {
        diaryNumber:  "212/2022",       //   "10/2022" "4/2025",
        courtName: "East District Court, Delhi",  // CHANGED THIS
        courtComplex: "Karkardooma Court Complex",
        caseTypeValue: "CR Cases",
        court: "District Court"
    };
   //TM / 931 / 2016 Cr. Case / 43 / 2025  RC ARC / 72 / 2024
     const payload = {
        diaryNumber:  "122/2025",      
        courtName:  "Central District Court, Delhi",
        courtComplex: "Tis Hazari Court Complex",
        caseTypeValue: "RC ARC",
        court: "District Court"
    };

    try {
        console.log('Testing Cloud Function...');
        console.log('URL:', url);
        console.log('Payload:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        console.log('\n=== RESPONSE ===');
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        console.log('OK:', response.ok);
        
        const text = await response.text();
        console.log('Response Body:', text);
        
        try {
            const jsonResponse = JSON.parse(text);
            console.log('Parsed JSON:', JSON.stringify(jsonResponse, null, 2));
        } catch (e) {
            console.log('Response is not JSON');
        }
        
    } catch (error) {
        console.error('\n=== ERROR ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
    }
}

testCloudFunction();