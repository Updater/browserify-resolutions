var expect          = require('chai').expect;
var browserify      = require('browserify');
var resolutions     = require('../index');
var bundleCallback  = require('./utils').bundleCallback;

describe('when bundling app that requires package.json-less submodules of a module (ala lodash)', function() {

  // Bundle expectations
  // --------------------------
  var expectedBundledLibs = {};

  expectedBundledLibs.vanilla = [
    'lib-a-1.0.0',
    'lib-submodules/module-a-1.0.0',
    'lib-submodules/module-a-2.0.0',
    'lib-submodules/module-b-1.0.0',
    'lib-submodules/module-b-2.0.0'
  ].sort();

  // TODO: This is the result we want if/when we implement deduping submodules.
  expectedBundledLibs.resolutions = [
    'lib-a-1.0.0',
    'lib-submodules/module-a-1.0.0',
    'lib-submodules/module-b-1.0.0',
  ].sort();

  // Execution expectations
  // --------------------------
  var expectedExecutedLibs = {};

  expectedExecutedLibs.vanilla      = expectedBundledLibs.vanilla;
  expectedExecutedLibs.resolutions  = expectedBundledLibs.resolutions;

  var bundler;

  beforeEach(function() {
    libs = [];
    bundler = browserify({
      entries: ['./test/package-submodules']
    });
  });

  describe('using vanilla browserify', function() {
    it('only dedupes identical sources', function(done) {
      bundler
        .bundle(bundleCallback(function (bundledLibs) {
          expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
          expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
          done();
        }));
    });
  });

  describe('using browserify-resolutions', function() {
    // TODO: Allow deduping submodules of a duplicate module.
    it('is not able to dedupe package.json-less submodules of a duplicate module', function(done) {
      bundler
        .plugin(resolutions, '*')
        .bundle(bundleCallback(function (bundledLibs) {
          expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
          expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
          done();
        }));
    });
  });
});
