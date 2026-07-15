export type ProactiveHelpRequest = {
  message?: string;
  openFaq?: boolean;
  suggestedQuery?: string;
};

type ProactiveHelpListener = (request: ProactiveHelpRequest) => void;

const listeners = new Set<ProactiveHelpListener>();

export function subscribeProactiveHelp(listener: ProactiveHelpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestProactiveHelp(request: ProactiveHelpRequest = {}): void {
  listeners.forEach((listener) => {
    listener(request);
  });
}

export function clearProactiveHelpListenersForTests(): void {
  listeners.clear();
}
