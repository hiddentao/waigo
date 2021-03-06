"use strict";

const waigo = global.waigo,
  _ = waigo._;


/**
 * Setup action tokens interface and request processor.
 *
 * @param {Object} App The application.
 */
module.exports = function*(App) {
  App.logger.debug('Setting up action tokens system');

  let mod = waigo.load('support/actionTokens');

  App.actionTokens = yield mod.init(
    App, App.config.actionTokens
  );
};







