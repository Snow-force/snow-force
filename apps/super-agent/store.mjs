import { positiveInteger, rules } from './core.mjs';

export const now = () => Date.now();
export const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const audit = (db, id, action) => query(db, 'INSERT INTO audit(case_id, action, created_at) VALUES (?, ?, ?)', id, action, now()).run();

export async function ingest(env, event) {
  const id = crypto.randomUUID(), time = now();
  // A stable source key deduplicates GitHub deliveries across re-deliveries and later issue edits.
  await query(env.DB, `INSERT OR IGNORE INTO cases(id, source, external_key, title, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, id, event.source, event.key, event.title, event.summary, time, time).run();
  const item = await query(env.DB, 'SELECT * FROM cases WHERE external_key = ?', event.key).first();
  await query(env.DB, 'INSERT OR IGNORE INTO deliveries(id, case_id, received_at) VALUES (?, ?, ?)', event.delivery, item.id, time).run();
  // Durable outbox: pending cases remain discoverable by cron if queue send fails.
  try { if (item.state === 'pending') await env.TASKS.send({ id: item.id }); } catch { /* cron recovers */ }
  return item;
}

export async function applyRules(env, id) {
  const item = await query(env.DB, 'SELECT * FROM cases WHERE id = ?', id).first();
  if (!item || item.state !== 'pending') return;
  const decision = rules(item.title);
  await query(env.DB, `UPDATE cases SET category = ?, priority = ?, state = 'waiting_approval', updated_at = ?
    WHERE id = ? AND state = 'pending'`, decision.category, decision.priority, now(), id).run();
}

export async function reserve(env, caseId, cost) {
  const month = new Date().toISOString().slice(0, 7);
  const monthly = positiveInteger(env.MONTHLY_BUDGET_MICRO_USD, 5_000_000);
  const perCase = positiveInteger(env.CASE_BUDGET_MICRO_USD, 50_000);
  const id = crypto.randomUUID();
  // This single SQLite write is the shared budget lock. No read-then-write race.
  // Charge the full reservation up front; unknown/time-out outcomes retain it.
  const result = await query(env.DB, `INSERT INTO usage_ledger
    (id, case_id, month, model, agent, reserved_micro_usd, charged_micro_usd, status, created_at)
    SELECT ?, ?, ?, 'deepseek-flash', 'router-support', ?, ?, 'reserved', ?
    WHERE (SELECT paused FROM settings WHERE id = 1) = 0
    AND ? + (SELECT COALESCE(SUM(charged_micro_usd),0) FROM usage_ledger WHERE month = ?) <= ?
    AND ? + (SELECT COALESCE(SUM(charged_micro_usd),0) FROM usage_ledger WHERE case_id = ?) <= ?
    AND (SELECT COUNT(*) FROM usage_ledger WHERE status = 'reserved') < 1`,
    id, caseId, month, cost, cost, now(), cost, month, Math.floor(monthly * 0.8), cost, caseId, perCase).run();
  return result.meta.changes === 1 ? id : null;
}

export async function metrics(env) {
  const month = new Date().toISOString().slice(0, 7);
  const daily = new Date().toISOString().slice(0, 10);
  const ledger = await query(env.DB, `SELECT month, model, agent, COUNT(*) AS calls,
    SUM(charged_micro_usd) AS cost_micro_usd, SUM(input_tokens) AS input_tokens,
    SUM(cache_hit_tokens) AS cache_hit_tokens, SUM(output_tokens) AS output_tokens,
    SUM(CASE WHEN status = 'uncertain' THEN 1 ELSE 0 END) AS uncertain
    FROM usage_ledger GROUP BY month, model, agent ORDER BY month DESC LIMIT 24`).all();
  const total = await query(env.DB, 'SELECT COALESCE(SUM(charged_micro_usd),0) AS cost FROM usage_ledger WHERE month = ?', month).first();
  const today = await query(env.DB, 'SELECT COALESCE(SUM(charged_micro_usd),0) AS cost FROM usage_ledger WHERE created_at >= ?', Date.parse(`${daily}T00:00:00Z`)).first();
  const budget = positiveInteger(env.MONTHLY_BUDGET_MICRO_USD, 5_000_000);
  return { month, timezone: 'UTC', monthly_micro_usd: total.cost, today_micro_usd: today.cost,
    budget_micro_usd: budget, warning: total.cost >= budget * 0.5, circuit_open: total.cost >= budget * 0.8,
    ai_enabled: env.AI_ENABLED === 'true' && !!env.DEEPSEEK_API_KEY,
    paused: !!(await query(env.DB, 'SELECT paused FROM settings WHERE id = 1').first()).paused,
    ledger: ledger.results };
}
