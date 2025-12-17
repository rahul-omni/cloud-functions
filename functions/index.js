// const { scrapeSupremeCourtCases:scrapeSupremeCourtCasesAPI } = require("./src/supremeCourtScrapper/index.js");
const { processNotifications } = require("./src/notification/index.js");
const { scrapeCases:cronForScraperService} = require("./src/scraperService/index.js");
const { createCaseAndNotify } = require("./src/createCaseAndNotify/index.js");
const { testFunction } = require("./src/testFunction/index.js");
const { fetchHighCourtJudgments } = require("./src/highCourtScrapper/index.js");
const { fetchDistrictCourtJudgments } = require("./src/districtCourtScrapper/index.js");
const { supremeCourtOTF } = require("./src/supremeCourtScrapper/index.js");
const { scCauseListScrapper } = require("./src/scCauseListScrapper/index.js");
const { hcCauseListScrapper } = require("./src/hcCauseListScrapper/index.js");
const { cronForSCCauseList } = require("./src/services/CronServiceCauseList.js");
const {tentativeDateSC} = require("./src/tentativeDateSC/index.js");
const { highCourtCasesUpsert } = require("./src/highCourtCasesUpsert/index.js");
const {districtEastDelhiCourtScrapper} = require("./src/districtEastDelhiCourtScrapper/index.js");
const {supremeCourtCasesUpsert} = require("./src/supremeCourtCasesUpsert/index.js");

module.exports = {
  // scrapeSupremeCourtCasesAPI,
  processNotifications,
  cronForScraperService,
  createCaseAndNotify,
  testFunction,
  fetchHighCourtJudgments,
  fetchDistrictCourtJudgments,
  supremeCourtOTF,
  scCauseListScrapper,
  cronForSCCauseList,
  hcCauseListScrapper,
  tentativeDateSC,
  highCourtCasesUpsert,
  districtEastDelhiCourtScrapper,
  supremeCourtCasesUpsert
};
