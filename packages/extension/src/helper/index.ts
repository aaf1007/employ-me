export {
  createHelperClient,
  type HelperClient,
  type HelperClientOptions,
  type HelperRequestBody,
} from './client';
// Test builds only: production code must not reference it, so the bundler drops it.
export { createInMemoryHelper, SAMPLE_RESUME_EXTRACT, type InMemoryHelper } from './in-memory-transport';
export { createNativeTransport, disconnectError } from './native-transport';
export type { HelperConnection, HelperTransport, TransportHandlers } from './transport';
