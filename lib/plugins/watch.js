const Immutable = require('immutable');
const utils     = require('../utils');
const Rx        = require('rx');
const chokidar  = require('chokidar');
const debug     = require('debug')('bs:watch');
const OPT_NAME  = 'watch';

var watcherId   = 0;

/**
 * Schema for files option
 */
const FilesOption = Immutable.Record({
    match:     Immutable.List([]),
    options:   Immutable.Map({
        ignoreInitial: true
    }),
    fn:        undefined, // optional
    locator:   undefined, // optional
    namespace: 'core',
    throttle:  0,
    debounce:  0,
    delay:     0,
    active:    true,
    id: 0
});

module.exports["plugin:name"] = "Browsersync File Watcher";

/**
 * @param bs
 * @param opts
 * @param obs
 */
module.exports.initAsync = function (bs, opts, obs) {
    // bail early if no files options provided
    // or if the List is size zero
    if (
        !  bs.options.has(OPT_NAME)
        || bs.options.get(OPT_NAME).size === 0
    ) return obs.done();

    bs.watchers = bs.options
        .get(OPT_NAME)
        /**
         * For each file option, create a separate watcher (chokidar) instance
         */
        .map(item => {
            const patterns = item.get('match').toJS();

            debug(`> creating for ${patterns}`);

            const watch = chokidar.watch(patterns, item.get('options').toJS());
            /**
             * Add a flag when ready is called so that cleanups
             * can do correctly. Note: We do *NOT* wait for this ready
             * task to fire on every watcher before signalling that this
             * plugin is complete as the directory scans can take a
             * long time and should not hinder the startup of servers etc.
             */
            watch.on('ready', function () {
                debug(`+ ${patterns} now ready`);
                watch._bsReady = true;
            });

            return {
                watcher: watch,
                item: item
            };
        });

    /**
     * Now create an Observable from each watcher and merge
     * the values they emit into a single sequence
     */
    const watchers = Rx.Observable.merge(
        bs.watchers.map(watcher => {
            return watcherAsObservable(
                watcher.watcher,
                watcher.item,
                bs.options
            )
        }).toArray()) // Rx.Observable.merge needs a plain array, not a List
        .withLatestFrom(bs.options$, (event, options) => ({event, options}))
        .do(x => debug(`${x.event.event}, ${x.event.path}`))
        /**
         * Add an event id to every file changed
         */
        .scan((_, x, i) => {
            x.event._i = i;
            return x;
        }, 0)
        .share();

    /**
     * Set the bs.watchers$ property to allow outsiders to listen
     * to any events that occurs on any watcher
     */
    bs.watchers$ = watchers;

    /**
     * Handle file-watching events where the user provided
     * a custom callback function
     */
    const watchers$ = bs.watchers$
        .filter(x => x.event.item.get('fn') !== undefined)
        .do(x => {
            // call the function provided in the option
            // with the same signature as the chokidar cb
            // fn(eventName, filePath)
            x.event.item.get('fn').apply(bs, [x.event.event, x.event.path, x.event]);
        }).subscribe();

    // core watchers that cause either reloads/injections
    const core = getCoreWatchers(watchers, bs.options);

    // Listen to all changes and perform either a reload/injection
    // depending on the file type (ext)
    const core$ = core
        /**
         * Check if this watcher is enabled/disabled
         * by looking at the options object with matching id
         */
        .where(x => {
            return x.options
                .get(OPT_NAME)
                .filter(_x => _x.get('id') === x.event.id)
                .getIn([0, 'active']);
        })
        .subscribe(x => {
            // If the file that changed has a ext matching
            // one in the injectFileTypes array, attempt an injection
            if (x.options.get('injectFileTypes').contains(x.event.ext)) {
                return bs.inject(x.event);
            }

            // Otherwise, simply reload the browser
            bs.reload();
        });

    const closeWatchers = () => bs.watchers.forEach(w => w.watcher.close());
    const getReadyCount = () => bs.watchers.reduce((a, w) => w.watcher._bsReady ? a + 1 : a, 0);

    // Plugin is ready
    obs.done();

    // Return async cleanup function
    return (cb) => {

        core$.dispose();
        watchers$.dispose();

        if (getReadyCount() === bs.watchers.size) {
            closeWatchers();
            cb();
        } else {
            var int = setInterval(function () {
                if (getReadyCount() === bs.watchers.size) {
                    closeWatchers();
                    clearInterval(int);
                    cb();
                }
            }, 10);
        }
    }
};

/**
 * @param watchers
 * @param options
 * @returns {*}
 */
function getCoreWatchers (watchers, options) {

    const watchers$ = watchers
        // Filter for core namespace, undefined FN
        // and event name of 'change'
        .filter((x) =>
            x.event.namespace  === 'core' &&
            x.event.item.fn    === undefined &&
            (
                x.event.event  === 'change' ||
                x.event.event  === 'add'
            )
        );

    const debounce = options.get('watchDebounce');
    const throttle = options.get('watchThrottle');
    const delay    = options.get('watchDelay');

    debug(`Global Watch Debounce ${debounce}ms`);
    debug(`Global Watch Throttle ${throttle}ms`);
    debug(`Global Watch Delay    ${delay}ms`);

    const globalItems = [
        {
            option: 'watchDebounce',
            fnName: 'debounce'
        },
        {
            option: 'watchThrottle',
            fnName: 'throttle'
        },
        {
            option: 'watchDelay',
            fnName: 'delay'
        }
    ];

    return applyOperators(watchers$, globalItems, options);
}

/**
 * @param source
 * @param items
 * @param options
 * @returns {Observable<T>}
 */
function applyOperators (source, items, options) {
    return items.reduce((acc, item) => {
        const value = options.get(item.option);
        if (value > 0) {
            return acc[item.fnName].call(acc, value);
        }
        return acc;
    }, source);
}

/**
 * Create a single Observable sequence from a files option
 * @param {FSEventsWatchers} watcher
 * @param {FilesOption} item
 * @returns {Observable<T>|Rx.Observable<T>}
 */
function watcherAsObservable (watcher, item) {

    const watcherObservable$ = Rx.Observable.create(function (obs) {
        watcher.on('all', function (event, path) {
            obs.onNext({
                event,
                item,
                path,
                namespace : item.get('namespace'),
                parsed    : require('path').parse(path),
                ext       : require('path').extname(path).slice(1),
                basename  : require('path').basename(path),
                id        : item.get('id')
            });
        });
    });

    const individualWatcherItems = [
        {
            option: 'debounce',
            fnName: 'debounce'
        },
        {
            option: 'throttle',
            fnName: 'throttle'
        },
        {
            option: 'delay',
            fnName: 'delay'
        }
    ];

    return applyOperators(watcherObservable$, individualWatcherItems, item);
}

/**
 * @param options
 * @returns {*}
 */
module.exports.transformOptions = function (options) {

    const PATH    = ['options', OPT_NAME];
    const plugins = options.get('plugins').filter(x => x.hasIn(PATH));
    const core    = options.get(OPT_NAME) || Immutable.List([]);

    /**
     * Bail if `files` option not given in options or
     * plugins
     */
    if (!core && !plugins.size) {
        return options;
    }

    /**
     * Just process core files option if
     * no plugins registered files options
     */
    if (!plugins.size) {
        return options.set(OPT_NAME, resolveMany(core, 'core'));
    }

    /**
     * Create a List of files options for plugins
     * Set's the namespace of the watcher to match the
     * name of the plugin
     */
    const pluginFileOptions = plugins
        .map(x => resolveMany(x.getIn(['options', OPT_NAME]), x.get('name')).get(0));

    /**
     * Now merge both core & plugins files options
     */
    const coreFileOptions = resolveMany(options.get(OPT_NAME), 'core');
    return options.set(OPT_NAME, coreFileOptions.concat(pluginFileOptions));
};

/**
 * Resolve 1 or many files options depending on type
 * @param initialFilesOption
 * @param namespace
 * @returns {*}
 */
function resolveMany (initialFilesOption, namespace) {
    if (Immutable.List.isList(initialFilesOption)) {
        return initialFilesOption.map(x => createOne(x, namespace));
    }
    if (Immutable.Map.isMap(initialFilesOption)) {
        return Immutable.List([createOne(initialFilesOption, namespace)]);
    }
    if (typeof initialFilesOption === 'string') {
        return Immutable.List([createOne(initialFilesOption, namespace)]);
    }
}

/**
 * @param item
 * @returns {Cursor|List<T>|Map<K, V>|Map<string, V>|*}
 */
function createOne (item, namespace) {
    if (typeof item === 'string') {
        return new FilesOption({namespace})
            .mergeDeep({
                match: Immutable.List([item]),
                id: watcherId++
            });
    }

    return new FilesOption({namespace})
        .mergeDeep(item
            .update('match', x => Immutable.List([]).concat(x))
            .update('id', x => watcherId++)
            .update('locator', locator => {
                if (Immutable.Map.isMap(locator)) {
                    // bail if an object was already given
                    return locator;
                }
                if (utils.isRegex(locator)) {
                    return Immutable.Map(utils.serializeRegex(locator))
                }
            })
        );
}