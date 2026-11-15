// Type declarations for src/lib/ipGuard.mjs (plain JS, no types of
// its own). The server, the CLI, and the browser app all import the
// shared guard from here; these declarations let `tsc -b` check
// those imports. They must match the real exports in ipGuard.mjs.
export function isPrivateAddress(address: string): boolean
export function isPrivateHost(hostname: string): boolean
