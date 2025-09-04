/**
 * Transform extracted data to include required fields for new database schema
 * @param {Array} rows - Raw extracted data
 * @param {string} listType - Type of list
 * @param {string} listingDate - Date for listing
 * @returns {Array} - Transformed data with required fields
 */

let mainAndSupplementry = "Main";

const transformData = (rows, formData) => {
  console.log('[debug] [dataTransformer] Starting data transformation...');
  // Filter out non-case rows (headers, section dividers, IA rows, etc.)
  const filteredRows = rows.filter(row => {
    const serialNumber = row["Serial Number"];
    
    // Only include rows with numeric serial numbers (actual cases)
    // Exclude: headers, section dividers, IA rows, connected cases, etc.
    if (!serialNumber) return false;
    
    // Check if serial number is a simple number (1, 2, 3, etc.)
    const isNumericSerial = /^\d+$/.test(serialNumber.trim());

    if(serialNumber === "SUPPLEMENTARY LIST") return true;
    
    return isNumericSerial;
  });
  
  console.log(`[debug] [dataTransformer] Filtered ${rows.length} total rows down to ${filteredRows.length} case rows`);
  
  let isSupplementarySection = false;
  
  const transformedRows = filteredRows.map((row, index) => {
    // Check if this row is the "SUPPLEMENTARY LIST" marker
    if (row["Serial Number"] === "SUPPLEMENTARY LIST") {
      isSupplementarySection = true;
      return null;
    }
    
    const currentMainAndSupplementry = isSupplementarySection ? "Supplementary" : "Main";
    
    const fullCaseNumber = row["Case Number"] || "";
    let diaryNumber = "";
    let extractedCaseNumber = fullCaseNumber; // fallback to full case number
    
    if (fullCaseNumber.substring(0, 5) === "Diary") {
      const diaryMatch = fullCaseNumber.match(/Diary No\.\s*(\d+)-(\d+)/);
      if (diaryMatch) {
        diaryNumber = diaryMatch[1] + "/" + diaryMatch[2];
      }
      
    } else {
      const caseNumberParts = fullCaseNumber.split("/");
      if (caseNumberParts.length >= 2 && caseNumberParts[0] && caseNumberParts[1]) {
        const numberMatch = caseNumberParts[0].match(/(\d+)$/);
        if (numberMatch) {
          const caseNum = numberMatch[1];
          const paddedCaseNum = caseNum.padStart(6, '0'); // Pad to 6 digits
          const yearMatch = caseNumberParts[1].match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : caseNumberParts[1].trim();
          extractedCaseNumber = caseNumberParts[0].replace(/No\.\s*/, "No.-").replace(/\d+$/, paddedCaseNum) + " - " + year;
        }
      }
    }
    
    const transformed = {
      // Add missing required fields
      "serialNumber": row["Serial Number"],
      "diaryNumber": diaryNumber,
      "fullCaseNumber": row["Case Number"],
      "caseNumber": extractedCaseNumber,
      "parties": row["Petitioner / Respondent"],
      "advocates": row["Petitioner/Respondent Advocate"],
      "court": "Supreme Court",
      "courtNo": formData.court,
      "judge": formData.judge,
      "aorCode": formData.aorCode,
      "partyName": formData.partyName,
      "searchBy": formData.searchBy,
      "causelistType": formData.causelistType,
      "mainAndSupplementry": currentMainAndSupplementry,
      "ListType": formData.listType,
      "date": formData.listingDate
    };
    return transformed;
  }).filter(row => row !== null); // Remove null entries (the SUPPLEMENTARY LIST marker)
  
  console.log(`[debug] [dataTransformer] Data transformation completed, returning ${transformedRows.length} case rows`);
  return transformedRows;
};

module.exports = {
  transformData
};
