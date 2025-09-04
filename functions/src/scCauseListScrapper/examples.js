// const { fetchSupremeCourtCauseList } = require('./scCauseListScrapper');

// /**
//  * Example 1: Basic daily cause list for all courts
//  */
// const exampleBasicDaily = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'all_courts',
//     causelistType: 'Misc. Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Basic daily results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in basic daily example:', error);
//   }
// };

// /**
//  * Example 2: Search by specific court number
//  */
// const exampleByCourt = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'court',
//     court: '1', // Court number 1
//     causelistType: 'Regular Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'both'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Court-specific results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in court example:', error);
//   }
// };

// /**
//  * Example 3: Search by specific judge
//  */
// const exampleByJudge = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'judge',
//     judge: '270', // HON'BLE THE CHIEF JUSTICE
//     causelistType: 'Misc. Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Judge-specific results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in judge example:', error);
//   }
// };

// /**
//  * Example 4: Search by AOR code
//  */
// const exampleByAOR = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'aor_code',
//     aorCode: '12345', // Example AOR code
//     causelistType: 'Misc. Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('AOR-specific results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in AOR example:', error);
//   }
// };

// /**
//  * Example 5: Search by party name
//  */
// const exampleByParty = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'party_name',
//     partyName: 'State of Maharashtra', // Example party name
//     causelistType: 'Misc. Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Party-specific results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in party example:', error);
//   }
// };

// /**
//  * Example 6: Other lists (advance, weekly, etc.)
//  */
// const exampleOtherLists = async () => {
//   const formData = {
//     listType: 'other',
//     searchBy: 'all_courts',
//     causelistType: 'Advance Elimination List',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Other list results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in other list example:', error);
//   }
// };

// /**
//  * Example 7: Date range search (if supported)
//  */
// const exampleDateRange = async () => {
//   const formData = {
//     listType: 'other',
//     searchBy: 'all_courts',
//     causelistType: 'Weekly',
//     listingDateFrom: '28-08-2025',
//     listingDateTo: '03-09-2025',
//     mainAndSupplementry: 'both'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Date range results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in date range example:', error);
//   }
// };

// /**
//  * Example 8: Chamber court specific
//  */
// const exampleChamberCourt = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'all_courts',
//     causelistType: 'Chamber Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'both'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Chamber court results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in chamber court example:', error);
//   }
// };

// /**
//  * Example 9: Single judge court
//  */
// const exampleSingleJudge = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'all_courts',
//     causelistType: 'Single Judge Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'main'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Single judge results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in single judge example:', error);
//   }
// };

// /**
//  * Example 10: Registrar court
//  */
// const exampleRegistrarCourt = async () => {
//   const formData = {
//     listType: 'daily',
//     searchBy: 'all_courts',
//     causelistType: 'Registrar Court',
//     listingDate: '28-08-2025',
//     mainAndSupplementry: 'both'
//   };
  
//   try {
//     const results = await fetchSupremeCourtCauseList(formData);
//     console.log('Registrar court results:', results);
//     return results;
//   } catch (error) {
//     console.error('Error in registrar court example:', error);
//   }
// };

// /**
//  * Run all examples
//  */
// const runAllExamples = async () => {
//   console.log('=== Running All Examples ===');
  
//   await exampleBasicDaily();
//   await exampleByCourt();
//   await exampleByJudge();
//   await exampleByAOR();
//   await exampleByParty();
//   await exampleOtherLists();
//   await exampleDateRange();
//   await exampleChamberCourt();
//   await exampleSingleJudge();
//   await exampleRegistrarCourt();
  
//   console.log('=== All Examples Completed ===');
// };

// module.exports = {
//   exampleBasicDaily,
//   exampleByCourt,
//   exampleByJudge,
//   exampleByAOR,
//   exampleByParty,
//   exampleOtherLists,
//   exampleDateRange,
//   exampleChamberCourt,
//   exampleSingleJudge,
//   exampleRegistrarCourt,
//   runAllExamples
// };
