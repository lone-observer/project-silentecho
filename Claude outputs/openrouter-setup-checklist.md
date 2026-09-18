# OpenRouter setup — before 1j can run a real batch

Account-side work only. None of this depends on 1g/1h/1i landing first, so it can happen in parallel — but do it before 1j's session opens, or that session burns its first hour on account setup instead of the harness.

## Account and billing

- [ ] Create (or confirm) an OpenRouter account under a login you control long-term — not a throwaway, since replaying/re-running this benchmark later for the Steam decision or a followup post means coming back to the same key and history.
- [ ] Add prepaid credit. OpenRouter is prepay-only, no postpaid billing. Fund toward the estimate in `docs/EVALS.md`'s Budget section: **~$110 for one clean fixed-context pass across 6 models, ~$300–450+ if the context policy ends up being full-run-log.** Add the usual 1.3–2× iteration buffer on top for prompt debugging before the batch that actually ships. Round up — running out of credits mid-batch is a worse failure mode than $50 of unused credit sitting there.
- [ ] Set a spend alert (and, if OpenRouter offers it on your plan, a hard spend cap) on the account or the specific API key you create for this. A retry loop in an unfinished harness is the realistic way this overruns, not the batch itself.

## API key

- [ ] Generate a dedicated key for this project rather than reusing a personal one — makes it trivial to see exactly what the benchmark cost, separate from anything else you use OpenRouter for.
- [ ] If OpenRouter supports a per-key credit limit (check current account settings — this has been a moving feature), set it to roughly your funded amount so a bug can't drain the whole account through this one key.

## Model roster — verify, don't assume

- [ ] Pin the exact OpenRouter model slug for each model in the roster (Fable, Opus, Sonnet for Claude; Astra, Sol, Terra for GPT, or whatever the final six end up being) — the slug is not always the marketing name, and slugs get retired/renamed. Check `openrouter.ai/models` immediately before the batch, not from this checklist's date.
- [ ] Confirm each model is actually enabled for your account. Some frontier models gate behind identity verification or a minimum spend history on OpenRouter — check this per-model before assuming the roster is ready, not after the first batch call 401s.
- [ ] Re-pull current pricing for the final roster right before funding/running — the numbers in `docs/EVALS.md` are a snapshot from 17 Sep 2026 and OpenRouter's prices move.

## Rate limits and request shape

- [ ] Check the RPM/TPM limits your account tier gets per model. Back-of-envelope volume: n=100 seeds × 2 conditions × ~12 turns ≈ 2,400 calls per model, ~14,400 across a 6-model roster. Confirm the harness can either fit under the limit or needs throttling/backoff — this is a harness-design input for 1j, but the limit itself is account information only OpenRouter can tell you.
- [ ] Decide now whether any roster model reliably supports structured output / a strict response format (JSON mode, tool-calling, or similar) on OpenRouter. Action-parsing reliability from free-text replies is a real failure mode at this volume — knowing which models support a stricter format changes how 1j's prompt-parsing code needs to be written, and is worth knowing before that session starts rather than discovering mid-batch.
- [ ] Decide whether to use OpenRouter's discounted batch API for this. It's cheaper (roughly half price on most models) but asynchronous — completions come back later, not turn-by-turn — which doesn't fit a live per-turn game loop where each action depends on the last one's result. Realistically this rules batch pricing out for the main run; note it as a real "no" rather than leaving it as an unexamined maybe, so 1j doesn't re-litigate it.

## Data handling

- [ ] Check OpenRouter's default prompt/completion logging and retention setting on the account, and whether it's fine for this project as-is. Nothing sent to the model is personal — it's game state — but worth a conscious check rather than an assumption, especially since this becomes a public benchmark post.

## Resumability, matching the EVALS.md requirement

- [ ] Confirm whether OpenRouter exposes any request ID or idempotency support that would help 1j's harness resume a batch cleanly after an API error without double-calling (and double-billing) a turn that actually succeeded. If not, that's fine — 1j's own per-turn logging (already required) is the fallback resume mechanism — but check first rather than building resumability twice.
