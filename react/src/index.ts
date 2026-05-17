import './styles/index.css';

export { initSDK, SDK_VERSION as VERSION } from './core/sdk-state';
export * from './components';
export * from './hooks';
export * from './types';
export {
  buildSemanticPageSnapshot,
  buildSemanticStepCopy,
  classifyCandidate,
  computeSemanticScoreDelta,
  proposeSequenceOrder,
  resolveSemanticWeights,
  runLocalSemanticInference,
} from './utils/semantic-step-intelligence';
export type {
  SemanticCandidateInput,
  SemanticCandidateRole,
  SemanticInferenceResult,
  SemanticPageSnapshot,
  SemanticRole,
  SemanticStepCopy,
  SemanticFusionWeights,
} from './utils/semantic-step-intelligence';
export {
  fetchBackendSemanticHints,
  mergeBackendHints,
} from './utils/semantic-backend-client';
export {
  generateContextualTourDraftsAsync,
  invalidateContextualCandidateScanState,
  __applyPreferredSemanticOrderForTests,
  __resetSemanticDomMutationTrackerForTests,
} from './utils/tour-suggestion-generator';
export {
  enforceSemanticStepCopy,
  isBloatedCopyText,
  isOversizedStepTarget,
  getCanonicalTargetKeyForStep,
} from './utils/step-structural-guards';
export type {
  BackendSemanticHint,
  BackendSemanticInferenceRequest,
  BackendSemanticInferenceResponse,
  BackendSemanticInferenceResult,
  BackendSemanticInferenceStatus,
} from './utils/semantic-backend-client';