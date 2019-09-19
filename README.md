<a href="http://hapijs.com"><img src="https://raw.githubusercontent.com/hapijs/assets/master/images/family.png" width="180px" align="right" /></a>

# catbox-sequelize

Sequelize adapter for [catbox](https://github.com/hapijs/catbox)

## Options

The connection can be specified with one (and only one) of:

- `sequelize` - a custom Sequelize client instance where `sequelize` must:
  - be manually started and stopped,
  - manually synced

- `url` - a Sequelize server URL.

**catbox** options:

- `partition` - the table used for the cache. Defaults to `catbox`.

## Usage

Sample catbox cache initialization:

```js
const Catbox = require('@hapi/catbox');
const CatboxSequelize = require('catbox-sequelize');


const cache = new Catbox.Client(CatboxRedis, {
  partition : 'my_catbox_cache'
  url: ''
});
```
