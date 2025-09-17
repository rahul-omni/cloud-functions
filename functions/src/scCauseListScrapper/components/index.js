// Export all components for easy importing
const captchaSolver = require('./captchaSolver');
const browserManager = require('./browserManager');
const formHandler = require('./formHandler');
const dataExtractor = require('./dataExtractor');
const dataTransformer = require('./dataTransformer');
const utils = require('./utils');
const db = require('./db');

module.exports = {
  ...captchaSolver,
  ...browserManager,
  ...formHandler,
  ...dataExtractor,
  ...dataTransformer,
  ...utils,
  ...db
};
