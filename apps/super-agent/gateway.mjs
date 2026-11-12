import { MAX_OUTPUT, MODEL, messagesFor, parseDecision, parseUsage, reservationCost } from './core.mjs';
import { audit, now, query, reserve } from './store.mjs';

export async function triage(env, id, fetcher = fetch) {
  if (env.AI_ENABLED !== 'true' || !env.DEEPSEEK_API_KEY) return false;
  const item = await query(env.DB, `UPDATE cases SET state = 'triaging', attempts = attempts + 1,
    lease_until = ?, updated_at = ? WHERE id = ? AND state = 'waiting_approval' AND attempts < 3
    AND (SELECT paused FROM settings WHERE id = 1) = 0 RETURNING *`, now() + 120000, now(), id).first();
  if (!item) return false;
  let reservation;
  try {
    const messages = messagesFor(item);
    const bound = reservationCost(messages);
    reservation = await reserve(env, id, bound.cost);
    if (!reservation) {
      await query(env.DB, `UPDATE cases SET state = 'waiting_approval', lease_until = NULL, updated_at = ? WHERE id = ? AND state = 'triaging'`, now(), id).run();
      await audit(env.DB, id, 'ai_budget_or_concurrency_blocked');
      return false;
    }
    const response = await fetcher('https://api.deepseek.com/chat/completions', {
      method: 'POST', redirect: 'error',
      headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: MAX_OUTPUT, stream: false,
        thinking: { type: 'disabled' }, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(25000),
    });
    // Even error responses may have billed work: no automatic refund or retry.
    if (!response.ok) throw new Error('Provider failed');
    const body = await response.json();
    const usage = parseUsage(body.usage, bound.inputBound);
    await query(env.DB, `UPDATE usage_ledger SET status = 'completed', charged_micro_usd = ?,
      input_tokens = ?, cache_hit_tokens = ?, output_tokens = ? WHERE id = ? AND status = 'reserved'`,
      usage.cost, usage.input, usage.hit, usage.output, reservation).run();
    const decision = parseDecision(JSON.parse(body.choices?.[0]?.message?.content));
    // AI proposes fields only. It cannot approve a task or make a tool call.
    await query(env.DB, `UPDATE cases SET state = 'waiting_approval', category = ?, priority = ?,
      draft = ?, lease_until = NULL, updated_at = ? WHERE id = ? AND state = 'triaging'`,
      decision.category, decision.priority, decision.draft, now(), id).run();
    await audit(env.DB, id, 'ai_draft_created');
    return true;
  } catch {
    if (reservation) await query(env.DB, `UPDATE usage_ledger SET status = 'uncertain' WHERE id = ? AND status = 'reserved'`, reservation).run();
    await query(env.DB, `UPDATE cases SET state = 'waiting_approval', lease_until = NULL, updated_at = ? WHERE id = ? AND state = 'triaging'`, now(), id).run();
    await audit(env.DB, id, 'ai_failed_review_required');
    return false;
  }
}
