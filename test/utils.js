module.exports = {
  bundleCallback: bundleCallback
};

function getBundledLibs(bundleString) {
  var bundled = [];
  var regex = /libs\.push\('(lib-.+)'\)/g;
  var matches;

  /* jshint -W084 */
  while (matches = regex.exec(bundleString)) {
    bundled.push(matches[1]);
  }

  return bundled;
  /* jshint +W084 */
}

function bundleCallback(testFunc) {
  return function(err, buf) {
    var bufferString = buf.toString();
    var bundledLibs = getBundledLibs(bufferString);
    eval(bufferString);

    return testFunc(bundledLibs);
  };
}

