import test from 'node:test';
import assert from 'node:assert/strict';
import { manageOperatorsHandler } from '../supabase/functions/manage-operators/handler.js';
const ownerId = '00000000-0000-4000-8000-000000000001', userId = '00000000-0000-4000-8000-000000000002';
function fixture(options = {}) {
  const calls = [];
  const client = {
    auth: {
      getUser: async () => options.invalidToken ? { error: {} } : { data: { user: { id: ownerId } } },
      admin: {
        getUserById: async id => ({ data: { user: { id, email: id === ownerId ? 'owner@example.com' : 'operator@example.com' } } }),
        updateUserById: async (id, fields) => { calls.push(['auth', id, fields]); return { error: options.authError ? {} : null }; }
      }
    },
    from(table) {
      const filters = {};
      const query = {
        select() { return query; }, eq(field, value) { filters[field] = value; return query; }, order() { return query; },
        async maybeSingle() {
          if (table === 'user_administration') return { data: options.nonOwner ? null : { user_id: ownerId } };
          if (filters.user_id === ownerId) return { data: options.inactiveOwner ? null : { user_id: ownerId } };
          return { data: options.missingTarget ? null : { user_id: userId, is_active: true } };
        },
        async range(start, end) {
          calls.push(['range', start, end]);
          return { data: [{ user_id: ownerId, is_active: true }, { user_id: userId, is_active: false }] };
        },
        update(fields) { calls.push(['db', fields]); return { eq: async (field, id) => { calls.push(['target', field, id]); return { error: options.dbError ? {} : null }; } }; }
      }; return query;
    }
  };
  const handler = manageOperatorsHandler({ createClient: () => client, url: 'https://example.com', serviceKey: 'server-test-key', allowedOrigins: ['https://thenasterbd.github.io'] });
  const request = body => handler(new Request('https://example.com', { method: 'POST', headers: { authorization: 'Bearer valid-token', origin: 'https://thenasterbd.github.io' }, body: JSON.stringify(body) }));
  return { request, calls };
}
test('only principal can list operators and only safe fields are returned', async () => {
  const { request, calls } = fixture(); const response = await request({ action: 'list', page: 2 });
  assert.equal(response.status, 200); const data = await response.json();
  assert.deepEqual(data.users[1], { id: userId, email: 'operator@example.com', active: false, isPrincipal: false });
  assert.equal(data.users[0].isPrincipal, true); assert.deepEqual(calls, [['range', 20, 40]]);
});
for (const options of [{ nonOwner: true }, { inactiveOwner: true }, { invalidToken: true }]) test(`rejects unauthorized management ${JSON.stringify(options)}`, async () => {
  const { request, calls } = fixture(options); const response = await request({ action: 'disable', userId });
  assert([401, 403].includes(response.status)); assert.equal(calls.length, 0);
});
test('cannot change principal password or disable principal', async () => {
  for (const action of ['disable', 'enable', 'password']) {
    const { request, calls } = fixture(); assert.equal((await request({ action, userId: ownerId, password: 'Password12345' })).status, 403); assert.equal(calls.length, 0);
  }
});
test('disable revokes database permission before banning Auth', async () => {
  const { request, calls } = fixture(); assert.equal((await request({ action: 'disable', userId })).status, 200);
  assert.deepEqual(calls[0], ['db', { is_active: false }]); assert.deepEqual(calls.at(-1), ['auth', userId, { ban_duration: '876000h' }]);
});
test('disable stops on failed permission revocation', async () => {
  const { request, calls } = fixture({ dbError: true }); assert.equal((await request({ action: 'disable', userId })).status, 502); assert(!calls.some(c => c[0] === 'auth'));
});
test('ban failure reports that event permissions are still revoked', async () => {
  const { request } = fixture({ authError: true }); const response = await request({ action: 'disable', userId }); assert.equal(response.status, 200); assert.match((await response.json()).message, /No se pudo bloquear/);
});
test('enable unbans before granting database access and never grants principal role', async () => {
  const { request, calls } = fixture(); assert.equal((await request({ action: 'enable', userId })).status, 200);
  assert.deepEqual(calls[0], ['auth', userId, { ban_duration: 'none' }]); assert.deepEqual(calls[1], ['db', { is_active: true }]);
});
test('failed unban cannot restore event access', async () => {
  const { request, calls } = fixture({ authError: true }); assert.equal((await request({ action: 'enable', userId })).status, 502); assert(!calls.some(c => c[0] === 'db'));
});
test('password update accepts no role or active status from client', async () => {
  const { request, calls } = fixture(); assert.equal((await request({ action: 'password', userId, password: 'Password12345', role: 'owner', is_active: true })).status, 200);
  assert.deepEqual(calls, [['auth', userId, { password: 'Password12345' }]]);
});
test('rejects short passwords, missing target, invalid UUID and invalid pages', async () => {
  for (const body of [{ action: 'password', userId, password: 'short' }, { action: 'disable', userId: 'bad' }, { action: 'list', page: 0 }, { action: 'list', page: 1.5 }]) {
    const { request, calls } = fixture(); assert.equal((await request(body)).status, 400); assert.equal(calls.length, 0);
  }
  const { request } = fixture({ missingTarget: true }); assert.equal((await request({ action: 'disable', userId })).status, 404);
});
