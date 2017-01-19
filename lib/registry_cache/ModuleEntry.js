const EventEmitter = require('events').EventEmitter;
const isString = require('lodash.isstring');
const isFunction = require('lodash.isfunction');
const has = require('lodash.has');
const every = require('lodash.every');
const values = require('lodash.values');
const got = require('got');
var merge = require('lodash.merge');
var transform = require('lodash.transform');

class VersionResolutionStub extends EventEmitter {
  static events () {
    return {
      FETCHED: 'FETCHED'
    };
  }
  static getPackageInformation (moduleName, version) {
    return new Promise(function (resolve, reject) {
      got(['https://registry.npmjs.org', moduleName, version].join('/'))
        .then(response => resolve(JSON.parse(response.body)))
        .catch(error => reject(error));
    });
  }
  constructor (name, version) {
    super();
    this._version = version;
    this._name = name;
    this._fetched = false;
    this._resolved = false;
    this._fetchError = null;
    this._payload = null;
    VersionResolutionStub.getPackageInformation(name, version)
      .then((payload) => this._setResolved(payload))
      .then((payload) => this._setPayload(payload))
      .then((payload) => this._setFetched(payload))
      .then((payload) => this._emitFetched(name, version, payload))
      .catch((err) => {
        console.log('got error', err)
        try {
        this._setFetchError(err);
        this._setFetched(null);
        this._emitFetched(null, null, null);
        } catch (e) {
          console.log('other error', e);
        }
      });
  }
  addFetchedListener (cbFn) {
    if (this._fetched) {
      setImmediate(() => cbFn(this._name, this._version, this._payload));
    }
    super.once(VersionResolutionStub.events().FETCHED, cbFn);
  }
  _setResolved (payload) {
    return new Promise((resolve, reject) => {
      this._resolved = true;
      resolve(payload);
    });
  }
  _setFetchError (err) {
    this._fetchError = err;
  }
  _setFetched (payload) {
    return new Promise((resolve, reject) => {
      this._fetched = true;
      resolve(payload);
    })
  }
  _emitFetched (name, version, payload) {
    return new Promise((resolve, reject) => {
      super.emit(VersionResolutionStub.events().FETCHED, name, version,
        payload);
        resolve(payload);
    });
  }
  _setPayload (payload) {
    return new Promise((resolve, reject) => {
      this._payload = payload;
      resolve(payload);
    });
  }
  isResolved () {
    return this._resolved;
  }
  isFetched () {
    return this._fetched;
  }
  getVersion () {
    return this._version;
  }
  getPayload () {
    return this._payload;
  }
  extractLicense () {
    if (!this._payload) {
      return {
        ['unknown_version']: [
          {'error': this._fetchError}
        ]
      };
    }
    return {
      [this._payload.version]: this._payload.license
    };
  }
}

class ModuleEntry extends EventEmitter {
  constructor (moduleName) {
    super();
    this._name = moduleName;
    this._library = {};
  }
  _createStubInLibrary (version) {
    this._library[version] = new VersionResolutionStub(this._name, version);
    return this._library[version];
  }
  fetch (version, cbFn) {
    var stub = this._createStubInLibrary(version);
    if (isFunction(cbFn)) {
      stub.addFetchedListener(cbFn);
    }
  }
  getEntry (version) {
    if (!has(this._library, version)) {
      return null;
    }
    return this._library[version];
  }
  checkForVersion (version) {
    return has(this._library, version);
  }
  getVersion (version) {
    if (has(this._library, version)) {
      return this._library[version];
    }
    return null;
  }
  getName () {
    return this._name;
  }
  isCurrentlyResolved () {
    return every(values(this._library), (version) => version.isFetched());
  }
  extractLicenses () {
    return transform(
      this._library,
      (acc, moduleVersion, version) =>
        merge(acc, {[this._name]: moduleVersion.extractLicense()}),
      {[this._name]: {}}
    );
  }
};

module.exports = ModuleEntry;
