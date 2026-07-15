/// <reference types="jest" />

import {
  clearProactiveHelpListenersForTests,
  requestProactiveHelp,
  subscribeProactiveHelp,
} from '../src/utils/proactive-help-bus';

describe('proactive-help-bus', () => {
  afterEach(() => {
    clearProactiveHelpListenersForTests();
  });

  it('notifies subscribers when proactive help is requested', () => {
    const handler = jest.fn();
    subscribeProactiveHelp(handler);

    requestProactiveHelp({
      message: 'Besoin d’aide ?',
      openFaq: true,
      suggestedQuery: 'connexion',
    });

    expect(handler).toHaveBeenCalledWith({
      message: 'Besoin d’aide ?',
      openFaq: true,
      suggestedQuery: 'connexion',
    });
  });

  it('unsubscribes cleanly', () => {
    const handler = jest.fn();
    const unsubscribe = subscribeProactiveHelp(handler);
    unsubscribe();

    requestProactiveHelp({ openFaq: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
