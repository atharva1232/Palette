import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePattern } from './patterns.mjs';

const draft = { name: 'My arches', author: 'Demo', style: 'Arches', base: '#fff0ee', ink: '#713343', scale: 32 };
test('rejects unsafe styles, invalid colours, scale, and empty names', () => {
  assert.equal(validatePattern({ ...draft, style: 'url(https://example.com)' }), null);
  assert.equal(validatePattern({ ...draft, base: 'red; background: url(x)' }), null);
  assert.equal(validatePattern({ ...draft, scale: 1000 }), null);
  assert.equal(validatePattern({ ...draft, name: '   ' }), null);
  assert.equal(validatePattern(null), null);
  for (const style of ['Arches', 'Scallops', 'Diamonds', 'Crosshatch', 'Petals', 'Chevron']) {
    assert.equal(validatePattern({ ...draft, style }).style, style);
  }
});
