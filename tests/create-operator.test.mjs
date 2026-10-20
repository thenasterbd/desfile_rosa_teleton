import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperatorHandler } from '../supabase/functions/create-operator/handler.js';

function fixture(overrides = {}) {
  const calls = [];
  const client = {
    auth: {
      getUser: async token => { calls.push(['verify', token]); return overrides.invalidToken ? { error: {} } : { data: { user: { id: 'principal-id' } } }; },
      admin: {
        createUser: async data => { calls.push(['create', data]); return overrides.createError ? { error: { code: overrides.createError } } : { data: { user: { id: 'new-id' } } }; },
        deleteUser: async id => { calls.push(['delete', id]); return { error: overrides.rollbackError ? {} : null }; }
      }
    },
    from(table) {
      calls.push(['table', table]);
      return {
        select: () => table === 'operators' ? { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: overrides.inactiveOwner ? null : { user_id: 'principal-id' } }) }) }) } : ({ eq: (field, value) => {
          assert.equal(field, 'id'); assert.equal(value, 1);
          return { eq: (field, value) => {
            assert.equal(field, 'user_id'); assert.equal(value, 'principal-id');
            return { maybeSingle: async () => ({ data: overrides.nonOwner ? null : { user_id: 'principal-id' }, error: overrides.roleError ? {} : null }) };
          } };
        } }),
        insert: async data => { calls.push(['insert', table, data]); return { error: overrides.membershipError ? {} : null }; }
      };
    }
  };
  const handler = createOperatorHandler({ createClient: () => client, url: 'https://example.supabase.co', serviceKey: 'server-only-test-key', allowedOrigins: ['https://thenasterbd.github.io'] });
  const request = (body = { email: 'Nuevo@Example.com', password: 'Password12345' }, headers = {}) => handler(new Request('https://example.supabase.co/functions/v1/create-operator', {
    method: 'POST', headers: { origin: 'https://thenasterbd.github.io', authorization: 'Bearer valid-token', ...headers }, body: JSON.stringify(body)
  }));
  return { calls, request, handler };
}

test('principal creates only an operator; the supplied role is ignored', async () => {
  const { calls, request } = fixture();
  const response = await request({ email: ' Nuevo@Example.com ', password: 'Password12345', role: 'owner' });
  assert.equal(response.status, 201);
  assert.deepEqual(calls.find(c => c[0] === 'create')[1], { email: 'nuevo@example.com', password: 'Password12345', email_confirm: true });
  assert.deepEqual(calls.find(c => c[0] === 'insert'), ['insert', 'operators', { user_id: 'new-id' }]);
  assert.equal(calls.filter(c => c[0] === 'insert').length, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
for (const [name, options, headers, status] of [
  ['inactive principal', { inactiveOwner: true }, {}, 403],
  ['ordinary operator', { nonOwner: true }, {}, 403],
  ['invalid token', { invalidToken: true }, {}, 401],
  ['anonymous visitor', {}, { authorization: '' }, 401],
  ['unavailable permission table', { roleError: true }, {}, 503],
  ['unapproved origin', {}, { origin: 'https://other.example' }, 403]
]) test(`${name} cannot create accounts`, async () => {
  const { calls, request } = fixture(options);
  assert.equal((await request(undefined, headers)).status, status);
  assert.equal(calls.some(c => c[0] === 'create'), false);
});
test('invalid fields are rejected before account creation', async () => {
  for (const body of [null, {}, { email: 'bad', password: 'Password12345' }, { email: 'a@b.com', password: 'short' }, { email: 'a@b.com', password: 'x'.repeat(129) }]) {
    const { calls, request } = fixture(); assert.equal((await request(body)).status, 400);
    assert.equal(calls.some(c => c[0] === 'create'), false);
  }
});
test('duplicate email is reported without authorizing an existing account', async () => {
  const { calls, request } = fixture({ createError: 'email_exists' });
  assert.equal((await request()).status, 409); assert.equal(calls.some(c => c[0] === 'insert'), false);
});
test('failed operator authorization rolls back the new Auth account', async () => {
  const { calls, request } = fixture({ membershipError: true });
  assert.equal((await request()).status, 502); assert.deepEqual(calls.find(c => c[0] === 'delete'), ['delete', 'new-id']);
});
test('rollback failure directs the principal to check the account', async () => {
  const { request } = fixture({ membershipError: true, rollbackError: true });
  assert.match((await (await request()).json()).message, /Contacta/);
});
test('preflight works and other HTTP methods are rejected', async () => {
  const { handler } = fixture();
  assert.equal((await handler(new Request('https://example.com', { method: 'OPTIONS', headers: { origin: 'https://thenasterbd.github.io' } }))).status, 204);
  assert.equal((await handler(new Request('https://example.com'))).status, 405);
});
