// @shelfcure/api-client — typed Supabase client factories + domain helpers.
//
// Two factories live here so that browser code and server code (Next.js
// Server Components / Route Handlers / middleware) both get a typed client
// without duplicating env-var plumbing.
//
// The browser factory uses the singleton from @supabase/ssr.
// The server factory is a thin wrapper that the consuming app composes with
// its own cookie store (Next.js cookies() / Express req).

export { createBrowserSupabaseClient } from './browser';
export { createServerSupabaseClient } from './server';
export type { CookieStore } from './server';
export * from './errors';
export * from './rpc';
export * from './stores';
export * from './medicines';
export * from './customers';
export * from './staff';
export * from './pos';
export * from './suppliers';
export * from './history';
export * from './stock';
export * from './doctors';
export * from './settings';
export * from './reports';
export * from './inventory';
export * from './master-medicines';
export * from './categories';
export * from './barcodes';
export * from './prescriptions';
export * from './purchase-returns';
export * from './purchase-orders';
