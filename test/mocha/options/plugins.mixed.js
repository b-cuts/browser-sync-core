'use strict';

var bs       = require('../../../');
var sinon    = require('sinon');
var assert   = require('chai').assert;

describe('async & sync mixed plugin resolution in correct order', function () {
    it('accepts both async and sync, calling them in correct order', function (done) {
        var calls = [];

        var fn1 = function() { calls.push('1') };
        var fn3 = function() { calls.push('3') };

        bs.create({
            plugins: [
                {
                    module: {init: fn1},
                    active: true
                },
                {
                    module: {initAsync: function(bs, opts, cb) {
                        setTimeout(function() {
                            calls.push('2');
                            cb.done()
                        }, 200);
                    }}
                },
                {
                    module: {init: fn3}
                },
                {
                    module: {initAsync: function(bs, opts, cb) {
                        setTimeout(function() {
                            calls.push('4');
                            cb.done()
                        }, 200);
                    }}
                }
            ]
        }).subscribe(function (bs) {

            var plugins = bs.options
                .get('plugins')
                .filter(function(x) { return !x.get('internal')});

            assert.equal(plugins.size, 4);
            assert.equal(calls[0], '1');
            assert.equal(calls[1], '2');
            assert.equal(calls[2], '3');
            assert.equal(calls[3], '4');

            bs.cleanup();
            done();
        });
    });
    it('always loads core plugins before user plugins', function (done) {
        bs.create({
            watch: 'test',
            serveStatic: 'test/fixtures',
            plugins: [
                function (bs) {
                    assert.ok(bs.setClientOption);
                }
            ]
        }).subscribe(function (bs) {
            bs.cleanup();
            done();
        });
    });
});
