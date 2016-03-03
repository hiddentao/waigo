"use strict";

const schemaBuilder = require('simple-mongo-schema');


const waigo = global.waigo,
  _ = waigo._,
  Document = waigo.load('support/models/document');


/**
 * Represents a db model.
 */
class Model {
  constructor (app, db, cfg) {
    this.app = app;
    this.db = db;
    this.cfg = cfg;
    this.name = cfg.name;
    this.docMethods = _.get(cfg, 'docMethods', {});
    this.pk = _.get(cfg, 'pk', 'id');
    this.schema = schemaBuilder(cfg.schema);
    this.indexes = cfg.indexes || [];
    this.adminConfig = _.get(cfg, 'adminConfig');
  }

  /**
   * Initialise this model.
   */
  * init () {
    throw new Error('Not yet implemented');
  }

  getAdminListViewColumns () {
    let columns = _.get(this.adminConfig, 'listView.columns');

    if (!_.get(columns, 'length')) {
      columns = [this.pk];
    }

    return columns;
  }

  * _insert (rawDoc) {
    throw new Error('Not yet implemented');
  }

  * _update (id, changes, document) {
    throw new Error('Not yet implemented');
  }

  * _remove (id) {
    throw new Error('Not yet implemented');
  }

  /**
   * Wrap and return query result in `Document` instances.
   * @param  {Array|Object} [result]
   * @return {Array|Document}
   */
  _wrap (result) {
    if (result) {
      if (_.isArray(result)) {
        return _.map(result, (doc) => {
          if (doc) {
            return this._createDoc(doc);
          } else {
            return doc;
          }
        });
      } else {
        return this._createDoc(result);
      }
    } else {
      return result;
    }
  }


  /**
   * Wrap given raw doc in a `Document` instance.
   * @param  {Object} doc
   * @return {Document}
   */
  _createDoc (doc) {
    if (doc) {
      doc = new Document(this, doc);

      _.each(this.docMethods, (method, key) => {
        if (_.isGen(method)) {
          doc[key] = _.bindGen(method, doc);
        } else {
          doc[key] = _.bind(method, doc);
        }
      });
    }

    return doc;
  }
}


exports.Model = Model;




/**
 * Represents a RethinkDB model.
 */
class RethinkDbModel extends Model {
  constructor (app, db, cfg) {
    cfg = cfg || {};

    if (!cfg.pk) {
      cfg.pk = 'id';
    }

    super(app, db, cfg);
  }


  * init () {
    // create indexes
    this._native = this.db.createModel(this.name, {});

    for (let index of this.indexes) {
      this._native.ensureIndex(
        index.name, index.fn, index.options
      );
    }
  }


  /** 
   * Get item by id
   * @return {Document}
   */
  * getById (id) {
    return yield this._get(id);
  }



  /**
   * Listen for changes to this model's data.
   * 
   * @param  {Function} cb Callback
   */
  onChange (cb) {
    this.db.r.table(this.name).changes()
      .then(cb)
      .error((err) => {
        this.app.logger.error(`${this.name} changes error`, err);
      });
  }



  * _insert (rawDoc) {
    yield this.schema.validate(rawDoc);

    let ret = yield this.db.r.table(this.name).insert(rawDoc).run();

    let newDoc = _.extend({}, rawDoc);
    rawDoc[this.pk] = ret.generated_keys[0];

    return this._createDoc(newDoc);
  }


  * _update (id, changes, document) {
    yield this.schema.validate(changes, {
      ignoreMissing: true,
    });

    yield this.db.r.table(this.name).get(id).update(changes).run();
  }


  * _remove (id) {
    yield this.db.r.table(this.name).get(id).delete().run();
  }


  * _get (id) {
    if (undefined === id || null === id) {
      return null;
    }

    return this._wrap(
      yield this.db.r.table(this.name).get(id).run()
    );
  }


  * _getAll () {
    return this._wrap(
      yield this.db.r.table(this.name).run()
    );
  }

}


exports.RethinkDbModel = RethinkDbModel;




