import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Circular imports are invisible to every other check in this project.
 *
 * `tsc` accepts them, the production build resolves them, and Vitest's module
 * runner tolerates them — a cycle only becomes an error in the **browser's**
 * native ESM, where a module-scope read of a binding that has not executed yet
 * throws `ReferenceError: Cannot access 'X' before initialization` and the app
 * renders nothing. F017 shipped exactly that: `config/navigation.ts` imported
 * `RouteGuard`, which imported `access-provider.tsx`, which read
 * `ANONYMOUS_ACCESS` at module scope from `navigation.ts` — so F017's own
 * checks (typecheck, tests, build, HTTP smoke) were all green while the page
 * was blank. It surfaced the moment a real browser opened the app.
 *
 * This test walks the static import graph and fails on any cycle, so the class
 * of bug dies here instead of in a browser. Type-only imports are skipped:
 * `verbatimModuleSyntax` erases them, so they cannot create a runtime cycle.
 * Dynamic `import(...)` is skipped too — it is deferred and cannot re-enter an
 * in-flight module evaluation.
 */

// jsdom has no file:// import.meta.url, so the project root comes from the
// runner's working directory (Vitest runs from `frontend/`).
const SRC = resolve(process.cwd(), 'src')

const RUNTIME_IMPORT = [
  // import X from '…' / import { X } from '…' / import type … (excluded)
  /(?:^|\n)\s*import\s+(?!type\s)(?:[^'"]*?)from\s*['"]([^'"]+)['"]/g,
  // import '…' (side-effect only)
  /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  // export { X } from '…' / export * from '…' / export type … (excluded)
  /(?:^|\n)\s*export\s+(?!type\s)(?:[^'"]*?)from\s*['"]([^'"]+)['"]/g,
]

function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
      } else if (/\.tsx?$/.test(path) && !path.endsWith('.d.ts')) {
        found.push(path)
      }
    }
  }
  walk(SRC)
  return found
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(SRC, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier)
  } else {
    // A bare package import: outside the graph this test guards.
    return null
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // Not a file — try the next candidate.
    }
  }
  return null
}

function importGraph(): Map<string, string[]> {
  const files = sourceFiles()
  const known = new Set(files)
  const graph = new Map<string, string[]>()

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const edges = new Set<string>()
    for (const pattern of RUNTIME_IMPORT) {
      for (const match of source.matchAll(pattern)) {
        const target = resolveSpecifier(match[1] ?? '', file)
        // Only source modules participate; assets (CSS) have no outgoing edges.
        if (target && known.has(target)) edges.add(target)
      }
    }
    graph.set(file, [...edges])
  }
  return graph
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  let cycle: string[] | null = null

  const visit = (node: string): boolean => {
    if (state.get(node) === 'done') return false
    if (state.get(node) === 'visiting') {
      cycle = [...stack.slice(stack.indexOf(node)), node]
      return true
    }
    state.set(node, 'visiting')
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true
    }
    stack.pop()
    state.set(node, 'done')
    return false
  }

  for (const node of graph.keys()) {
    if (visit(node)) break
  }
  return cycle
}

describe('module graph', () => {
  it('has no circular imports in src/', () => {
    const graph = importGraph()
    expect(graph.size).toBeGreaterThan(20)

    const cycle = findCycle(graph)
    const rendered = cycle
      ?.map((file) => file.slice(SRC.length).replaceAll('\\', '/'))
      .join('\n  → ')

    expect(cycle, `circular import:\n  → ${rendered ?? ''}`).toBeNull()
  })
})
