

const _ = require('lodash'),
  co = require('co'),
  path = require('path'),
  moment = require('moment'),
  Q = require('bluebird')const test = require(path.join(process.cwd(), 'test', '_base'))(module)const waigo = global.waigovar outputFormats = null,
  ctx = nulltest['output formats'] = {
  beforeEach: function *() {
    this.createAppModules({
      'support/outputFormats/html2': 'module.exports = { create: function () { return { render: function *() { this.body = 123} }} }'
    })yield this.initApp()yield this.startApp({
      startupSteps: [],
      shutdownSteps: [],
    })outputFormats = waigo.load('support/middleware/outputFormats')ctx = {
      request: {},
      query: {},
    }},

  afterEach: function *() {
    yield this.shutdownApp()},

  'invalid format in config': function () {
    this.expect(function () {
      outputFormats({}, {
        formats: {
          html3: true          
        }
      })}).to.throw('File not found: support/outputFormats/html3')},

  'uses default format when not specified': function *() {
    var fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true          
      }
    })let count = 0yield fn.call(ctx, function *() {
      count++})count.should.eql(1)_.isGenFn(ctx.render).should.be.truethis.expect(ctx.request.outputFormat).to.eql('json')},

  'invalid format in request': function *() {
    var fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true          
      }
    })ctx.query.format = 'html'try {
      yield fn.call(ctx, Q.resolve())throw -1} catch (err) {
      this.expect(err.message).to.eql('Invalid output format requested: html')this.expect(err.status).to.eql(400)}
  },


  'custom format': function *() {
    var fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true,
        html2: true
      }
    })ctx.query.format = 'html2'yield fn.call(ctx, Q.resolve())this.expect(_.isGenFn(ctx.render)).to.be.truethis.expect(ctx.request.outputFormat).to.eql('html2')yield ctx.render.call(ctx)this.expect(ctx.body).to.eql(123)},


  'override format after middleware is setup': function *() {
    var fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true,
        html2: true
      }
    })ctx.query.format = 'html2'yield fn.call(ctx, Q.resolve())this.expect(_.isGenFn(ctx.render)).to.be.truethis.expect(ctx.request.outputFormat).to.eql('html2')ctx.request.outputFormat = 'json'yield ctx.render.call(ctx)this.expect(ctx.body).to.eql({})},



  'converts locals to view objects if possible': function *() {
    const toViewObjectMethodName = waigo.load('support/viewObjects').METHOD_NAMEvar fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true
      }
    })var locals = {
      dummy: true,
      dummy2: {
        blah: 123
      },
      dummy3: [
        456,
        [ 1 ],
        { bar: 999 },
        {}
      ]
    }locals.dummy2[toViewObjectMethodName] = function *() {
      return {
        val: 55
      }}locals.dummy3[3][toViewObjectMethodName] = function *() {
      return {
        val: 77
      }}yield fn.call(ctx, Q.resolve())this.expect(_.isGenFn(ctx.render)).to.be.trueyield ctx.render.call(ctx, null, locals)this.expect(ctx.body).to.eql({
      dummy: true,
      dummy2: {
        val: 55
      },
      dummy3: [
        456,
        [ 1 ],
        { bar: 999 },
        { val: 77 }
      ]
    })},


  'redirect to url': function *() {
    var fn = outputFormats(this.App, {
      paramName: 'format',
      default: 'json',
      formats: {
        json: true
      }
    })yield fn.call(ctx, Q.resolve())this.expect(_.isGenFn(ctx.redirect)).to.be.trueyield ctx.redirect.call(ctx, 'www.test.com')this.expect(ctx.body).to.eql({
      redirectTo: 'www.test.com'
    })},  
}