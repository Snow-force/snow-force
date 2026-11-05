// Isolated multi-connection PostgreSQL acceptance. No .env files or remote services.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'services/commerce/package.json'));
const { Client } = require('pg');
const bin = process.env.LODGING_TEST_PG_BIN ?? path.join(root, '.cache/tooling/postgresql/pgsql/bin');
const directory = path.join(root, '.cache', `lodging-inventory-${randomUUID()}`);
mkdirSync(directory, { recursive: true });
const pgdata = path.join(directory, 'pgdata');
const port = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address(); server.close(() => resolve(address.port));
  });
});
function run(name, args) {
  const result = spawnSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
    { encoding: 'utf8', windowsHide: true, timeout: 45000 });
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
}
const config = { host: '127.0.0.1', port, user: 'lodging_test', database: 'postgres' };
assert.equal(config.host, '127.0.0.1');
run('initdb', ['-D', pgdata, '-U', config.user, '-A', 'trust', '--encoding=UTF8', '--locale=C']);
run('pg_ctl', ['-D', pgdata, '-l', path.join(directory, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start']);
const clients = [];
async function connect() {
  const client = new Client(config); await client.connect(); clients.push(client); return client;
}
const checks = [];
async function check(name, work) { await work(); checks.push(name); console.log(`PASS ${name}`); }
const actor = '11111111-1111-4111-8111-111111111111';
const rpc = 'select reserve_lodging_inventory($1,$2,$3,$4,$5,$6,$7,$8,$9) id';
try {
  const db = await connect();
  await db.query("create role anon; create role authenticated; create role service_role bypassrls; create table events(slug text primary key); insert into events values('trip-a'),('trip-b');");
  for (const file of ['20261104201624_event_lodging_catalog.sql', '20261105035034_event_lodging_inventory.sql']) {
    await db.query(readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  const hotel = (await db.query(`insert into lodging_properties(name,address,timezone,updated_by) values('{"en":"Test","zh":"测试"}','Test','America/Los_Angeles',$1) returning id`, [actor])).rows[0].id;
  const room = (await db.query(`insert into lodging_room_types(property_id,name,beds,max_guests,updated_by) values($1,'{"en":"Room","zh":"房"}','{"en":"Bed","zh":"床"}',4,$2) returning id`, [hotel, actor])).rows[0].id;
  const unit = (await db.query("insert into lodging_units(room_type_id,internal_code,supply_reference,continuity_confirmed,updated_by) values($1,'A','Test contract',true,$2) returning id", [room, actor])).rows[0].id;
  await db.query("insert into lodging_unit_nights(unit_id,stay_date,updated_by) select $1,day::date,$2 from generate_series('2027-03-13'::date,'2027-03-16'::date,'1 day') day", [unit, actor]);
  const offers = (await db.query(`insert into event_lodging_offers(event_slug,room_type_id,check_in,check_out,nightly_amount,mandatory_fee,tax_basis_points,policy,updated_by) select slug,$1,'2027-03-13','2027-03-15',10000,0,0,'{"en":"Terms","zh":"条款"}',$2 from events returning id`, [room, actor])).rows.map(r => r.id);
  const racers = await Promise.all(Array.from({ length: 12 }, () => connect()));
  await Promise.all(racers.map(c => c.query("set role service_role; set statement_timeout='10s'")));
  function args(key = randomUUID(), kind = 'hold', offer = null) {
    return [room, '2027-03-13', '2027-03-15', 1, actor, key, kind, 'Concurrent test', offer];
  }
  let winner;
  await check('12 cross-event/manual contenders allocate the last continuous unit exactly once', async () => {
    const results = await Promise.allSettled(racers.map((c, i) => c.query(rpc, args(randomUUID(), i % 3 === 0 ? 'manual' : 'hold', offers[i % 2]))));
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 11);
    for (const r of failures) assert.match(r.reason.message, /Insufficient continuous inventory/);
    winner = successes[0].value.rows[0].id;
    assert.equal((await db.query('select count(*)::int count from lodging_unit_nights where hold_id=$1', [winner])).rows[0].count, 2);
    assert.equal((await db.query('select count(*)::int count from lodging_inventory_holds')).rows[0].count, 1);
  });
  await db.query("update lodging_inventory_holds set expires_at=case when kind='hold' then now()-interval '1 hour' else null end where id=$1", [winner]);
  await db.query("select release_lodging_inventory($1,$2,'Acceptance reset')", [winner, actor]);
  await check('concurrent retries reuse one hold and one allocation', async () => {
    const key = randomUUID();
    const results = await Promise.all(racers.map(c => c.query(rpc, args(key))));
    const ids = new Set(results.map(r => r.rows[0].id));
    assert.equal(ids.size, 1);
    winner = results[0].rows[0].id;
    assert.equal((await db.query('select count(*)::int count from lodging_unit_nights where hold_id=$1', [winner])).rows[0].count, 2);
  });
  await check('payment state and release serialize on the room lock', async () => {
    await db.query("update lodging_inventory_holds set expires_at=now()-interval '1 hour' where id=$1", [winner]);
    await racers[0].query('begin');
    await racers[0].query('select id from lodging_room_types where id=$1 for update', [room]);
    await racers[0].query("update lodging_inventory_holds set payment_state='unknown' where id=$1", [winner]);
    const releasing = racers[1].query("select release_lodging_inventory($1,$2,'Expiry cleanup')", [winner, actor]);
    // Attach the rejection handler before the locking transaction is committed.
    const rejected = assert.rejects(releasing, /Payment reconciliation required/);
    await racers[0].query('commit');
    await rejected;
    assert.equal((await db.query('select count(*)::int count from lodging_unit_nights where hold_id=$1', [winner])).rows[0].count, 2);
  });
  await db.query("update lodging_inventory_holds set payment_state='unpaid_terminal' where id=$1", [winner]);
  await db.query("select release_lodging_inventory($1,$2,'Reconciled unpaid')", [winner, actor]);
  await check('staff supply reduction cannot race through an allocated night', async () => {
    await racers[0].query('begin');
    winner = (await racers[0].query(rpc, args())).rows[0].id;
    const blocking = racers[1].query("update lodging_unit_nights set blocked=true where unit_id=$1 and stay_date='2027-03-13'", [unit]);
    const rejected = assert.rejects(blocking);
    await racers[0].query('commit');
    await rejected;
    assert.equal((await db.query('select count(*)::int count from lodging_unit_nights where hold_id=$1', [winner])).rows[0].count, 2);
  });
  await check('RLS, grants and function permissions remain private; sales remain disabled', async () => {
    for (const role of ['anon', 'authenticated']) {
      await racers[0].query(`set role ${role}`);
      await assert.rejects(racers[0].query('select * from lodging_unit_nights'), /permission denied/);
      await assert.rejects(racers[0].query(rpc, args()), /permission denied/);
    }
    await assert.rejects(db.query('update event_lodging_offers set sales_enabled=true'), /check constraint/);
    const rows = (await db.query("select relrowsecurity from pg_class where oid in ('lodging_units'::regclass,'lodging_unit_nights'::regclass,'lodging_inventory_holds'::regclass)")).rows;
    assert.equal(rows.length, 3); assert.ok(rows.every(r => r.relrowsecurity));
  });
  const report = { generatedAt: new Date().toISOString(), target: 'isolated localhost PostgreSQL', productionWrites: 0, checks };
  mkdirSync(path.join(root, 'output'), { recursive: true });
  writeFileSync(path.join(root, 'output/lodging-inventory-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${checks.length} PostgreSQL acceptance groups passed; production writes: 0`);
} finally {
  await Promise.allSettled(clients.map(c => c.end()));
  run('pg_ctl', ['-D', pgdata, '-m', 'fast', '-w', 'stop']);
}
