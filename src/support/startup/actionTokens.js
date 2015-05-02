"use strict";

var debug = require('debug')('waigo-startup-activities'),
  crypto = require('crypto');

var waigo = require('../../../'),
  _ = waigo._,
  RuntimeError = waigo.load('support/errors').RuntimeError;



var _throw = function(msg, status, data) {
  throw new RuntimeError(msg, status, data);
};



/**
 * Setup action tokens interface and request processor.
 *
 * @param {Object} app The application.
 */
module.exports = function*(app) {
  var logger = app.logger.create('ActionTokens');

  app.actionTokens = {};


  /**
   * Create a token representing the given action.
   *
   * This returns an `object` with keys;
   *
   * `url` - absolute URL for executing this action
   * `c` - the token from the url query string which represents the action, in case 
   * you wish to add it to a custom URL.
   * 
   * @param {String} type email action type.
   * @param {User} user User this action is for. 
   * @param {Object} data Additional data to associate with this action (must be JSON-stringify-able)
   * @param {Object} [options] Additional options.
   * @param {Number} [options.validForHours] Override default `validForHours` settings with this.
   *
   * @return {String} the action token. 
   */
  app.actionTokens.create = function*(type, user, data, options) {
    options = _.extend({
      validForHours: app.config.actionTokens.validForHours
    }, options);

    logger.debug('Creating action token: ' + type + ' for user ' + user._id, data);

    // every token is uniquely identied by a salt (this is also doubles up as  
    // a factor for more secure encryption)
    var salt = _.str.uuid.v4();

    var plaintext = JSON.stringify([ 
      Date.now() + (options.validForHours * 1000 * 60 * 60), 
      salt, 
      type, 
      user._id, 
      data 
    ]);

    var cipher = crypto.createCipher(
      'aes256', app.config.actionTokens.encryptionKey
    );

    return cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
  };



  /** 
   * Process the given action token.
   *
   * Note: A given token can only be processed once.
   * 
   * @param {String} token the token to process.
   * @param {Object} [options] Additional options.
   * @param {String} [options.type] Expected token type.
   * 
   * @param {String} expectedType   
   */
  app.actionTokens.process = function*(token, options) {
    options = _.extend({}, options);

    logger.debug('Processing action token', token);

    var json = null;

    try {
      var decipher = crypto.createDeciper(
        'aes256', app.config.actionTokens.encryptionKey
      );

      var plaintext = decipher.update(token, 'hex', 'utf8') 
        + decipher.final('utf8');

      var json = JSON.parse(plaintext);
    } catch (err) {
      _throw('Error parsing action token', null, {
        error: err.stack
      });
    }

    var ts = json[0],
      salt = json[1],
      type = json[2],
      userId = json[3],
      data = json[4];

    var mod = app.actionTokens.modules[type];

    if (!mod) {
      _throw('Unrecognized action token type: ' + type);
    }

    if (options.type && type !== options.type) {
      _throw('Action token type mismatch' + type);
    }

    // check if action still valid
    if (Date.now() > ts) {
      _throw('This action token has expired.');
    }

    var user = yield app.models.User.findOne({
      _id: userId
    });

    if (!user) {
      _throw('Unable to find user information related to action token');
    }

    // check if we've already executed this request before
    var activity = yield app.models.Activity.findOne({
      'details.salt': salt
    });

    if (activity) {
      _throw('This action token has already been processed and is no longer valid.');
    }

    // record activity
    yield app.record('action_token', user, {
      type: type,
      salt: salt,
      ip: req.ips,
    });

    logger.debug('Action token processed for ' + user._id, type);

    // return data
    return {
      type: type,
      user: user,
      data: data,
    };
  };
};







