import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorFunctionError } from '../js/operator-function-errors.js';
const error = (status, body) => ({ context: new Response(JSON.stringify(body), { status }) });
test('missing deployed function has a precise activation message', async () => {
  assert.match(await operatorFunctionError(error(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }), 'fallback'), /todavía no está habilitada/);
});
test('target operator not found keeps the application message', async () => {
  assert.equal(await operatorFunctionError(error(404, { message: 'El operador ya no está disponible.' }), 'fallback'), 'El operador ya no está disponible.');
});
test('invalid session and function boot errors are translated', async () => {
  assert.match(await operatorFunctionError(error(401, { message: 'Invalid JWT' }), 'fallback'), /validar tu sesión/);
  assert.match(await operatorFunctionError(error(503, { code: 'BOOT_ERROR', message: 'Internal error' }), 'fallback'), /no está disponible/);
});
test('network and non-JSON errors retain the fallback without misdiagnosing missing deployment', async () => {
  assert.equal(await operatorFunctionError({}, 'Error de conexión'), 'Error de conexión');
  assert.equal(await operatorFunctionError({ context: new Response('bad', { status: 502 }) }, 'Error de conexión'), 'Error de conexión');
});

test('a blocked preflight can be diagnosed with a credential-free read-only request', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(url, 'https://example.com/functions/v1/create-operator');
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined);
    return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Requested function was not found' }), { status: 404 });
  };
  assert.match(await operatorFunctionError({}, 'fallback', 'https://example.com/functions/v1/create-operator', fetcher), /todavía no está habilitada/);
  assert.equal(calls, 1);
});
test('an unreachable probe does not imply that deployment is missing', async () => {
  assert.equal(await operatorFunctionError({}, 'fallback', 'https://example.com', async () => { throw new TypeError('Failed to fetch'); }), 'fallback');
});
