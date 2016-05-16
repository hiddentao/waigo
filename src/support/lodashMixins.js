"use strict";

const genomatic = require('genomatic');


module.exports = function(_) {
  _.mixin({
    bindGen: genomatic.bind,
    isGenFn: genomatic.isGenFn,
    classnames: require('classnames'),
    pluralize: require('pluralize'),
    uuid: require('node-uuid'),
    /**
     * Format user name for display within email.
     *
     * TODO: This method is confusing - clean it up!
     * 
     * @param  {String} type How to format.
     * @param  {User|String} obj  The user object or username string.
     * @return {*}
     */
    emailFormat: function(type, obj) {
     switch (type) {
       case 'greet':
         var name = _.get(obj, 'profile.displayName') || _.get(obj, 'username', '');

         return name.length ? name : 'Hey';
         break;
     }

     return obj; 
    }
  });
};
