'use strict'

const Code = require('@hapi/code')
const Catbox = require('@hapi/catbox')
const CatboxSequelize = require('..')
const Hapi = require('@hapi/hapi')
const Hoek = require('@hapi/hoek')
const Lab = require('@hapi/lab')

const DB = 'postgres://maciej:test@localhost/catbox'
const Sequelize = require('sequelize')

const { it, describe } = exports.lab = Lab.script()
const expect = Code.expect

describe('hapi', () => {
  const config = (options) => {
    if (require('@hapi/hapi/package.json').version[1] === '7') {
      options.engine = CatboxSequelize
      return options
    }

    return {
      provider: {
        constructor: CatboxSequelize,
        options
      }
    }
  }

  it('uses sequelize URL for caching', async () => {
    const server = Hapi.server({
      cache: config({
        url: DB,
        partition: 'hapi-test-sequelize'
      })
    })

    const cache = server.cache({ segment: 'test', expiresIn: 1000 })
    await server.initialize()

    await cache.set('a', 'going in')
    expect(await cache.get('a')).to.equal('going in')
  })

  it('uses sequelize client for caching', async () => {
    const sequelize = new Sequelize(DB)

    const server = Hapi.server({
      cache: config({
        sequelize,
        partition: 'hapi-test-sequelize'
      })
    })

    const cache = server.cache({ segment: 'test', expiresIn: 1000 })
    await sequelize.sync()
    await server.initialize()

    await cache.set('a', 'going in')
    expect(await cache.get('a')).to.equal('going in')
  })
})

describe('Connection', () => {
  it('creates a new connection', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()
    expect(client.isReady()).to.equal(true)
  })

  it('closes the connection', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()
    expect(client.isReady()).to.equal(true)
    await client.stop()
    expect(client.isReady()).to.equal(false)
  })

  it('gets an item after setting it', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    const key = { id: 'x', segment: 'test' }
    await client.set(key, '123', 500)

    const result = await client.get(key)
    expect(result.item).to.equal('123')
  })

  it('fails setting an item circular references', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()
    const key = { id: 'x', segment: 'test' }
    const value = { a: 1 }
    value.b = value

    await expect(client.set(key, value, 10)).to.reject(Error, /Converting circular structure to JSON/)
  })

  it('ignored starting a connection twice on same event', () => {
    return new Promise((resolve, reject) => {
      const client = new Catbox.Client(CatboxSequelize, {url: DB})
      let x = 2
      const start = async () => {
        await client.start()
        expect(client.isReady()).to.equal(true)
        --x
        if (!x) {
          resolve()
        }
      }

      start()
      start()
    })
  })

  it('ignored starting a connection twice chained', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})

    await client.start()
    expect(client.isReady()).to.equal(true)

    await client.start()
    expect(client.isReady()).to.equal(true)
  })

  it('returns not found on get when using null key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    const result = await client.get(null)

    expect(result).to.equal(null)
  })

  it('returns not found on get when item expired', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    const key = { id: 'x', segment: 'test' }
    await client.set(key, 'x', 1)

    await Hoek.wait(2)
    const result = await client.get(key)
    expect(result).to.equal(null)
  })

  it('errors on set when using null key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    await expect(client.set(null, {}, 1000)).to.reject()
  })

  it('errors on get when using invalid key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    await expect(client.get({})).to.reject()
  })

  it('errors on drop when using invalid key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    await expect(client.drop({})).to.reject()
  })

  it('errors on set when using invalid key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    await expect(client.set({}, {}, 1000)).to.reject()
  })

  it('ignores set when using non-positive ttl value', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()
    const key = { id: 'x', segment: 'test' }
    await client.set(key, 'y', 0)
  })

  it('errors on drop when using null key', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.start()

    await expect(client.drop(null)).to.reject()
  })

  it('errors on get when stopped', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.stop()

    const key = { id: 'x', segment: 'test' }
    await expect(client.connection.get(key)).to.reject(Error, 'Connection not started')
  })

  it('errors on set when stopped', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.stop()

    const key = { id: 'x', segment: 'test' }
    await expect(client.connection.set(key, 'y', 1)).to.reject(Error, 'Connection not started')
  })

  it('errors on drop when stopped', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.stop()

    const key = { id: 'x', segment: 'test' }

    try {
      await client.connection.drop(key)
    } catch (err) {
      expect(err.message).to.equal('Connection not started')
    }
  })

  it('errors on missing segment name', () => {
    const config = {
      expiresIn: 50000
    }
    const fn = () => {
      const client = new Catbox.Client(CatboxSequelize, {url: DB})
      new Catbox.Policy(config, client, '')
    }

    expect(fn).to.throw(Error)
  })

  it('errors on bad segment name', () => {
    const config = {
      expiresIn: 50000
    }
    const fn = () => {
      const client = new Catbox.Client(CatboxSequelize, {url: DB})
      new Catbox.Policy(config, client, 'a\0b')
    }

    expect(fn).to.throw(Error)
  })

  it('errors when cache item dropped while stopped', async () => {
    const client = new Catbox.Client(CatboxSequelize, {url: DB})
    await client.stop()

    await expect(client.drop('a')).to.reject()
  })

  describe('start()', () => {
    it('sets client to when the connection succeeds', async () => {
      const options = {
        url: DB
      }

      const sequelize = new CatboxSequelize(options)

      await sequelize.start()
      expect(sequelize.sequelize).to.exist()
    })

    it('reuses the client when a connection is already started', async () => {
      const options = {
        url: DB
      }

      const sequelize = new CatboxSequelize(options)

      await sequelize.start()
      const client = sequelize.sequelize

      await sequelize.start()
      expect(client).to.equal(sequelize.sequelize)
    })

    it('returns an error when connection fails', async () => {
      const options = {
        url: 'postgres://test:test@127.0.0.1:6800/test'
      }

      const sequelize = new CatboxSequelize(options)

      await expect(sequelize.start()).to.reject()

      expect(sequelize.sequelize).to.not.exist()
    })

    it('fails in error when auth is not correct', async () => {
      const options = {
        url: 'postgres://not:valid@localhost/test'
      }

      const sequelize = new CatboxSequelize(options)

      await expect(sequelize.start()).to.reject()

      expect(sequelize.sequelize).to.not.exist()
    })

    it('success when auth is correct', async () => {
      const options = {
        url: DB
      }

      const sequelize = new CatboxSequelize(options)

      await sequelize.start()
      expect(sequelize.sequelize).to.exist()
    })

    it('connects via a Sequelize URL when one is provided', async () => {
      const options = {
        url: DB
      }

      const sequelize = new CatboxSequelize(options)

      await sequelize.start()
      expect(sequelize.sequelize).to.exist()
    })

    describe('isReady()', () => {
      it('returns true when when connected', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        await sequelize.start()
        expect(sequelize.sequelize).to.exist()
        expect(sequelize.isReady()).to.equal(true)
        await sequelize.stop()
      })

      it('returns false when stopped', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        await sequelize.start()
        expect(sequelize.sequelize).to.exist()
        expect(sequelize.isReady()).to.equal(true)
        await sequelize.stop()
        expect(sequelize.isReady()).to.equal(false)
      })
    })

    describe('validateSegmentName()', () => {
      it('returns an error when the name is empty', () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        const result = sequelize.validateSegmentName('')

        expect(result).to.be.instanceOf(Error)
        expect(result.message).to.equal('Empty string')
      })

      it('returns an error when the name has a null character', () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        const result = sequelize.validateSegmentName('\0test')

        expect(result).to.be.instanceOf(Error)
      })

      it('returns null when there aren\'t any errors', () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        const result = sequelize.validateSegmentName('valid')

        expect(result).to.not.be.instanceOf(Error)
        expect(result).to.equal(null)
      })
    })

    describe('get()', () => {
      it('returns a promise that rejects when the connection is closed', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        try {
          await sequelize.get('test')
        } catch (err) {
          expect(err.message).to.equal('Connection not started')
        }
      })

      it('returns a promise that rejects when there is an error returned from getting an item', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)
        sequelize.model = {
          findOne: function (item) {
            return Promise.reject(Error())
          }
        }

        await expect(sequelize.get('test')).to.reject()
      })

      it('is able to retrieve an object thats stored when connection is started', async () => {
        const options = {
          url: DB,
          partition: 'wwwtest'
        }
        const key = {
          id: 'test',
          segment: 'test'
        }

        const sequelize = new CatboxSequelize(options)
        await sequelize.start()
        await sequelize.set(key, 'myvalue', 200)
        const result = await sequelize.get(key)
        expect(result.item).to.equal('myvalue')
      })

      it('returns null when unable to find the item', async () => {
        const options = {
          url: DB,
          partition: 'wwwtest'
        }
        const key = {
          id: 'notfound',
          segment: 'notfound'
        }

        const sequelize = new CatboxSequelize(options)
        await sequelize.start()
        const result = await sequelize.get(key)
        expect(result).to.not.exist()
      })

      it('can store and retrieve falsy values such as int 0', async () => {
        const options = {
          url: DB,
          partition: 'wwwtest'
        }
        const key = {
          id: 'test',
          segment: 'test'
        }

        const sequelize = new CatboxSequelize(options)
        await sequelize.start()
        await sequelize.set(key, 0, 200)
        const result = await sequelize.get(key)
        expect(result.item).to.equal(0)
      })

      it('can store and retrieve falsy values such as boolean false', async () => {
        const options = {
          url: DB,
          partition: 'wwwtest'
        }
        const key = {
          id: 'test',
          segment: 'test'
        }

        const sequelize = new CatboxSequelize(options)
        await sequelize.start()
        await sequelize.set(key, false, 200)
        const result = await sequelize.get(key)
        expect(result.item).to.equal(false)
      })
    })

    describe('set()', () => {
      it('returns a promise that rejects when the connection is closed', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        try {
          await sequelize.set('test1', 'test1', 3600)
        } catch (err) {
          expect(err.message).to.equal('Connection not started')
        }
      })

      it('returns a promise that rejects when there is an error returned from setting an item', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)
        sequelize.sequelize = {
          set: function (key, item, callback) {
            return Promise.reject(Error())
          }
        }

        await expect(sequelize.set('test', 'test', 3600)).to.reject()
      })
    })

    describe('drop()', () => {
      it('returns a promise that rejects when the connection is closed', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)

        try {
          await sequelize.drop('test2')
        } catch (err) {
          expect(err.message).to.equal('Connection not started')
        }
      })

      it('deletes the item from sequelize', async () => {
        const options = {
          url: DB
        }

        const sequelize = new CatboxSequelize(options)
        sequelize.model = {
          delete: function (key) {
            return Promise.resolve(null)
          }
        }

        await sequelize.drop('test')
      })
    })

    describe('generateKey()', () => {
      it('generates the storage key from a given catbox key', () => {
        const options = {
          partition: 'foo'
        }

        const sequelize = new CatboxSequelize(options)

        const key = {
          id: 'bar',
          segment: 'baz'
        }

        expect(sequelize.generateKey(key)).to.equal('baz:bar')
      })

      it('generates the storage key from a given catbox key without partition', () => {
        const options = {}

        const sequelize = new CatboxSequelize(options)

        const key = {
          id: 'bar',
          segment: 'baz'
        }

        expect(sequelize.generateKey(key)).to.equal('baz:bar')
      })
    })

    describe('stop()', () => {
      it('sets the client to null', async () => {
        const sequelize = new CatboxSequelize({url: DB})

        await sequelize.start()
        expect(sequelize.sequelize).to.exist()
        await sequelize.stop()
        expect(sequelize.sequelize).to.not.exist()
      })
    })
  })
})
