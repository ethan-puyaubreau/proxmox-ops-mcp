import { listAllCts } from '../routing.mjs';

export async function listCts({ node, status } = {}) {
  const items = await listAllCts(node || null, status || null);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(items, null, 2),
    }],
  };
}
