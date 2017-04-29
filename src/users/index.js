const crypto = require('crypto')

const waigo = global.waigo,
  _ = waigo._,
  Q = waigo.load('promise')


const randomBytesQ = Q.promisify(crypto.pseudoRandomBytes, {
  context: crypto
})


/**
 * Singleton instance
 * @type {Object}
 */
let userMgr


const modelSpec = {
  docVirtuals: {
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
  },
  docMethods: {
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

      const generatedHash = yield userMgr.generatePasswordHash(
        password, salt
      )

      return generatedHash === passAuth.token
    },
    /**
    * Log the user into given context.
    * @param {Object} context waigo client request context.
    */
    login: function *(context) {
      userMgr.logger.debug(`Logging in user: ${this.id} = ${this.username}`)

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
      userMgr.App.emit('record', 'verify_email', this, {
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
      userMgr.App.emit('record', 'add_email', this, {
        email: email
      })
    },
    /**
    * Update this user's password.
    * @param {String} newPassword New password.
    */
    updatePassword: function *(newPassword) {
      userMgr.logger.debug('Update user password', this.username)

      const passAuth = _.find(this.auth, function (a) {
        return 'password' === a.type
      })

      if (!passAuth) {
        return false
      }

      // update password
      passAuth.token = yield userMgr.generatePasswordHash(newPassword)

      // save
      this.markChanged('auth')
      yield this.save()

      // record
      userMgr.App.emit('record', 'update_password', this)
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
      userMgr.logger.debug('Save user auth', this.id, type, data)

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
      userMgr.App.emit('record', 'save_oauth', this, _.pick(existing, 'type', 'access_token'))
    },
    /**
    * Get whether user can access given resource.
    *
    * @param {String} resource      The resource the user wishes to access.
    *
    * @return {Boolean} true if access is possible, false if not.
    */
    canAccess: function *(resource) {
      userMgr.App.acl.can(resource, this)
    },
    /**
    * Assert that user can access given resource.
    *
    * @param {String} resource The resource the user wishes to access.
    *
    * @throws {Error} If not allowed to access.
    */
    assertAccess: function *(resource) {
      userMgr.App.acl.assert(resource, this)
    },
  }
}



class UserManager {
  /**
   * @constructor
   * @param  {Application} App The Waigo app.
   */
  constructor (App) {
    this.App = App
    this.logger = App.logger.create('Users')
  }

  /**
   * Initialize
   */
  *init () {
    this.dbModel = yield this.App.db.model('user', modelSpec)
  }


  /**
   * Generate a secure SHA256 representing given password.
   * @param {String} password The password.
   * @param {String} [salt] Salt to use.
   * @return {String} hash to store
   */
  *generatePasswordHash (password, salt) {
    const hash = crypto.createHash('sha256')

    salt = salt || (yield randomBytesQ(64)).toString('hex')
    hash.update(salt)
    hash.update(password)

    return salt + '-' + hash.digest('hex')
  }

  /**
   * Get user by username.
   * @return {User}
   */
  *getByUsername (username) {
    return yield this.dbModel.getByUsername(username)
  }

  /**
   * Get user by email address.
   * @return {User}
   */
  *getByEmail (email) {
    return yield this.dbModel.getByEmail(email)
  }

  /**
   * Get user by email address or username.
   * @return {User}
   */
  *getByEmailOrUsername (str) {
    return yield this.dbModel.getByEmailOrUsername(str)
  }

  /**
   * Get users with given ids.
   * @return {User}
   */
  *findWithIds (ids) {
    return yield this.dbModel.findWithIds(ids)
  }

  /**
   * Find all admin users.
   * @return {Array}
   */
  *findAdminUsers () {
    return yield this.dbModel.findAdminUsers()
  }

  /**
   * Get whether any admin users exist.
   * @return {Number}
   */
  *haveAdminUsers () {
    return yield this.dbModel.haveAdminUser()
  }

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
  *register (properties) {
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

    // create user
    const user = yield this.dbModel.insert(attrs)

    if (!user) {
      throw new Error('Error creating new user: ' + properties.username)
    }

    // log activity
    this.App.emit('record', 'register', user)

    // notify admins
    this.App.emit('notify', 'admins', `New user: ${user.id} - ${user.username}`)

    return user
  }

  *loadLoggedIn (context) {
    const userId = _.get(context, 'session.user.id')

    if (!userId) {
      return null
    }

    return yield this.dbModel.get(userId)
  }
}

module.exports = UserManager


/**
 * Initialise User manager.
 *
 * @param  {Object} App Application object.
 * @return {Object} Activity recorder.
 */
exports.init = function *(App) {
  if (!userMgr) {
    userMgr = new UserManager(App)

    yield userMgr.init()
  }

  return userMgr
}