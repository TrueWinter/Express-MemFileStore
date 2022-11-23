# Express-MemFileStore

> express-session full featured `MemoryStore` module without leaks! This fork of MemoryStore allows sessions to be persisted to the disk.

A session store implementation for Express using [lru-cache](https://github.com/isaacs/node-lru-cache).

Because the default `MemoryStore` for [express-session](https://github.com/expressjs/session) will lead to a memory leak due to it haven't a suitable way to make them expire.

The sessions are still stored in memory, so they're not shared with other processes or services. The sessions will also be persisted to the disk.

## Setup

    $ npm install express-session express-memfilestore

Pass the `express-session` store into `express-memfilestore` to create a `MemoryStore` constructor.

```javascript
const session = require('express-session')
const MemFileStore = require('express-memfilestore')(session)

app.use(session({
    cookie: { maxAge: 86400000 },
    store: new MemFileStore({
      checkPeriod: 86400000, // prune expired entries every 24h
	  savePeriod: 300000, // saves sessions to disk every 5m
	  saveFile: path.join(__dirname, 'sessions.json')
    }),
    resave: false,
    secret: 'keyboard cat'
}))
```

## Options

* `checkPeriod` Define how long MemFileStore will check for expired. The period is in ms.
* `savePeriod` Sets how often MemFileStore will save sessions to disk. This is in ms.
* `saveFile` The file that MemFileStore will save the sessions to. If this is in a directory, the directory must already exist.
* `max` The maximum size of the cache, checked by applying the length
  function to all values in the cache.  It defaults to `Infinity`.
* `ttl` Session TTL (expiration) in milliseconds. Defaults to session.maxAge (if set), or one day. This may also be set to a function of the form `(options, sess, sessionID) => number`.
* `dispose` Function that is called on sessions when they are dropped
  from the cache.  This can be handy if you want to close file
  descriptors or do other cleanup tasks when sessions are no longer
  accessible.  Called with `key, value`.  It's called *before*
  actually removing the item from the internal cache, so if you want
  to immediately put it back in, you'll have to do that in a
  `nextTick` or `setTimeout` callback or it won't do anything.
* `stale` By default, if you set a `maxAge`, it'll only actually pull
  stale items out of the cache when you `get(key)`.  (That is, it's
  not pre-emptively doing a `setTimeout` or anything.)  If you set
  `stale:true`, it'll return the stale value before deleting it.  If
  you don't set this, then it'll return `undefined` when you try to
  get a stale entry, as if it had already been deleted.
* `noDisposeOnSet` By default, if you set a `dispose()` method, then it'll be called whenever a `set()` operation overwrites an existing key. If you set this option, `dispose()` will only be called when a key falls out of the cache, not when it is overwritten.
* `serializer` An object containing `stringify` and `parse` methods compatible with Javascript's `JSON` to override the serializer used.

## Methods

`MemFileStore` implements all the **required**, **recommended** and **optional** methods of the [express-session](https://github.com/expressjs/session#session-store-implementation) store. Plus a few more:

- `startInterval()` and `stopInterval()` methods to start/clear the automatic check for expired. `startSaveInterval()` and `stopSaveInterval()` methods start/stop the session saving.

- `prune()` that you can use to manually remove only the expired entries from the store.

## Debug

To enable debug set the env var `DEBUG=MemFileStore`
