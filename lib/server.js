var fs = require('fs');
var config = require('./config');
var path = require('path');
var files = require('./files');
var middleware = require('./middleware');
var connect = require('connect');
var http = require('http');
var https = require('https');

module.exports.create = function (options) {

    var app = connect();
    var mw  = middleware.getMiddleware(options);

    mw.middleware.forEach((mw)  => {
        if (mw.path.length) {
            return app.use(mw.path, mw.fn);
        }
        app.use(mw.fn);
    });

    var output       = getServer(app, options);
    output.clientJs  = mw.clientScript.clientJs;
    output.snippetMw = mw.snippetMw;

    return output;
};

/**
 * @param app
 * @param options
 * @returns {{server, app: *}}
 */
function getServer (app, options) {
    return {
        server: (function () {
            if (options.get('scheme') === 'https') {
                var pfxPath = options.getIn(['https', 'pfx']);
                return pfxPath ?
                    https.createServer(getPFX(pfxPath), app) :
                    https.createServer(getKeyAndCert(options), app);
            }
            return http.createServer(app);
        })(),
        app: app
    };
}

/**
 * @param options
 * @returns {{key, cert}}
 */
function getKeyAndCert (options) {
    return {
        key:  fs.readFileSync(options.getIn(['https', 'key'])  || config.certs.key),
        cert: fs.readFileSync(options.getIn(['https', 'cert']) || config.certs.cert)
    };
}

/**
 * @param filePath
 * @returns {{pfx}}
 */
function getPFX (filePath) {
    return {
        pfx: fs.readFileSync(filePath)
    };
}