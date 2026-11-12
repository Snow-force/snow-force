import { authorized, HttpError, parseJson, readBody, redact, textField, verifyGitHub } from './core.mjs';
import { applyRules, audit, ingest, metrics, now, query } from './store.mjs';
import { triage } from './gateway.mjs';
import { consoleHtml, consoleJs } from './console.mjs';

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

async function gate(request, secret) {
  if (!await authorized(request, secret)) throw new HttpError(401, 'Unauthorized');
}

async function route(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === 'GET' && path === '/health') return json({ service: 'snowforce-super-agent', status: 'ok' });
  if (request.method === 'GET' && (path === '/' || path === '/console.js')) {
    return new Response(path === '/' ? consoleHtml : consoleJs, { headers: {
      'content-type': path === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    } });
  }
  if (request.method === 'POST' && path === '/webhooks/github') {
    const body = await readBody(request);
    if (!await verifyGitHub(body, request.headers.get('x-hub-signature-256'), env.GITHUB_WEBHOOK_SECRET)) throw new HttpError(401, 'Invalid signature');
    const event = parseJson(body);
    if (event.repository?.full_name !== env.GITHUB_REPOSITORY) throw new HttpError(403, 'Repository not allowed');
    if (request.headers.get('x-github-event') === 'ping') return json({ accepted: true });
    if (request.headers.get('x-github-event') !== 'issues' || event.action !== 'opened') return json({ ignored: true });
    const number = event.issue?.number;
    if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(400, 'Invalid issue');
    const item = await ingest(env, { source: 'github', key: `github:${env.GITHUB_REPOSITORY}:${number}`,
      delivery: 'github:' + textField(request.headers.get('x-github-delivery'), 128),
      title: redact(textField(event.issue.title, 200)), summary: 'GitHub issue #' + number + '. Operator must enter a sanitized technical summary before AI analysis.' });
    return json({ id: item.id, state: item.state }, 202);
  }
  if (request.method === 'POST' && path === '/api/ingest') {
    await gate(request, env.INGEST_TOKEN);
    const body = parseJson(await readBody(request));
    // Integration ingress accepts summaries only; Gmail OAuth and provider-specific signatures are separate adapters.
    const source = textField(body.source, 32);
    if (!['monitor', 'support'].includes(source)) throw new HttpError(400, 'Unsupported source');
    const key = source + ':' + textField(body.key, 180);
    const item = await ingest(env, { source, key, delivery: key, title: redact(textField(body.title, 200)), summary: redact(textField(body.summary, 4000)) });
    return json({ id: item.id }, 202);
  }
  if (path.startsWith('/runner/')) {
    await gate(request, env.RUNNER_TOKEN);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    if (path === '/runner/claim') {
      const token = crypto.randomUUID();
      const item = await query(env.DB, `UPDATE cases SET state = 'running', lease_token = ?, lease_until = ?, updated_at = ?
        WHERE id = (SELECT id FROM cases WHERE state = 'ready' ORDER BY created_at LIMIT 1)
        AND (SELECT paused FROM settings WHERE id = 1) = 0
        AND NOT EXISTS (SELECT 1 FROM cases WHERE state = 'running') RETURNING *`, token, now() + 1800000, now()).first();
      if (item) await audit(env.DB, item.id, 'runner_claimed');
      return json({ task: item });
    }
    if (path === '/runner/complete') {
      const body = parseJson(await readBody(request));
      const id = textField(body.id, 64), lease = textField(body.lease_token, 64);
      const report = redact(textField(body.report, 24000));
      const result = await query(env.DB, `UPDATE cases SET state = ?, report = ?, lease_token = NULL,
        lease_until = NULL, updated_at = ? WHERE id = ? AND state = 'running' AND lease_token = ? AND lease_until > ?`,
        body.succeeded === true ? 'review' : 'failed', report, now(), id, lease, now()).run();
      if (!result.meta.changes) throw new HttpError(409, 'Stale runner lease');
      await audit(env.DB, id, 'runner_report_received');
      return json({ saved: true });
    }
    throw new HttpError(404, 'Not found');
  }
  if (!path.startsWith('/api/')) throw new HttpError(404, 'Not found');
  await gate(request, env.ADMIN_TOKEN);
  if (request.method === 'GET' && path === '/api/overview') {
    const cases = await query(env.DB, `SELECT * FROM cases ORDER BY created_at DESC LIMIT 100`).all();
    // Never expose worker lease credentials to the console.
    return json({ usage: await metrics(env), cases: cases.results.map(({ lease_token, ...item }) => { void lease_token; return item; }) });
  }
  if (request.method === 'GET' && path === '/api/audit') return json((await query(env.DB, 'SELECT * FROM audit ORDER BY id DESC LIMIT 200').all()).results);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const body = parseJson(await readBody(request));
  if (path === '/api/pause') {
    if (typeof body.paused !== 'boolean') throw new HttpError(400, 'Expected paused boolean');
    await query(env.DB, 'UPDATE settings SET paused = ? WHERE id = 1', body.paused ? 1 : 0).run();
    await audit(env.DB, null, body.paused ? 'automation_paused' : 'automation_resumed');
    return json({ paused: body.paused });
  }
  if (path === '/api/cases') {
    const key = 'manual:' + textField(body.key, 180);
    const item = await ingest(env, { source: 'manual', key, delivery: key,
      title: redact(textField(body.title, 200)), summary: redact(textField(body.summary, 4000)) });
    await applyRules(env, item.id);
    return json({ id: item.id }, 201);
  }
  const match = /^\/api\/cases\/([a-f0-9-]{36})\/(triage|approve|resolve)$/.exec(path);
  if (!match) throw new HttpError(404, 'Not found');
  const [, id, action] = match;
  if (action === 'triage') {
    if (env.AI_ENABLED !== 'true' || !env.DEEPSEEK_API_KEY) throw new HttpError(503, 'DeepSeek is not configured or enabled');
    const result = await query(env.DB, `UPDATE cases SET summary = ?, updated_at = ? WHERE id = ? AND state = 'waiting_approval'`, redact(textField(body.summary, 4000)), now(), id).run();
    if (!result.meta.changes) throw new HttpError(409, 'Case is not awaiting approval');
    const completed = await triage(env, id);
    return json({ completed, message: completed ? 'Draft created' : 'AI paused, budget blocked, or provider failed; check audit' });
  }
  const next = action === 'approve' ? 'ready' : 'resolved';
  const result = await query(env.DB, `UPDATE cases SET state = ?, updated_at = ? WHERE id = ?
    AND state IN ('waiting_approval','review','failed')`, next, now(), id).run();
  if (!result.meta.changes) throw new HttpError(409, 'Invalid case transition');
  await audit(env.DB, id, action === 'approve' ? 'operator_approved_investigation' : 'operator_resolved');
  return json({ state: next });
}

export async function recover(env) {
  // Do not auto-run an expired Codex lease: external work could still exist. Require operator review.
  await query(env.DB, `UPDATE cases SET state = 'failed', lease_token = NULL, lease_until = NULL,
    updated_at = ? WHERE state = 'running' AND lease_until < ?`, now(), now()).run();
  await query(env.DB, `UPDATE usage_ledger SET status = 'uncertain' WHERE status = 'reserved' AND created_at < ?`, now() - 120000).run();
  await query(env.DB, `UPDATE cases SET state = 'waiting_approval', lease_until = NULL,
    updated_at = ? WHERE state = 'triaging' AND lease_until < ?`, now(), now()).run();
  const pending = await query(env.DB, `SELECT id FROM cases WHERE state = 'pending' ORDER BY created_at LIMIT 50`).all();
  for (const item of pending.results) await env.TASKS.send({ id: item.id });
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) { return json({ error: error instanceof HttpError ? error.message : 'Service unavailable' }, error instanceof HttpError ? error.status : 503); }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try { await applyRules(env, message.body.id); message.ack(); }
      catch { message.retry({ delaySeconds: 30 * Math.pow(2, Math.min(message.attempts, 4)) }); }
    }
  },
  async scheduled(_event, env) { await recover(env); },
};
