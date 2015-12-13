'use strict';

const assert  = require('chai').assert;
const bs      = require('../../../');
const fromJS  = require('immutable').fromJS;
const List    = require('immutable').List;
const watcher = require('../../../lib/plugins/watcher');

describe('uses file-watcher plugin', function () {
    it('accepts zero file options', function () {
        const actual = watcher.transformOptions(fromJS({}));
        assert.deepEqual(actual.get('files'), undefined);
    });
    it('accepts array of objects', function () {

        const actual = watcher.transformOptions(fromJS({
            files: [
                {match: '*.html'},
                {match: ['*.css', 'templates/*.jade']}
            ]
        }));

        const first = actual.getIn(['files', 0]);
        assert.isTrue(List.isList(first.getIn(['match'])));
        assert.equal(first.getIn(['match', 0]), '*.html');
        const second = actual.getIn(['files', 1]);
        assert.isTrue(List.isList(second.getIn(['match'])));
        assert.equal(second.getIn(['match', 0]), '*.css');
        assert.equal(second.getIn(['match', 1]), 'templates/*.jade');
        assert.equal(second.getIn(['namespace']), 'core');
    });
    it('accepts array of strings', function () {

        const actual = watcher.transformOptions(fromJS({
            files: [
                '*.html',
                '*.css'
            ]
        }));

        const first  = actual.getIn(['files', 0]);
        const second = actual.getIn(['files', 1]);
        assert.isTrue(List.isList(first.getIn(['match'])));
        assert.equal(first.getIn(['match', 0]), '*.html');
        assert.equal(second.getIn(['match', 0]), '*.css');
    });
    it('accepts single string', function () {

        const actual = watcher.transformOptions(fromJS({
            files: '*.html'
        }));

        const first  = actual.getIn(['files', 0]);
        assert.isTrue(List.isList(first.getIn(['match'])));
        assert.equal(first.getIn(['match', 0]), '*.html');
    });
    it('accepts single Object with match as string', function () {

        const actual = watcher.transformOptions(fromJS({
            files: {
                match: '*.html'
            }
        }));

        const first  = actual.getIn(['files', 0]);
        assert.isTrue(List.isList(first.getIn(['match'])));
        assert.equal(first.getIn(['match', 0]), '*.html');
    });
    it('accepts single Object with array of strings', function () {

        const actual = watcher.transformOptions(fromJS({
            files: {
                match: ['*.html', '*.css']
            }
        }));

        const first  = actual.getIn(['files', 0]);
        assert.isTrue(List.isList(first.getIn(['match'])));
        assert.equal(first.getIn(['match', 0]), '*.html');
        assert.equal(first.getIn(['match', 1]), '*.css');
    });
});