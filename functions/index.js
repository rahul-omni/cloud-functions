// const { scrapeSupremeCourtCases:scrapeSupremeCourtCasesAPI } = require("./src/supremeCourtScrapper/index.js");
const { processNotifications } = require("./src/notification/index.js");
const { scrapeCases:cronForScraperService} = require("./src/scraperService/index.js");
const { createCaseAndNotify } = require("./src/createCaseAndNotify/index.js");
const { testFunction } = require("./src/testFunction/index.js");
const { fetchHighCourtJudgments } = require("./src/highCourtScrapper/highCourtScrapper.js");

module.exports = {
  // scrapeSupremeCourtCasesAPI,
  processNotifications,
  cronForScraperService,
  createCaseAndNotify,
  testFunction,
  fetchHighCourtJudgments
};
