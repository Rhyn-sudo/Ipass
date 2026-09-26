import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginHost } from './origin_validation.js';

test('localhost and 127.0.0.1 are treated as same host for local requests', () => {
    assert.equal(isSameOriginHost('http://localhost:4173', 'localhost:4173'), true);
    assert.equal(isSameOriginHost('http://127.0.0.1:4173', 'localhost:4173'), true);
    assert.equal(isSameOriginHost('http://localhost:4173', '127.0.0.1:4173'), true);
    assert.equal(isSameOriginHost('http://localhost:4173', 'example.com:4173'), false);
});
