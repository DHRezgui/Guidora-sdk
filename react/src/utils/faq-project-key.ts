import type { FaqPageContext } from '../types/faq';
import { resolveSdkProjectKey } from './sdk-project-key';

export { DEFAULT_SDK_PROJECT_KEY, resolveSdkProjectKey } from './sdk-project-key';

/** Resolves FAQ corpus scope (strict: always a project key, default when unset). */
export function resolveFaqProjectKey(input?: {
  projectKey?: string;
  pageContext?: Partial<FaqPageContext>;
}): string {
  return resolveSdkProjectKey({
    projectKey: input?.projectKey,
    flowVersion: input?.pageContext?.flowVersion,
  });
}
