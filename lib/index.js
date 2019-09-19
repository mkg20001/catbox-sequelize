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

    // Externally managed clients

    if (this.settings.sequelize) { // we NEED to do this here, otherwise the model might not be synced
      this.sequelize = this.settings.sequelize
      this._doModel()
    }
  }

  generateKey ({ id, segment }) {
    const parts = []

    parts.push(encodeURIComponent(segment))
    parts.push(encodeURIComponent(id))

    return parts.join(':')
  }

  async start () {
    // Skip if already started

    if (this.model) {
      return
    }

    // Connect

    if (this.settings.sequelize) {
      await this._doModelTrigger()
      return
    }

    if (!this.settings.url) {
      throw new Error('No URL given')
    }

    const sequelize = this.sequelize = new Sequelize(this.settings.url)

    this._doModel()

    await sequelize.sync()
    await this._doModelTrigger()
  }

  async stop () {
    if (!this.model) {
      return
    }

    try {
      if (!this.settings.sequelize) {
        // TODO: disconnect sequelize
      }
    } finally {
      this.sequelize = null
      this.model = null
    }
  }

  _doModel (partitionName) {
    const {sequelize} = this
    const {partition: modelName} = this.settings

    class Cache extends Sequelize.Model {}
    Cache.init({
      key: {
        type: Sequelize.STRING,
        primaryKey: true
      },
      value: Sequelize.JSONB,
      stored: Sequelize.BIGINT,
      ttl: Sequelize.INTEGER,
      expire: Sequelize.INTEGER
    }, { sequelize, modelName })

    this.model = Cache
  }

  async _doModelTrigger () {
    return // TODO: fix

    const {sequelize} = this
    let {tableName} = this.model

    // TODO: make this smarter

    try {
      await sequelize.query(`DROP TRIGGER expire_table_delete_old_rows_trigger ON ${tableName};`).spread()
      await sequelize.query('DROP FUNCTION expire_table_delete_old_rows;').spread()
    } catch (err) {
      // do nothin
    }

    const trigger = `

    CREATE FUNCTION expire_table_delete_old_rows() RETURNS trigger
        LANGUAGE plpgsql
        AS $$
    BEGIN
      DELETE FROM ${tableName} WHERE expire < NOW();
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER expire_table_delete_old_rows_trigger
        AFTER INSERT ON ${tableName}
        EXECUTE PROCEDURE expire_table_delete_old_rows();

    `

    await sequelize.query(trigger).spread()
  }

  isReady () { // TODO: really check connection/sync state
    return Boolean(this.model)
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
    key = this.generateKey(key)

    if (!this.model) {
      throw Error('Connection not started')
    }

    const result = await this.model.findOne({ where: { key } })

    if (!result) {
      return null
    }

    return {
      item: result.value,
      stored: result.stored,
      ttl: result.ttl
    }
  }

  async set (key, value, ttl) {
    await this.drop(key)

    key = this.generateKey(key)

    if (!this.model) {
      throw Error('Connection not started')
    }

    const data = {
      key,
      value,
      stored: Date.now(),
      ttl
    }

    return this.model.create(data)
  }

  async drop (key) {
    key = this.generateKey(key)

    if (!this.model) {
      throw Error('Connection not started')
    }

    return this.model.destroy({ where: { key } })
  }
}
