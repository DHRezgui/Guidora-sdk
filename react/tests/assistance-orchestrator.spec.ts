/// <reference types="jest" />

import { canTransitionAssistance } from '../src/utils/assistance-orchestrator';

describe('canTransitionAssistance', () => {
  it('allows tour to win from any state', () => {
    expect(canTransitionAssistance('none', 'tour')).toBe(true);
    expect(canTransitionAssistance('faq', 'tour')).toBe(true);
    expect(canTransitionAssistance('proactiveToast', 'tour')).toBe(true);
  });

  it('only allows toast from none', () => {
    expect(canTransitionAssistance('none', 'proactiveToast')).toBe(true);
    expect(canTransitionAssistance('faq', 'proactiveToast')).toBe(false);
    expect(canTransitionAssistance('tour', 'proactiveToast')).toBe(false);
  });

  it('allows toast to faq or dismiss', () => {
    expect(canTransitionAssistance('proactiveToast', 'faq')).toBe(true);
    expect(canTransitionAssistance('proactiveToast', 'none')).toBe(true);
  });

  it('allows manual faq open/close from none', () => {
    expect(canTransitionAssistance('none', 'faq')).toBe(true);
    expect(canTransitionAssistance('faq', 'none')).toBe(true);
    expect(canTransitionAssistance('tour', 'faq')).toBe(false);
  });
});
