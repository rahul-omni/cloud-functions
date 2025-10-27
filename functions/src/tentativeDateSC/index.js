const functions = require("firebase-functions");
const regionFunctions = functions.region('asia-south1');
const { tentativeDateScrapper } = require('./tentativeDateScrapper');
const { getSubscribedCases, updateUserCase } = require('./components/db');
const { Storage } = require('@google-cloud/storage');

const caseTypeMapping = {
  "SPECIAL LEAVE PETITION (CIVIL)": '1',
  "SPECIAL LEAVE PETITION (CRIMINAL)": '2',
  "CIVIL APPEAL": '3',
  "CRIMINAL APPEAL": '4',
  "WRIT PETITION (CIVIL)": '5',
  "WRIT PETITION(CRIMINAL)": '6',
  "TRANSFER PETITION (CIVIL)": '7',
  "TRANSFER PETITION (CRIMINAL)": '8',
  "REVIEW PETITION (CIVIL)": '9',
  "REVIEW PETITION (CRIMINAL)": '10',
  "TRANSFERRED CASE (CIVIL)": '11',
  "TRANSFERRED CASE (CRIMINAL)": '12',
  "SPECIAL LEAVE TO PETITION (CIVIL)...": '13',
  "SPECIAL LEAVE TO PETITION (CRIMINAL)...": '14',
  "WRIT TO PETITION (CIVIL)...": '15',
  "WRIT TO PETITION (CRIMINAL)...": '16',
  "ORIGINAL SUIT": '17',
  "DEATH REFERENCE CASE": '18',
  "CONTEMPT PETITION (CIVIL)": '19',
  "CONTEMPT PETITION (CRIMINAL)": '20',
  "TAX REFERENCE CASE": '21',
  "SPECIAL REFERENCE CASE": '22',
  "ELECTION PETITION (CIVIL)": '23',
  "ARBITRATION PETITION": '24',
  "CURATIVE PETITION(CIVIL)": '25',
  "CURATIVE PETITION(CRL)": '26',
  "REF. U/A 317(1)": '27',
  "MOTION(CRL)": '28',
  "DIARYNO AND DIARYYR": '31',
  "SUO MOTO WRIT PETITION(CIVIL)": '32',
  "SUO MOTO WRIT PETITION(CRIMINAL)": '33',
  "SUO MOTO CONTEMPT PETITION(CIVIL)": '34',
  "SUO MOTO CONTEMPT PETITION(CRIMINAL)": '35',
  "REF. U/S 14 RTI": '37',
  "REF. U/S 17 RTI": '38',
  "MISCELLANEOUS APPLICATION": '39',
  "SUO MOTO TRANSFER PETITION(CIVIL)": '40',
  "SUO MOTO TRANSFER PETITION(CRIMINAL)": '41',
  "Unknown": '9999'
}

const caseTypeReverseMapping = {
  "SLP(C)": "SPECIAL LEAVE PETITION (CIVIL)",
  "SLP(Crl)": "SPECIAL LEAVE PETITION (CRIMINAL)",
  "C.A.": "CIVIL APPEAL",
  "Crl.A.": "CRIMINAL APPEAL",
  "W.P.(C)": "WRIT PETITION (CIVIL)",
  "W.P.(Crl)": "WRIT PETITION (CRIMINAL)",
  "T.P.(C)": "TRANSFER PETITION (CIVIL)",
  "T.P.(Crl)": "TRANSFER PETITION (CRIMINAL)",
  "R.P.(C)": "REVIEW PETITION (CIVIL)",
  "R.P.(Crl)": "REVIEW PETITION (CRIMINAL)",
  "T.C.(C)": "TRANSFERRED CASE (CIVIL)",
  "T.C.(Crl)": "TRANSFERRED CASE (CRIMINAL)",
  "SLPTO(C)": "SPECIAL LEAVE TO PETITION (CIVIL)...",
  "SLPTO(Crl)": "SPECIAL LEAVE TO PETITION (CRIMINAL)...",
  "WTP(C)": "WRIT TO PETITION (CIVIL)...",
  "WTP(Crl)": "WRIT TO PETITION (CRIMINAL)...",
  "O.S.": "ORIGINAL SUIT",
  "D.R.C.": "DEATH REFERENCE CASE",
  "C.P.(C)": "CONTEMPT PETITION (CIVIL)",
  "C.P.(Crl)": "CONTEMPT PETITION (CRIMINAL)",
  "T.R.C.": "TAX REFERENCE CASE",
  "S.R.C.": "SPECIAL REFERENCE CASE",
  "E.P.(C)": "ELECTION PETITION (CIVIL)",
  "A.P.": "ARBITRATION PETITION",
  "C.P.(C)": "CURATIVE PETITION (CIVIL)",
  "C.P.(Crl)": "CURATIVE PETITION (CRIMINAL)",
  "Ref.317(1)": "REF. U/A 317(1)",
  "Motion(Crl)": "MOTION (CRIMINAL)",
  "Diary": "DIARYNO AND DIARYYR",
  "SMWP(C)": "SUO MOTO WRIT PETITION (CIVIL)",
  "SMWP(Crl)": "SUO MOTO WRIT PETITION (CRIMINAL)",
  "SMCP(C)": "SUO MOTO CONTEMPT PETITION (CIVIL)",
  "SMCP(Crl)": "SUO MOTO CONTEMPT PETITION (CRIMINAL)",
  "Ref.14(RTI)": "REF. U/S 14 RTI",
  "Ref.17(RTI)": "REF. U/S 17 RTI",
  "M.A.": "MISCELLANEOUS APPLICATION",
  "SMTP(C)": "SUO MOTO TRANSFER PETITION (CIVIL)",
  "SMTP(Crl)": "SUO MOTO TRANSFER PETITION (CRIMINAL)",
  "UNK": "Unknown"
}

// Create storage client
const storage = new Storage();
const bucketName = "causelistpdflinks"; // 🔹 Replace with your bucket name

// Runtime options for the function
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB',
};

/**
 * HTTP Cloud Function for scraping Supreme Court cases
 */
exports.tentativeDateSC = regionFunctions.runWith(runtimeOpts).https
  .onRequest(async (req, res) => {

    try {
      // Create form data object for the new flexible structure

      const subscribedCases = await getSubscribedCases();
      console.log(`[info] [scCauseListScrapper] Retrieved ${subscribedCases.length} subscribed cases from DB.`);

      for (const row of subscribedCases) {
        try {
          console.log(`[info] [tentativeDateSC] Processing case ID ${row.id}, Case Number: ${row.case_number}, Diary Number: ${row.diary_number}, ${(row.case_number.split("No")[0]).trim()}`);

          const case_type = caseTypeMapping[caseTypeReverseMapping[(row.case_number.split("No")[0]).trim()]] || 9999;
          const case_no = row.diary_number.split('/')[0];
          const case_year = row.diary_number.split('/')[1];

          const formData = {
            caseType: case_type,
            caseNo: case_no,
            caseYear: case_year,
          };

          const tentativeDate = await tentativeDateScrapper(formData);

          if (tentativeDate) {
            await updateUserCase(row.id, tentativeDate);
            console.log(`[info] [tentativeDateSC] Updated case ID ${row.id} with tentative date ${tentativeDate}.`);
          }
        } catch (error) {
          console.error(`[error] [tentativeDateSC] Failed to process case ID ${row.id}, Case Number: ${row.case_number}. Error: ${error.message}`);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Cron job completed successfully"
      });

    } catch (error) {
      console.error('[error] [scCauseListScrapper] Error during scraping service: ', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      console.log("[end] [scCauseListScrapper] scraper service ended at:", new Date().toISOString());
    }
  });
