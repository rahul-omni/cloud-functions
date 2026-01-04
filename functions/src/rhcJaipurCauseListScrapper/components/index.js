// Export all components for easy importing
const browserManager = require('./browserManager');
const formHandler = require('./formHandler');
const dataExtractor = require('./dataExtractor');
const utils = require('./utils');
const storage = require('./storage');
const db = require('./db');

module.exports = {
  ...browserManager,
  ...formHandler,
  ...dataExtractor,
  ...utils,
  ...storage,
  ...db
};

