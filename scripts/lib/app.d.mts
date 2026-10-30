export const root: string;
export function appOptions(extra?: Record<string, unknown>): Record<string, unknown>;
export const ENTRIES: Record<'client' | 'staff', { dir: string; title: string; short: string; name: string; noscript: string }>;
export function entryHtml(mode?: 'client' | 'staff'): string;
export function entryManifest(mode?: 'client' | 'staff'): string;
export function writeEntries(pubDir: string, fs: unknown): void;
export const siteConfig: () => string;
