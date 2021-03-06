"use strict";

const _ = require('lodash'),
  co = require('co'),
  path = require('path'),
  Q = require('bluebird');


const test = require(path.join(process.cwd(), 'test', '_base'))(module);
const waigo = global.waigo;



test['text field'] = function*() {
  yield this.initApp();

  waigo.load('support/forms/fields/text').should.eql(
    waigo.load('support/forms/field').Field
  );
};
