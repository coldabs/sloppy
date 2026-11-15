// Minimal client-side module declarations (F16). vite/client used
// to provide these, but it drags @types/node into the app program
// via @types/ws and undici-types, so the app config no longer
// includes it. Only what the app actually uses is declared here:
// side-effect CSS imports. (The CLI project keeps vite/client for
// its `?raw` imports.)
declare module '*.css'
