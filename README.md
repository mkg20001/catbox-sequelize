<a href="http://hapijs.com"><img src="https://raw.githubusercontent.com/hapijs/assets/master/images/family.png" width="180px" align="right" /></a>

# catbox-sequelize

Sequelize adapter for [catbox](https://github.com/hapijs/catbox)

## Options

The connection can be specified with one (and only one) of:

- `sequelize` - a custom Sequelize client instance where `sequelize` must:
  - be manually started and stopped,
  - manually synced
  - not already synced

- `url` - a Sequelize server URL.

**catbox** options:

- `partition` - the table used for the cache. Defaults to `catbox`.

## Usage

Sample catbox cache initialization:

```js
const Catbox = require('@hapi/catbox')
const CatboxSequelize = require('catbox-sequelize')


const cache = new Catbox.Client(CatboxRedis, {
  partition : 'my_catbox_cache'
  url: 'postgres://user:pass@example.com:5432/dbname'
})
```

When used in a hapi server (hapi version 18 or newer):

```js
const Hapi = require('hapi')
const CatboxSequelize = require('catbox-sequelize')

const server = new Hapi.Server({
  cache: [
    {
      name: 'my_cache',
      provider: {
        constructor: CatboxSequelize,
        url: 'postgres://user:pass@example.com:5432/dbname'
      }
    }
  ]
})
```

## Tests

The test suite expects a postgresql server on the standart port with a database named catbox owned by a user catbox with the password catbox

To set it up locally, run `npm run db`
