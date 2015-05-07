var expect = require('chai').expect;
var browserify = require('browserify');
var resolutions = require('../index');
var bundleCallback = require('./utils').bundleCallback;

describe('when bundling app-b', function() {

  // Bundle expectations
  // --------------------------
  var expectedBundledLibs = {};

  expectedBundledLibs.vanilla = [
    'lib-a-1.0.0',
    'lib-a-2.0.0',
    'lib-b-1.0.0'
  ].sort();

  expectedBundledLibs['lib-a'] = [
    'lib-a-1.0.0',
    'lib-b-1.0.0'
  ].sort();

  // Execution expectations
  // --------------------------
  var expectedExecutedLibs = {};

  expectedExecutedLibs.vanilla = expectedBundledLibs.vanilla;
  expectedExecutedLibs['lib-a'] = expectedBundledLibs['lib-a'];

  // Tests
  // --------------------------
  var bundler;

  beforeEach(function() {
    libs = [];
    bundler = browserify({
      entries: ['./test/app-b']
    });
  });

  describe('using vanilla browserify', function() {
    it('dedupes identical sources', function(done) {
      bundler
        .bundle(bundleCallback(function(bundledLibs) {
          expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
          done();
        }));
    });

    it('executes deduped sources', function(done) {
      bundler
        .bundle(bundleCallback(function() {
          expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
          done();
        }));
    });
  });

  describe('using browserify-resolutions', function() {
    describe('and passing matching package which main is a CJS "wrapper" (ala Angular)', function() {
      it('dedupes both the wrapper and the source', function(done) {
        var options = ['lib-a'];

        bundler
          .plugin(resolutions, options)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options]);
            expect(libs.sort()).to.eql(expectedExecutedLibs[options]);
            done();
          }));
      });
    });
  });
});
