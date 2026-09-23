// Out-of-band approval channel via Telegram.
// Config via env (gitignored): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// If unconfigured, gjallarhornConfigured() returns false and Tier-2 actions are denied
// by default (fail-safe — see pending.mjs).
// Security model: approval comes from your phone (a separate channel).
// A prompt-injection attack cannot self-approve because it does not control that channel.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const api = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;

export function gjallarhornConfigured() {
  return Boolean(TOKEN && CHAT_ID);
}

async function tg(method, body) {
  const r = await fetch(api(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Send an approval request with two inline buttons (callback_data = approve:<id> / reject:<id>).
export async function sendApprovalRequest(id, summary) {
  // Plain text: a backtick or underscore in a command must not break delivery.
  const text = 'Tier-2 action pending approval\n\n' + summary + '\n\nID ' + id + ' · expires in 5 min';
  const reply_markup = {
    inline_keyboard: [[
      { text: 'Approve', callback_data: 'approve:' + id },
      { text: 'Reject',  callback_data: 'reject:'  + id },
    ]],
  };
  const res = await tg('sendMessage', { chat_id: CHAT_ID, text, reply_markup });
  if (res && res.ok) return res.result.message_id;
  process.stderr.write(`[gjallarhorn] sendMessage failed: ${res && res.description}\n`);
  return null;
}

// Long-poll getUpdates (callback_query only). Calls onDecision(id, approved) on each response.
let offset = 0;
let polling = false;
export function startPolling(onDecision) {
  if (!gjallarhornConfigured() || polling) return;
  polling = true;
  (async () => {
    while (polling) {
      try {
        const r = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['callback_query'] });
        for (const u of (r.result || [])) {
          offset = u.update_id + 1;
          const cq = u.callback_query;
          if (!cq || !cq.data) continue;
          // Only accept responses from the configured owner. Prevents forged approvals.
          if (String(cq.from && cq.from.id) !== String(CHAT_ID)) {
            try { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Unauthorized' }); } catch (_) {}
            continue;
          }
          const [action, id] = String(cq.data).split(':');
          const approved = action === 'approve';
          try {
            await tg('answerCallbackQuery', { callback_query_id: cq.id, text: approved ? 'Approved' : 'Rejected' });
            await tg('editMessageText', {
              chat_id: CHAT_ID, message_id: cq.message.message_id,
              text: (cq.message.text || '') + '\n\n— ' + (approved ? 'APPROVED' : 'REJECTED'),
            });
          } catch (_) { /* best-effort UI update */ }
          try { onDecision(id, approved); } catch (_) {}
        }
      } catch (_) {
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
  })();
}

/** Send a plain notification (no buttons). */
export async function notify(text) {
  if (!gjallarhornConfigured()) return;
  try { await tg('sendMessage', { chat_id: CHAT_ID, text }); } catch (_) {}
}
