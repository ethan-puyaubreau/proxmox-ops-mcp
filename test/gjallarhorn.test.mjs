import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { isAuthorized } from '../src/gjallarhorn.mjs';

const cq = (fromId, chatId) => ({ from: { id: fromId }, message: { chat: { id: chatId } } });

describe('isAuthorized', () => {
  it('accepts the owner in a private chat', () => {
    assert.equal(isAuthorized(cq(1001, 1001), { chatId: '1001', approverId: '1001' }), true);
  });

  it('accepts the approver in a group chat', () => {
    assert.equal(isAuthorized(cq(1001, -2002), { chatId: '-2002', approverId: '1001' }), true);
  });

  it('rejects another user in the group', () => {
    assert.equal(isAuthorized(cq(3003, -2002), { chatId: '-2002', approverId: '1001' }), false);
  });

  it('rejects the approver from another chat', () => {
    assert.equal(isAuthorized(cq(1001, -4004), { chatId: '-2002', approverId: '1001' }), false);
  });
});
