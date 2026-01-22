// Re-export types for convenience
export type { Database } from './types';
export type { Json } from './types';

// Re-export clients
export { createClient as createBrowserClient } from './client';
export { createClient as createServerClient, createClientFromRequest } from './server';

