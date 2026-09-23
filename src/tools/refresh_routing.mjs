import { buildCtMap, getCachedMap } from '../routing.mjs';

export async function refreshRoutingTool() {
  await buildCtMap(true);
  const map = getCachedMap();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ refreshed: true, ctCount: Object.keys(map).length, map, timestamp: new Date().toISOString() }, null, 2),
    }],
  };
}
