var expect = require('chai').expect;
var browserify = require('browserify');
var resolution = require('../index');

describe('when bundling app-a', function() {
  var allLibs = ['lib-a-1.0.0', 'lib-a-2.0.0', 'lib-b-1.0.0', 'lib-b-2.0.0', 'lib-c-1.0.0'];
  var bundler;

  beforeEach(function() {
    libs = [];
    bundler = browserify({
      entries: ['./test/app-a']
    });
  });

  describe('using vanilla browserify', function() {
    it('only dedupes identical sources', function(done) {
      bundler
        .bundle(function(err, buf) {
          eval(buf.toString());
          expect(libs).to.eql(allLibs);
          done();
        });
    });
  });

  describe('using browserify-resolution', function() {
    describe('and not passing options', function() {
      it('is vanilla dedupe', function(done) {
        bundler
          .plugin(resolution, ['lib-z'])
          .bundle(function(err, buf) {
            eval(buf.toString());
            expect(libs).to.eql(allLibs);
            done();
          });
      });
    });

    describe('and passing options', function() {
      it('dedupes a matching package name', function(done) {
        bundler
          .plugin(resolution, ['lib-a'])
          .bundle(function(err, buf) {
            eval(buf.toString());
            expect(libs).to.eql(['lib-a-1.0.0', 'lib-b-1.0.0', 'lib-b-2.0.0', 'lib-c-1.0.0']);
            done();
          });
      });

      it('dedupes multiple package names', function(done) {
        bundler
          .plugin(resolution, ['lib-a', 'lib-b'])
          .bundle(function(err, buf) {
            eval(buf.toString());
            expect(libs).to.eql(['lib-a-1.0.0', 'lib-b-1.0.0', 'lib-c-1.0.0']);
            done();
          });
      });

      it('dedupes all package names if passed *', function(done) {
        bundler
          .plugin(resolution, '*')
          .bundle(function(err, buf) {
            eval(buf.toString());
            expect(libs).to.eql(['lib-a-1.0.0', 'lib-b-1.0.0', 'lib-c-1.0.0']);
            done();
          });
      });
    });
  });
});
