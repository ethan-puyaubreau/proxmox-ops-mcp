import { SENSITIVE_CTIDS } from './config.mjs';
import { classify } from './classifier.mjs';
import { requestApproval, audit, describeAction } from './pending.mjs';

// Report a handler failure to the client as a tool error result, with the
// failure message, instead of letting it surface as a protocol error.
export function reported(handler) {
  return async (args, extra) => {
    try {
      return await handler(args, extra);
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  };
}

// Two-tier gate (Heimdall classifier + Gjallarhorn out-of-band approval).
// Tier 1 (read/repair) executes immediately. Tier 2 (destructive/sensitive/unrecognized)
// is queued and requires an explicit approval from a separate channel (Telegram).
// A prompt-injection attack requesting something destructive cannot self-approve.
export function gated(toolName, handler) {
  return async (args, extra) => {
    const { tier, reason } = classify(toolName, args, { sensitiveCtids: SENSITIVE_CTIDS });
    const action = describeAction(toolName, args);
    if (tier === 1) {
      try {
        audit({ tier: 1, action, decision: 'auto' });
      } catch (_) {}
      return handler(args, extra);
    }
    const { approved, reason: decision } = await requestApproval(action, { signal: extra?.signal });
    if (!approved) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            blocked: true, tier: 2, classifier_reason: reason, decision, action,
            hint: 'Tier-2 action blocked — approve via Gjallarhorn (Telegram) then retry.',
          }, null, 2),
        }],
      };
    }
    // Nobody is waiting for the result any more, so do not act on the approval.
    if (extra?.signal?.aborted) throw new Error('cancelled by client, action not run');
    return handler(args, extra);
  };
}
