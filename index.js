var _         = require('lodash');
var through   = require('through2');
var join      = require('path').join;
var toString  = Object.prototype.toString;

// Exports
// ________________________

exports = module.exports =

  /**
   * Entry point for the two plugins that comprise browserify-resolutions.
   * See below for detailed write-ups on each.
   *
   * @param  {Object} bundler Browserify instance.
   * @param  {Object|Array<String>|String} packageMatcher List of modules to resolve a version for or
   *                                       "*" to attempt to resolve all.
   * @return {Object} Browserify instance.
   */
  function(bundler, packageMatcher) {
    packageMatcher = parseOptions(
      toString.call(packageMatcher) === '[object Object]' ? packageMatcher._ : packageMatcher
    );

    function applyPlugins() {
      var options = {
        deduped: {},
        resolved: {},
        packageMatcher: packageMatcher
      };

      return bundler
        .plugin(dedupeCache, options)
        .plugin(dedupeResolutions, options);
    }

    // Must re-attach plugins every time Browserify `reset`s as a new pipeline is created.
    bundler.on('reset', applyPlugins);

    return applyPlugins();
  };

  function parseOptions(options) {
    if(options === '*') {
      return options;
    } else if (_.isArray(options) && options.length === 1 && options[0] === '*') {
      return options[0];
    } else if(_.isString(options)) {
      return [options];
    } else if(!_.isArray(options)) {
      return [];
    } else {
      return options;
    }
  }

// Plugin implementations
// ________________________

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
   */
  function dedupeCache(bundler, options) {
    var resolved = options.resolved;
    var deduped = options.deduped;

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
   */
  function dedupeResolutions(bundler, options) {
    var modules = {};
    var deps    = {};
    var index   = {};
    var rows    = [];

    var resolved        = options.resolved;
    var deduped         = options.deduped;
    var packageMatcher  = options.packageMatcher;
    var packageCache    = bundler._options.packageCache;

    bundler.pipeline.on('package', packageListener);

    function packageListener(package) {
      if (isResolvablePackage(package)) {
        if (isCachedPackage(package)) {
          groupByPackage(package, getMain(package));
        } else {
          bundler.pipeline.once('file', function(file) {
            if(isMain(package, file)) {
              groupByPackage(package, file);
            }
          });
        }
      }

      function isResolvablePackage(package) {
        return package.main && package.name &&
          (packageMatcher.indexOf(package.name) !== -1 || packageMatcher === '*');
      }

      function isCachedPackage(package) {
        var packagePath = join(package.__dirname, 'package.json');
        return packageCache && packageCache.hasOwnProperty(packagePath);
      }

      // Group all `main`s by their package name.
      function groupByPackage(package, file) {
        modules[package.name] = modules[package.name] || [];
        modules[package.name].push(file);

        // Flag to grab these dependencies when available in our 'deps' stream handler.
        deps[file] = true;
      }

      function isMain(package, file) {
        return getMain(package) === file;
      }

      function getMain(package) {
        return join(package.__dirname, package.main);
      }
    }

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
            var resolvedSource;

            if (sources.length < 2) {
              // Found no dupes, bail.
              return;
            }

            // Resolve the most shallow package (in terms of path length) as the "original".
            // Otherwise, the bundle may be non-deterministic as the order of module-deps's
            // package traversal currently isn't dependable.
            // TODO?: Allow choosing a specific package version, but that's more difficult.
            sources = _.sortBy(sources, 'length');
            resolvedSource = sources.shift();
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
                var resolvedDependency = deps[resolved][id];
                // We might have already picked up this dependency as a dupe.
                // Deduping to a dependency of the original could cause a circular reference.
                // A resolved dependency is "false" if that module was externalized via browserify.external.
                if (!deduped[file] && resolvedDependency !== false) {
                  deduped[file] = resolvedDependency;
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
          // Array of ids for files that we're treating as originals.
          var originals = _(deduped)
            .values()
            .concat(_.keys(resolved))
            .unique()
            .value();

          _.each(rows, function(row) {
            var file = row.file;

            if (deduped[file]) {
              row.dedupe = deduped[file];
              row.dedupeIndex = index[deduped[file]];
            } else if (originals.indexOf(file) !== -1) {
              // Prevent Browserify's default dedupe algorithm from creating circular dependencies
              // by not allowing it to dedupe files which we're considering "originals".
              delete row.dedupe;
              delete row.dedupeIndex;
            }

            this.push(row);
          }, this);

          cb();
        }));

      return bundler;
  }
