"use strict";

/**
 * @fileOverview Setup current user on request context.
 */


const waigo = global.waigo,
  _ = waigo._;



/**
 * Build middleware for setting up `currentUser` on context.
 * 
 * @return {Function} middleware
 */
module.exports = function() {
  return function*(next) {
    if (this.session.user) {
      this.App.logger.debug('Current user', this.session.user);

      this.currentUser =  
        yield this.App.models.User.get(this.session.user.id);
    }

    yield next;
  }
};
