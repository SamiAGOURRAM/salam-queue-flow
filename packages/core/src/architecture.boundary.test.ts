/**
 * Architecture boundary test (hexagonal enforcement)
 *
 * The core business logic must depend ONLY on ports (interfaces), never on a
 * concrete infrastructure (Supabase, env, transport). Adapters live in
 * `repositories/` and are wired at the composition root (`container.ts`).
 *
 * This test makes that boundary a guarantee: if a service ever imports the
 * Supabase SDK, reads `process.env`, or reaches for a web alias, CI fails here
 * — so databases / queues / messaging stay swappable behind their ports.
 *
 * Zero-dependency on purpose (no ESLint toolchain in this package): pure fs scan
 * over the existing vitest runner.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Directories whose business logic must stay infrastructure-free. */
const GUARDED_DIRS = ['services'];

/** Import specifiers / tokens a guarded file may never reference. */
const FORBIDDEN: Array<{ token: string; why: string }> = [
  { token: '@supabase/supabase-js', why: 'Supabase SDK is an adapter concern — depend on a repository port instead' },
  { token: 'process.env', why: 'env/config is supplied at the composition root — inject it, do not read it in core' },
  { token: "from '@/", why: 'web/app aliases must never leak into core' },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('hexagonal boundary: core services depend only on ports', () => {
  const guardedFiles = GUARDED_DIRS.flatMap((d) => walk(join(SRC_DIR, d)));

  it('finds the guarded source files (sanity)', () => {
    expect(guardedFiles.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('no service imports "$token" ($why)', ({ token }) => {
    const offenders = guardedFiles.filter((f) => readFileSync(f, 'utf8').includes(token));
    expect(
      offenders.map((f) => relative(SRC_DIR, f)),
      `Hexagonal boundary violation: a core service references "${token}".`,
    ).toEqual([]);
  });
});
