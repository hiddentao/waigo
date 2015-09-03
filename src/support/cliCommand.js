"use strict";


var debug = require('debug')('waigo-cli'),
  path = require('path'),
  Q = require('bluebird'),
  shell = require('shelljs');


var waigo = global.waigo,
  _ = waigo._;


shell.execAsync = Q.promisify(shell.exec, shell);



/**
 * Abstract base class for command-line tool commands.
 *
 * This gets used the command-line executable and is not really meant for 
 * use within your web application.
 *
 * @param  {String} description Description of what it does.
 * @param  {Array} options Command options.
 */
var AbstractCommand = module.exports = function(description, options) {
  this.description = description;
  this.options = options || [];
};




/** 
 * Run this command.
 *
 * This function gets passed to [Commander.action](http://visionmedia.github.io/commander.js/#Command.prototype.action) as the command handler.
 */
AbstractCommand.prototype.run = function*() {
  throw new Error('Not yet implemented');
};  





/** 
 * Show the user a message.
 *
 * @param {String} msg The log message to write.
 */
AbstractCommand.prototype.log = function(msg) {
  console.log('[waigo-cli] ' + msg);
};  





/** 
 * Copy a folder to given destination if it doesn't already exist at that destination.
 *
 * This checks to see if a folder with the same name exists at the 
 * destination. It doesn't check that it contains the same content as the 
 * source folder.
 *
 * @param {String} src Source folder path.
 * @param {String} dst Destination folder path.
 */
AbstractCommand.prototype.copyFolder = function*(src, dst) {
  var fullDstPath = path.join(this._getProjectFolder(), dst);

  if (! (shell.test('-f', fullDstPath)) ) {
    this.log('Creating: ' + dst);

    // create intermediate folders
    debug('Creating intermediate folders for: ' + dst);
    shell.mkdir('-p', path.dirname(fullDstPath));

    debug('Copying ' + src + ' -> ' + dst);

    shell.cp('-R', src, fullDstPath);
  } else {
    this.log('Found: ' + dst);
  }  
};  






/** 
 * Copy a file to given destination if it doesn't already exist at that destination.
 *
 * This checks to see if a file with the same name exists at the 
 * destination. It doesn't check that it contains the same content as the 
 * source file.
 *
 * @param {String} src Source file path.
 * @param {String} dst Destination file path.
 * @param {Boolean} [overwrite] Whether to overwrite if already exists. Default is `false`.
 */
AbstractCommand.prototype.copyFile = function*(src, dst, overwrite) {
  var fullDstPath = path.join(this._getProjectFolder(), dst);

  var fileExistsAlready = !!shell.test('-f', fullDstPath);

  if ( !fileExistsAlready || overwrite ) {
    if (fileExistsAlready) {
      this.log('Overwriting: ' + dst);
    } else {
      this.log('Creating: ' + dst);      
    }

    // create intermediate folders
    debug('Creating intermediate folders for: ' + dst);
    shell.mkdir('-p', path.dirname(fullDstPath));

    debug('Copying ' + src + ' -> ' + dst);
    shell.cp(src, fullDstPath);
  } else {
    this.log('Found: ' + dst);
  }  
};  




/** 
 * Delete file at given destination if it exists.
 *
 * @param {String} dst Destination file path.
 */
AbstractCommand.prototype.deleteFile = function*(dst) {
  var fullDstPath = path.join(this._getProjectFolder(), dst);

  this.log('Deleting: ' + dst);
  
  shell.rm(fullDstPath);
};  




/** 
 * Install one or more NPM packages into the local NPM modules folder.
 *
 * If a package is already present then it does not get installed again.
 * 
 * _Note: This does not modify the local package.json (if it exists)._
 *
 * @param {Array} pkgs NPM package names.
 * @param {Object} [options] Options.
 * @param {Boolean} [options.dev] Whether to save as dev-dependency.
 */
AbstractCommand.prototype.installPkgs = function*(pkgs, options) {
  options = _.extend({
    dev: false,
  }, options);

  var str = pkgs.join(' ');

  if (options.dev) {
    str = '--save-dev ' + str;
  } else {
    str = '---save ' + str;
  }

  this.log('NPM install ' + str);

  yield shell.execAsync('npm install ' + str);    
};  




/** 
 * Find location of NPM node modules folder.
 *
 * @return {String} location if found, null otherwise.
 *
 * @private
 */
AbstractCommand.prototype._getNpmFolderLocation = function() {
  // we're going to assume that the CLI is always run in the root folder
  // of the project, where node_moduels also resides

  var npmFolder = path.join(this._getProjectFolder(), 'node_modules');

  if (shell.test('-d', npmFolder)) {
    return npmFolder;
  } else {
    return null;
  }
};  





/** 
 * Get project folder.
 * 
 * @return {String} folder for current app we're working on.
 * 
 * @protected
 */
AbstractCommand.prototype._getProjectFolder = function() {
  return process.cwd();
};





