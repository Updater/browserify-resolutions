var expect = require('chai').expect;
var browserify = require('browserify');
var resolution = require('../index');
var bundleCallback = require('./utils').bundleCallback;

describe('when bundling app that does non-main requires', function() {
  var bundler;

  // Bundle expectations
  // --------------------------
  var expectedBundledLibs = {};

  expectedBundledLibs.vanilla = [
    'lib-a-1.0.0',
    'lib-common-1.0.0'
  ].sort();

  // Execution expectations
  // --------------------------
  var expectedExecutedLibs = {};

  expectedExecutedLibs.vanilla = [
    'lib-a-1.0.0',
    'lib-common-1.0.0',
    'lib-common-1.0.0'
  ];

  beforeEach(function() {
    libs = [];
    bundler = browserify({
      entries: ['./test/non-main-require']
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
    // TODO: Allow deduping non-main requires.
    it('is not yet able to dedupe non-main requires', function(done) {
      bundler
        .plugin(resolution, ['lib-common'])
        .bundle(bundleCallback(function (bundledLibs) {
          expect(bundledLibs.sort()).to.eql(expectedBundledLibs.vanilla);
          expect(libs.sort()).to.eql(expectedExecutedLibs.vanilla);
          done();
        }));
    });
  });
});
