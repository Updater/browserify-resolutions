var expect = require('chai').expect;
var browserify = require('browserify');
var resolution = require('../index');
var bundleCallback = require('./utils').bundleCallback;

describe('when bundling app that does non-main requires', function() {
  var bundler;

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
          expect(bundledLibs.sort()).to.eql(['lib-a-1.0.0', 'lib-common-1.0.0']);
          done();
        }));
    });
  });

  it('dedupes package names', function(done) {
    bundler
      .plugin(resolution, ['lib-common'])
      .bundle(bundleCallback(function (bundledLibs) {
        expect(bundledLibs).to.eql(['lib-a-1.0.0', 'lib-common-1.0.0']);
        done();
      }));
  });
});
