var expect = require('chai').expect;
var browserify = require('browserify');
var resolutions = require('../index');
var bundleCallback = require('./utils').bundleCallback;

describe('when bundling app-a', function() {

  // Bundle expectations
  // --------------------------
  var expectedBundledLibs = {};

  expectedBundledLibs.vanilla = [
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-ab-2.0.0',
    'lib-b-1.0.0',
    'lib-b-2.0.0',
    'lib-c-1.0.0'
  ].sort();

  expectedBundledLibs['lib-a'] = expectedBundledLibs.vanilla;

  expectedBundledLibs['lib-ab'] = [
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-b-1.0.0',
    'lib-b-2.0.0',
    'lib-c-1.0.0'
  ].sort();

  expectedBundledLibs['lib-ab,lib-b'] = [
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-b-1.0.0',
    'lib-c-1.0.0'
  ].sort();

  expectedBundledLibs['*'] = expectedBundledLibs['lib-ab,lib-b'];

  // Execution expectations
  // --------------------------
  var expectedExecutedLibs = {};

  expectedExecutedLibs.vanilla = expectedBundledLibs.vanilla.concat([
    'lib-a-1.0.0'
  ]).sort();

  expectedExecutedLibs['lib-a'] = expectedBundledLibs['lib-a'];

  expectedExecutedLibs['lib-ab'] = [
    'lib-a-1.0.0',
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-b-1.0.0',
    'lib-b-2.0.0',
    'lib-c-1.0.0'
  ].sort();

  expectedExecutedLibs['lib-ab,lib-b'] = [
    'lib-a-1.0.0',
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-b-1.0.0',
    'lib-c-1.0.0'
  ].sort();

  expectedExecutedLibs['*'] = [
    'lib-a-1.0.0',
    'lib-ab-1.0.0',
    'lib-b-1.0.0',
    'lib-c-1.0.0'
  ].sort();

  // Tests
  // --------------------------
  var bundler;

  beforeEach(function() {
    libs = [];
    bundler = browserify({
      entries: ['./test/app-a']
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
    describe('and not passing options', function() {
      it('is vanilla dedupe', function(done) {
        bundler
          .plugin(resolutions)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
            expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
            done();
          }));
      });
    });

    describe('and passing empty array', function() {
      it('is vanilla dedupe', function(done) {
        bundler
          .plugin(resolutions, [])
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
            expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
            done();
          }));
      });
    });

    describe('and passing a matching package name', function() {
      it('bundles and executes the matching package once', function(done) {
        var options = ['lib-ab'];

        bundler
          .plugin(resolutions, options)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options.toString()]);
            expect(libs.sort()).to.eql(expectedExecutedLibs[options.toString()]);
            done();
          }));
      });
    });

    describe('and passing multiple matching package names', function() {
      it('bundles and executes the matching packages once', function(done) {
        var options = ['lib-ab', 'lib-b'];

        bundler
          .plugin(resolutions, options)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options.join(',')]);
            expect(libs.sort()).to.eql(expectedExecutedLibs[options.join(',')]);
            done();
          }));
      });
    });

    describe('and passing *', function() {
      it('bundles and executes all packages once', function(done) {
        var options = '*';

        bundler
          .plugin(resolutions, options)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options]);
            expect(libs.sort()).to.eql(expectedExecutedLibs[options]);
            done();
          }));
      });
    });

    describe('and passing a matching package name that is a subset of another', function() {
      var options = ['lib-a'];

      it('dedupes only the matching package name, not the superset', function(done) {
        bundler
          .plugin(resolutions, options)
          .bundle(bundleCallback(function(bundledLibs) {
            expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options]);
            expect(libs.sort()).to.eql(expectedExecutedLibs[options]);
            done();
          }));
      });

      // Test to verify that calling bundle() twice consecutively works, in general.
      // No specific reason its mirroring the test above, just piggy-backing off a verified result.
      describe('and calling bundle a second time', function() {
        it('produces the same bundle as the first time', function(done) {
          bundler
            .plugin(resolutions, options)
            .bundle();

          bundler
            .bundle(bundleCallback(function(bundledLibs) {
              expect(bundledLibs.sort()).to.eql(expectedBundledLibs[options]);
              expect(libs.sort()).to.eql(expectedExecutedLibs[options]);
              done();
            }));
        });
      });
    });
  });
});
