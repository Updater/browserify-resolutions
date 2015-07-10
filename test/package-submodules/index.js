module.exports = (function() {
  require('lib-a');
  require('lib-submodules/module-a/module-a');
  require('lib-submodules/module-b/module-b');
})();
