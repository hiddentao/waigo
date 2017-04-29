const crypto = require('crypto')

const waigo = global.waigo,
  _ = waigo._,
  Q = waigo.load('promise')


const randomBytesQ = Q.promisify(crypto.pseudoRandomBytes, {
  context: crypto
})


const ProfileSchema = {
  displayName: { type: String, required: true },
}


const EmailSchema = {
  email: { type: String, required: true },
  verified: { type: Boolean },
}


const AuthSchema = {
  type: { type: String, required: true },
  token: { type: String, required: true },
  data: { type: Object },
}



exports.schema = {
  username: {
    type: String,
    required: true,
  },
  profile: {
    type: ProfileSchema,
    required: true,
  },
  emails: {
    type: [EmailSchema],
    required: true,
    adminViewOptions: {
      viewSubKey: 'email'
    },
  },
  auth: {
    type: [AuthSchema],
    required: true,
    adminViewOptions: {
      viewSubKey: 'type'
    },
  },
  roles: {
    type: [String],
    required: false,
  },
  created: {
    type: Date,
    required: true,
  },
  lastLogin: {
    type: Date,
    required: false,
  },
}



exports.indexes = [
  {
    name: 'username',
  },
  {
    name: 'email',
    def: function (doc) {
      return doc('emails')('email')
    },
    options: {
      multi: true,
    },
  },
  {
    name: 'roles',
    options: {
      multi: true,
    },
  },
]





exports.docVirtuals = {
  isAdmin: {
    get: function () {
      return true === _.includes(this.roles, 'admin')
    }
  },
  emailAddress: {
    get: function () {
      return _.get(this.emails, '0.email')
    }
  },
  emailAddresses: {
    get: function () {
      return _.map(this.emails || [], 'email')
    }
  },
}



exports.docMethods = {
  /**
   * Get whether user has any of  given roles
   */
  isOneOf: function () {
    const roles = _.toArray(arguments)

    return !!(_.intersection(this.roles || [], roles).length)
  },
  /**
   * Check password against hash.
   * @param {String} password
   * @param {String} storedHash
   * @return {Boolean} true if password matches, false otherwise
   */
  isPasswordCorrect: function *(password) {
    const passAuth = _.find(this.auth, function (a) {
      return 'password' === a.type
    })

    if (!passAuth) {
      return false
    }

    const sepPos = passAuth.token.indexOf('-'),
      salt = passAuth.token.substr(0, sepPos)

    const generatedHash = yield this.__model.generatePasswordHash(
      password, salt
    )

    return generatedHash === passAuth.token
  },
  /**
   * Log the user into given context.
   * @param {Object} context waigo client request context.
   */
  login: function *(context) {
    this._logger().debug(`Logging in user: ${this.id} = ${this.username}`)

    context.session.user = {
      id: this.id,
      username: this.username,
    }

    // update last-login timestamp
    this.lastLogin = new Date()
    yield this.save()
  },
  /**
   * Verify an email address.
   * @param {String} email Email address to verify.
   */
  verifyEmail: function *(email) {
    const theEmail = _.find(this.emails, function (e) {
      return email === e.email
    })

    if (!theEmail) {
      return false
    }

    theEmail.verified = true

    // save
    this.markChanged('emails')
    yield this.save()

    // record
    this._App().emit('record', 'verify_email', this, {
      email: email
    })
  },
  /**
   * Check whether user has given email address.
   * @param {String} email Email address to check.
   * @return {Boolean}
   */
  hasEmail: function *(email) {
    return 0 <= _.findIndex(this.emails || [], function (e) {
      return email === e.email
    })
  },
  /**
   * Check whether user has verified given email address.
   * @param {String} email Email address to check.
   * @return {Boolean}
   */
  isEmailVerified: function *(email) {
    const item = _.find(this.emails || [], function (e) {
      return email === e.email
    })

    return item && item.verified
  },
  /**
   * Add an email address.
   * @param {String} email Email address to verify.
   * @param {Boolea} verified Whether address is verified.
   */
  addEmail: function *(email, verified) {
    let theEmail = _.find(this.emails, function (e) {
      return email === e.email
    })

    if (!theEmail) {
      theEmail = {
        email: email,
      }

      this.emails.push(theEmail)
    }

    theEmail.verified = true

    // save
    this.markChanged('emails')
    yield this.save()

    // record
    this._App().emit('record', 'add_email', this, {
      email: email
    })
  },
  /**
   * Update this user's password.
   * @param {String} newPassword New password.
   */
  updatePassword: function *(newPassword) {
    this._logger().debug('Update user password', this.username)

    const passAuth = _.find(this.auth, function (a) {
      return 'password' === a.type
    })

    if (!passAuth) {
      return false
    }

    // update password
    passAuth.token = yield this.__model.generatePasswordHash(newPassword)

    // save
    this.markChanged('auth')
    yield this.save()

    // record
    this._App().emit('record', 'update_password', this)
  },
  /**
   * Get OAuth data.
   *
   * @param {String} provider Auth provider.
   *
   * @return {Object} null if not found.
   */
  getOauth: function *(provider) {
    provider = 'oauth:' + provider

    provider = _.find(this.auth, function (a) {
      return provider === a.type
    })

    return _.get(provider, 'data', null)
  },
  /**
   * Save OAuth data.
   *
   * @param {String} provider Auth provider.
   * @param {Object} data Data.
   */
  saveOAuth: function *(provider, data) {
    yield this.saveAuth('oauth:' + provider, data)
  },
  /**
   * Save Auth data.
   *
   * @param {String} type Auth type.
   * @param {Object} data Data.
   */
  saveAuth: function *(type, data) {
    this._logger().debug('Save user auth', this.id, type, data)

    let existing = _.find(this.auth, function (a) {
      return type === a.type
    })

    if (!existing) {
      existing = {
        type: type
      }

      this.auth.push(existing)
    }

    existing.data = data

    // save
    this.markChanged('auth')
    yield this.save()

    // record
    this._App().emit('record', 'save_oauth', this, _.pick(existing, 'type', 'access_token'))
  },
  /**
   * Get whether user can access given resource.
   *
   * @param {String} resource      The resource the user wishes to access.
   *
   * @return {Boolean} true if access is possible, false if not.
   */
  canAccess: function *(resource) {
    return this._App().acl.can(resource, this)
  },
  /**
   * Assert that user can access given resource.
   *
   * @param {String} resource The resource the user wishes to access.
   *
   * @throws {Error} If not allowed to access.
   */
  assertAccess: function *(resource) {
    return this._App().acl.assert(resource, this)
  },
}


exports.modelMethods = {
  /**
   * Get user by username.
   * @return {User}
   */
  getByUsername: function *(username) {
    const ret = yield this.rawQry().filter(function (user) {
      return user('username').eq(username)
    }).run()

    return this.wrapRaw(_.get(ret, '0'))
  },
  /**
   * Get user by email address.
   * @return {User}
   */
  getByEmail: function *(email) {
    const r = this.db

    const ret = yield this.rawQry().filter(
      r.row('emails').contains(function (e) {
        return e('email').eq(email)
      })
    ).run()

    return this.wrapRaw(_.get(ret, '0'))
  },
  /**
   * Get user by email address or username.
   * @return {User}
   */
  getByEmailOrUsername: function *(str) {
    const ret = yield this.rawQry().filter(function (user) {
      return user('emails')('email')(0).eq(str).or(user('username').eq(str))
    }).run()

    return this.wrapRaw(_.get(ret, '0'))
  },
  /**
   * Get users with given ids.
   * @return {User}
   */
  findWithIds: function *(ids) {
    let qry = this.rawQry()

    qry = qry.getAll.apply(qry, ids.concat([{index: 'id'}]))

    return this.wrapRaw(yield qry.run())
  },
  /**
   * Find all admin users.
   * @return {Array}
   */
  findAdminUsers: function *() {
    const ret = yield this.rawQry().filter(function (user) {
      return user('roles').contains('admin')
    }).run()

    return this.wrapRaw(ret)
  },
  /**
   * Get whether any admin users exist.
   * @return {Number}
   */
  haveAdminUsers: function *() {
    const count = yield this.rawQry().count(function (user) {
      return user('roles').contains('admin')
    }).run()

    return count > 0
  },
  /**
   * Register a new user
   * @param {Object} properties User props.
   * @param {String} properties.username Username.
   * @param {Object} [properties.roles] Roles
   * @param {String} [properties.email] Email address.
   * @param {Boolean} [properties.emailVerified] Whether email address is verified.
   * @param {String} [properties.password] User's password.
   * @return {User} The registered user.
   */
  register: function *(properties) {
    // create user
    const attrs = {
      username: properties.username,
      emails: [],
      auth: [],
      profile: _.extend({
        displayName: properties.username,
      }, properties.profile),
      roles: properties.roles || [],
    }

    if (properties.email) {
      attrs.emails.push(
        {
          email: properties.email,
          verified: !!properties.emailVerified,
        }
      )
    }

    if (properties.password) {
      attrs.auth.push(
        {
          type: 'password',
          token: yield this.generatePasswordHash(properties.password),
        }
      )
    }

    attrs.created = new Date()

    const user = yield this.insert(attrs)

    if (!user) {
      throw new Error('Error creating new user: ' + properties.username)
    }

    // log activity
    this._App().emit('record', 'register', user)

    // notify admins
    this._App().emit('notify', 'admins', `New user: ${user.id} - ${user.username}`)

    return user
  },
  loadLoggedIn: function *(context) {
    const userId = _.get(context, 'session.user.id')

    if (!userId) {
      return null
    }

    return yield this.get(userId)
  },
  getUsersCreatedSince: function *(date) {
    const ret = yield this.rawQry().filter(function (doc) {
      return doc('created').ge(date)
    }).run()

    return this.wrapRaw(ret)
  },
}