

const _ = require('lodash'),
  co = require('co'),
  path = require('path'),
  Q = require('bluebird')


const test = require(path.join(process.cwd(), 'test', '_base'))(module)
const waigo = global.waigo


const validator = null,
  validationResult = undefined


test['emailAddressNotInUse'] = {
  beforeEach: function *() {
    yield this.initApp()
    yield this.startApp({
      startupSteps: ['db', 'models'],
      shutdownSteps: ['db'],
    })
    yield this.clearDb('User')

    validator = this.waigo.load('forms/support/validators/emailAddressNotInUse')

    this.ctx = {
      App: this.App,
    }
  },

  afterEach: function *() {
    yield this.shutdownApp()
  },

  'is not in use': function *() {
    const fn = validator()

    yield fn(this.ctx, null, 'test@test.com')
  },

  'in use': function *() {
    const fn = validator()

    yield this.App.models.User.register({
      username: 'test',
      email: 'test@test.com',
    })

    yield this.must.Throw(fn(this.ctx, null, 'test@test.com'), 'Email already in use')
  },

}
