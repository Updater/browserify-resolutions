var _         = require('lodash');
var through   = require('through2');

var resolved;
var deduped;

exports = module.exports =

  function(bundler, options) {
    options = parseOptions(options);

    resolved = {};
    deduped = {};

    return bundler
      .plugin(dedupeCache)
      .plugin(dedupeResolutions, options);
  };

  exports.dedupeCache = dedupeCache;
  exports.dedupeResolutions = dedupeResolutions;

  function parseOptions(options) {
    if(options === '*') {
      return options;
    }
    else if(_.isString(options)) {
      return [options];
    } else if(!_.isArray(options)) {
      return [];
    } else {
      return options;
    }
  }

  /**
   * Custom Browserify deduper that exports the already instantiated module instead of
   * reinstantiating it like the regular Browserify deduper does. This is more in line
   * with how we'd expect `require` to work, caching the first result for subsequent calls.
   *
   * Solves: Libraries like Angular executing multiple times even if there's only a single
   * copy included in the bundle. Fortunately Angular warns us when this happens.
   *
   * Note: For safety, we only apply caching if the module dependencies are either all dupes too
   * (or has no dependencies). Even if two source file are identical, they could be requiring
   * different versions of the same dependencies. Case in point, Angular's CJS entry point index.js,
   * basically a shim that `require`s the main Angular source. This shim module will likely stay
   * identical for many Angular versions, while the actual source is different for all versions.
   *
   * E.g.: If we have two or more Angular versions bundled, their `index.js`s are likely indentical
   * and will be deduped. If we cached `index.js`, all `require('angular')`s will then return the same
   * Angular version; the one associated with the first `index.js` that the deduper comes across.
   * The bundle would still include multiple Angular versions since `angular.js`, the main source,
   * is different between all versions and not deduped.
   *
   * Note II: This method otherwise mimics Browserify's own to make sure nothing breaks.
   *
   * @param  {Object} bundler Browserify instance.
   */
  function dedupeCache(bundler) {
    bundler.pipeline.get('dedupe')
      .splice(0, 1, through.obj(function(row, enc, next) {
        var id = row.dedupe && !row.dedupeIndex ? row.dedupe : row.dedupeIndex;
        var stringId;

        if (id) {
          stringId = JSON.stringify(id);


          // For safety, only cache modules which dependencies are also all duped (or it has none).
          if (resolved[row.dedupe] && _.values(row.deps).every(isDuped)) {
            row.source = 'module.exports = require(' + stringId + ');';
          } else {
            // Default browserify dedupe.
            row.source = 'arguments[4][' + stringId + '][0].apply(exports,arguments)';
          }

          row.nomap = true;

          if (row.dedupeIndex && row.indexDeps) {
            row.indexDeps.dup = row.dedupeIndex;
          }
        }

        this.push(row);
        next();
      }));

    function isDuped(id) {
      return !!deduped[id];
    }

    return bundler;
  }

  /**
   * "Bower resolutions" for Browserify... sort of. Browserify/`npm dedupe` currently only dedupes
   * modules that are exactly identical, i.e. by checksum or version number. That's fine for Node,
   * but not great for the browser where we try to create the slimmest possible packages. If a bundle's
   * dependencies include multiple versions of the same module, Browserify will bundle them all anyway.
   * If the duplicated modules include large libraries like Angular, it could balloon the bundle's size.
   *
   * This plugin dedupes modules passed in options, ensuring there is only one version bundled.
   * Currently, the given version is the first one that Browserify parses. Typically, that is the desired one.
   * TODO: Allow choosing a specific module version to bundle.
   *
   * @param  {Object} bundler Browserify instance.
   * @param  {Array/String}  options List of modules to resolve a version for or "*" to attempt to resolve all.
   */
  function dedupeResolutions(bundler, options) {
    var modules = {};
    var deps = {};
    var index = {};
    var rows = [];

    bundler.pipeline.on('package', function(package) {
      var name = package.name;

      // Does this package represent the module we're trying to resolve a version for?
      if (name && (options.indexOf(name) !== -1 || options === '*')) {
        // Assume (safely?) that the first file emitted after a package is that package's `main`.
        bundler.pipeline.once('file', function(file) {
          modules[name] = modules[name] || [];
          modules[name].push(file);

          // Flag to grab these dependencies when available in our 'deps' stream handler.
          deps[file] = true;
        });
      }
    });

    bundler.pipeline.get('deps')
      .push(through.obj(
        function write(row, enc, next) {
          var file = row.file;

          // Store a reference to these dependencies as we want to try to dedupe them later.
          if (deps[file]) {
            deps[file] = row.deps;
          }

          this.push(row);
          next();
        },
        function end(cb) {
          _.each(modules, function(sources) {
            if (sources.length < 2) {
              // Found no dupes, bail.
              return;
            }

            // Let the first package we come across determine the version we resolve for.
            // TODO?: Allow choosing a version, but that's more difficult.
            var resolvedSource = sources.shift();
            resolved[resolvedSource] = true;

            // Dedupe the remaining sources
            sources.forEach(function(source) {
              deduped[source] = resolvedSource;
            });
          });

          // Dedupe the dependencies of any deduped modules.
          // If we don't do this, we may end up with orphaned code in our bundle.
          // TODO: Deduped modules with dependency differences could be problematic.
          _.each(deduped, function(resolved, dupe) {
            if (resolved) {
              _.each(deps[dupe], function(file, id) {
                // We might have already picked up this dependency as a dupe.
                // Deduping to a dependency of the original could cause a circular reference.
                if (!deduped[file]) {
                  deduped[file] = deps[resolved][id];
                }
              });
            }
          });

          cb();
        }));

    // Browserify dedupes within the "sort" label. Here we mimic it with the results of our own deduping.
    bundler.pipeline.get('sort')
      .push(through.obj(
        function write(row, enc, next) {
          // Collect all row indexes added by Browserify's in the "sort" label to correctly populate dedupeIndex.
          index[row.id] = row.index;
          rows.push(row);
          next();
        },
        function end(cb) {
          _.each(rows, function(row) {
            var file = row.file;

            if (deduped[file]) {
              row.dedupe = deduped[file];
              row.dedupeIndex = index[deduped[file]];
            } else if (resolved[file]) {
              // If we deemed this file the "original", remove any dedupe info Browserify's default algorithm
              // might have set to avoid circular references.
              delete row.dedupe;
              delete row.dedupeIndex;
            }

            this.push(row);
          }, this);

          cb();
        }));

      return bundler;
  }
