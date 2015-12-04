'use strict';

var bs       = require('../../../');
var sinon    = require('sinon');
var assert   = require('chai').assert;

describe('sync plugin resolution', function () {
    it('accepts a plugin that has a sync init method', function (done) {
        var calls = [];
        const fn1 = () => calls.push(1);
        const fn2 = () => calls.push(2);
        bs.create({
            plugins: [
                {module: {init: fn1}},
                {module: {init: fn2}}
            ]
        }, function (err, bs) {

            var plugins = bs.options
                .get('plugins')
                .toJS();

            assert.equal(plugins.length, 2);
            assert.equal(calls[0], '1');
            assert.equal(calls[1], '2');
            bs.cleanup();
            done();
        });
    });
});