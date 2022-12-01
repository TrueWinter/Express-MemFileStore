/* eslint-disable no-extra-parens */
/* eslint-disable consistent-this */
/* eslint-disable no-unused-expressions */
/*!
 * Express-MemFileStore
 * Copyright(c) 2020 Rocco Musolino <@roccomuso> (Developer of memorystore)
 * Copyright(c) 2022 Nicholis du Toit <@TrueWinter> (Developer of Express-MemFileStore, a fork of memorystore)
 * MIT Licensed
 */

var debug = require('debug')('MemFileStore');
var LRU = require('lru-cache');
var util = require('util');
var fs = require('fs');

/**
 * One day in milliseconds.
 */

var oneDay = 86400000;

function getTTL (options, sess, sid) {
	if (typeof options.ttl === 'number') return options.ttl;
	if (typeof options.ttl === 'function') return options.ttl(options, sess, sid);
	if (options.ttl) throw new TypeError('`options.ttl` must be a number or function.');

	var maxAge = (sess && sess.cookie) ? (sess.cookie.maxAge || sess.cookie.originalMaxAge) : null;
	return (typeof maxAge === 'number' ?
		Math.floor(maxAge) : oneDay);
}

function prune (store) {
	debug('Pruning expired entries');
	store.forEach(function (value, key) {
		store.get(key);
		// The LRU cache will delete entries that are too old (TTL, not cookie expiry)
		// (or when there are too many entries) when calling .get().
		// So check if the entry exists before checking if it needs to be deleted.
		if (store.has(key)) {
			let date = new Date(JSON.parse(value).cookie.expires);
			if (Date.now() > date.getTime()) {
				debug(`Deleting ${key} as it expired ${Date.now() - date.getTime()}ms ago`);
				store.del(key);
			}
		}
	});
}

var defer = typeof setImmediate === 'function' ?
	setImmediate :
	function (fn) {
		// eslint-disable-next-line prefer-spread
		process.nextTick(fn.bind.apply(
			// eslint-disable-next-line prefer-rest-params
			fn, arguments
		));
	};

/**
 * Return the `MemFileStore` extending `express`'s session Store.
 *
 * @param {object} express session
 * @return {Function}
 * @api public
 */

module.exports = function (session) {
	/**
   * Express's session Store.
   */

	var Store = session.Store;

	/**
   * Initialize MemFileStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

	function MemFileStore (options) {
		if (!(this instanceof MemFileStore)) {
			throw new TypeError('Cannot call MemFileStore constructor as a function');
		}

		options = options || {};
		Store.call(this, options);

		this.options = {};
		this.options.checkPeriod = options.checkPeriod;
		this.options.savePeriod = options.savePeriod;
		this.options.saveFile = options.saveFile;
		this.options.max = options.max || Infinity;
		this.options.ttl = options.ttl;
		this.options.dispose = options.dispose;
		this.options.stale = options.stale;
		this.options.noDisposeOnSet = options.noDisposeOnSet;

		this.serializer = options.serializer || JSON;
		this.store = LRU(this.options);
		debug('Init MemFileStore');

		if (fs.existsSync(this.options.saveFile)) {
			let persistedData = JSON.parse(fs.readFileSync(this.options.saveFile, {
				encoding: 'utf-8'
			}));

			for (let key in persistedData) {
				this.store.set(key, this.serializer.stringify(persistedData[key]));
			}
		}

		this.startInterval();
		this.startSaveInterval();
	}

	/**
   * Inherit from `Store`.
   */

	util.inherits(MemFileStore, Store);

	/**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.get = function (sid, fn) {
		var store = this.store;

		debug('GET "%s"', sid);

		var data = store.get(sid);
		if (!data) return fn();

		debug('GOT %s', data);
		var err = null;
		var result;
		try {
			result = this.serializer.parse(data);
		} catch (er) {
			err = er;
		}

		fn && defer(fn, err, result);
	};

	/**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.set = function (sid, sess, fn) {
		var store = this.store;

		var ttl = getTTL(this.options, sess, sid);
		try {
			var jsess = this.serializer.stringify(sess);
		} catch (err) {
			fn && defer(fn, err);
		}

		store.set(sid, jsess, ttl);
		debug('SET "%s" %s ttl:%s', sid, jsess, ttl);
		fn && defer(fn, null);
	};

	/**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @api public
   */

	MemFileStore.prototype.destroy = function (sid, fn) {
		var store = this.store;

		if (Array.isArray(sid)) {
			sid.forEach(function (s) {
				debug('DEL "%s"', s);
				store.del(s);
			});
		} else {
			debug('DEL "%s"', sid);
			store.del(sid);
		}
		fn && defer(fn, null);
	};

	/**
   * Refresh the time-to-live for the session with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.touch = function (sid, sess, fn) {
		var store = this.store;

		var ttl = getTTL(this.options, sess, sid);

		debug('EXPIRE "%s" ttl:%s', sid, ttl);
		var err = null;
		if (store.get(sid) !== undefined) {
			try {
				var s = this.serializer.parse(store.get(sid));
				s.cookie = sess.cookie;
				store.set(sid, this.serializer.stringify(s), ttl);
			} catch (e) {
				err = e;
			}
		}
		fn && defer(fn, err);
	};

	/**
   * Fetch all sessions' ids
   *
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.ids = function (fn) {
		var store = this.store;

		var Ids = store.keys();
		debug('Getting IDs: %s', Ids);
		fn && defer(fn, null, Ids);
	};

	/**
   * Fetch all sessions
   *
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.all = function (fn) {
		var store = this.store;
		var self = this;

		debug('Fetching all sessions');
		var err = null;
		var result = {};
		try {
			store.forEach(function (val, key) {
				result[key] = self.serializer.parse(val);
			});
		} catch (e) {
			err = e;
		}
		fn && defer(fn, err, result);
	};

	/**
   * Delete all sessions from the store
   *
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.clear = function (fn) {
		var store = this.store;
		debug('delete all sessions from the store');
		store.reset();
		fn && defer(fn, null);
	};

	/**
   * Get the count of all sessions in the store
   *
   * @param {Function} fn
   * @api public
   */

	MemFileStore.prototype.length = function (fn) {
		var store = this.store;
		debug('getting length', store.itemCount);
		fn && defer(fn, null, store.itemCount);
	};

	/**
   * Start the check interval
   * @api public
   */

	MemFileStore.prototype.startInterval = function () {
		var self = this;
		var ms = this.options.checkPeriod;
		if (ms && typeof ms === 'number') {
			clearInterval(this._checkInterval);
			debug('starting periodic check for expired sessions');
			this._checkInterval = setInterval(function () {
				prune(self.store); // iterates over the entire cache proactively pruning old entries
			}, Math.floor(ms)).unref();
		}
	};

	/**
   * Stop the check interval
   * @api public
   */

	MemFileStore.prototype.stopInterval = function () {
		debug('stopping periodic check for expired sessions');
		clearInterval(this._checkInterval);
	};

	/**
	 * Start the save interval
	 * @api public
	 */
	MemFileStore.prototype.startSaveInterval = function () {
		var self = this;
		var ms = this.options.savePeriod;
		if (ms && typeof ms === 'number') {
			clearInterval(this._saveInterval);
			debug('starting periodic session saving');
			this._saveInterval = setInterval(function () {
				debug('Saving sessions to disk');
				var results = {};
				self.store.forEach(function (val, key) {
					results[key] = self.serializer.parse(val);
				});

				fs.writeFileSync(self.options.saveFile, JSON.stringify(results), {
					encoding: 'utf-8'
				});
			}, Math.floor(ms)).unref();
		}
	};

	/**
	 * Stop the save interval
	 * @api public
	 */
	MemFileStore.prototype.stopSaveInterval = function () {
		debug('stopping periodic session saving');
		clearInterval(this._saveInterval);
	};

	/**
   * Remove only expired entries from the store
   * @api public
   */

	MemFileStore.prototype.prune = function () {
		prune(this.store);
	};

	return MemFileStore;
};
