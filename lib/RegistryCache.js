const EventEmitter = require('events').EventEmitter;
const ModuleEntry = require('./registry_cache/ModuleEntry');
const isEmpty = require('lodash.isempty');
const forEach = require('lodash.foreach');
const has = require('lodash.has');
const semver = require('semver');
const keys = require('lodash.keys');
var merge = require('lodash.merge');
var transform = require('lodash.transform');

class RegistryCache extends EventEmitter {
  constructor () {
    super();
    this._pendingModuleCache = {};
    this._resolvedModuleCache = {};
  }
  _fetchDependencies (name, version, dependencies) {
    if (isEmpty(dependencies)) {
      console.log('No dependencies to be fetched');
      this._checkForTreeResolution();
      return;
    }
    forEach(dependencies, (dv, dn) => {
      var cleanVersion = dv.replace(/[\>\<\=\~\^]+/g, '').trim().split(' ')[0];
      console.log('\t', 'Found dependency for', [name, version].join('@')+':',
        [dn, cleanVersion].join('@'));
      this._addDependent(dn, cleanVersion);
    });
  }
  _addDependent (moduleName, version) {
    var entry;
    if (this.getEntryVersion(moduleName, version)) {
      // We already have this entry
      console.log('Depedency', [moduleName, version].join('@'),
        'has already been acquired');
      this._checkForTreeResolution();
      return;
    }
    if (has(this._pendingModuleCache, moduleName)) {
      entry = this._pendingModuleCache[moduleName];
      entry.fetch(version, (name, version, payload) => {
        if (payload) {
          this._fetchDependencies(name, version, payload.dependencies);
        }
        if (entry.isCurrentlyResolved()) {
          this._movePendingModuleToResolved(moduleName);
          this._checkForTreeResolution();
        }
      });
      return;
    } else if (has(this._resolvedModuleCache, moduleName)) {
      entry = this._resolvedModuleCache[moduleName];
      entry.fetch(version, (name, version, payload) => {
        if (payload) {
          this._fetchDependencies(name, version, payload.dependencies);
        }
        if (entry.isCurrentlyResolved()) {
          this._movePendingModuleToResolved(moduleName);
          this._checkForTreeResolution();
        }
      });
      this._moveResolvedModuleToPending(moduleName);
      return;
    }
    this.fetchEntry(moduleName, version);
  }
  _moveResolvedModuleToPending (moduleName) {
    var ref = this._resolvedModuleCache[moduleName];
    this._pendingModuleCache[moduleName] = ref;
    delete this._resolvedModuleCache[moduleName];
  }
  _movePendingModuleToResolved (moduleName) {
    var ref = this._pendingModuleCache[moduleName];
    this._resolvedModuleCache[moduleName] = ref;
    delete this._pendingModuleCache[moduleName];
  }
  _checkForTreeResolution () {
    if (isEmpty(this._pendingModuleCache)) {
      console.log('----------------------');
      console.log('TREE HAS BEEN RESOLVED');
      console.log('LICENSE OUTPUT:');
      console.log(JSON.stringify(this._extractLicencesFromTree(), ' ', 1));
    }
  }
  _extractLicencesFromTree () {
    return transform(
      this._resolvedModuleCache,
      (acc, module, name) => merge(acc, module.extractLicenses()),
      {}
    );
  }
  getEntry (moduleName) {
    switch (true) {
      case has(this._pendingModuleCache, moduleName):
        return this._pendingModuleCache[moduleName];
      case has(this._resolvedModuleCache, moduleName):
        return this._resolvedModuleCache[moduleName];
      default:
        return null;
    }
  }
  getEntryVersion (moduleName, version) {
    var entry = this.getEntry(moduleName);
    if (!entry) {
      return null;
    }
    return entry.getVersion(version);
  }
  fetchEntry (name, version) {
    var entry = new ModuleEntry(name);
    this._pendingModuleCache[name] = entry;
    var cleanVersion = version.replace(/[\>\<\=\~\^]+/g, '').trim()
      .split(' ')[0];
    console.log('Fetching:', [name, cleanVersion].join('@'));
    entry.fetch(cleanVersion, (name, version, payload) => {
      console.log('Now looking for dependencies of ',
        [name, version].join('@'));
      if (payload) {
        this._fetchDependencies(name, version, payload.dependencies);
      }
      if (entry.isCurrentlyResolved()) {
        this._movePendingModuleToResolved(name);
        this._checkForTreeResolution();
      }
    });
  }
}

// Export a singleton
module.exports = new RegistryCache();
