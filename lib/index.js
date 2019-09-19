'use strict'

const Sequelize = require('sequelize')
const Joi = require('@hapi/joi')

const internals = {
  schema: Joi.object({
    partition: Joi.string().default('catbox'),
    sequelize: Joi.any(),
    url: Joi.string()
  })
}

module.exports = class {
  constructor (options = {}) {
    this.settings = Joi.attempt(options, internals.schema)
  }

  async start () {
    // Skip if already started

    if (this.sequelize) {
      return
    }

    // Externally managed clients

    if (this.settings.sequelize) {
      this.sequelize = this.settings.sequelize
      this._doModel()
      return
    }

    // Connect

    const sequelize = this.sequelize = new Sequelize(this.settings.url)

    this._doModel()

    await sequelize.sync()
  }

  async stop () {
    if (!this.client) {
      return
    }

    try {
      if (!this.settings.client) {
        this.client.removeAllListeners()
        await this.client.disconnect()
      }
    } finally {
      this.client = null
    }
  }

  _doModel (partitionName) {
    const {sequelize} = this
    const {partition: modelName} = this.settings

    /*

    CREATE FUNCTION expire_table_delete_old_rows() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
    BEGIN
      DELETE FROM expire_table WHERE timestamp < NOW() - INTERVAL '1 minute';
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER expire_table_delete_old_rows_trigger
        AFTER INSERT ON expire_table
        EXECUTE PROCEDURE expire_table_delete_old_rows();

    */

    class Cache extends Sequelize.Model {}
    Cache.init({
      key: {
        type: Sequelize.STRING,
        primaryKey: true
      },
      value: Sequelize.JSONB,
      stored: Sequelize.DATETIME,
      ttl: Sequelize.INTEGER
    }, { sequelize, modelName })

    this.cache = Cache
  }

  isReady () { // TODO: fix
    return Boolean(this.client) && this.client.status === 'ready'
  }

  validateSegmentName (name) {
    if (!name) {
      return new Error('Empty string')
    }

    if (name.indexOf('\0') !== -1) {
      return new Error('Includes null character')
    }

    return null
  }

  async get (key) {
    if (!this.model) {
      throw Error('Connection not started')
    }

    const result = await this.model.findOne({ where: { key } })

    if (!result) {
      return null
    }

    return {
      item: result.value,
      stores: result.stored,
      ttl: result.ttl
    }
  }

  async set (key, value, ttl) {
    if (!this.client) {
      throw Error('Connection not started')
    }

    const data = {
      key,
      value,
      stored: Date.now(),
      ttl
    }

    return this.model.insert(data)
  }

  drop (key) {
    if (!this.client) {
      throw Error('Connection not started')
    }

    return this.model.destroy({ where: { key } })
  }
}
