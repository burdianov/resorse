import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * The accessibility scan (F058; BIG-PROMPT §10.4, §2.1).
 *
 * §10.4: "Run axe accessibility scans or equivalent at least on Login,
 * Dashboard, Admin Users, permission matrix, and Notifications … Fail CI for
 * **real critical** accessibility violations." This module is the "or
 * equivalent" half made concrete: one gate, one place that decides what counts
 * as a failure, so a scan cannot be quietly loosened in one spec and not
 * another.
 *
 * **What is scanned.** axe's WCAG 2.0 / 2.1 / 2.2 **A and AA** rule sets, which
 * is the level the project targets. AAA is not a target, and scanning it would
 * produce findings nobody is going to fix — the fastest way to teach a team to
 * ignore a check.
 *
 * **What fails.** `critical` **and** `serious`. §10.4 says "critical" and the
 * stricter reading is deliberate: axe's `serious` impact is reserved for
 * violations that block or seriously impede a user with a disability, which is
 * a WCAG failure whatever the severity word attached to it. The narrower
 * reading would let a contrast or labelling failure through on a technicality.
 *
 * **No rules are switched off.** A finding that cannot be fixed gets fixed, or
 * it is recorded with an owner — a suppression in this file would hide it from
 * every future run and from the operator's gate alike.
 */

/** WCAG 2.2 A + AA, via axe's own rule tags. */
export const WCAG_22_A_AA = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
] as const

/** The impacts that fail the scan. See the note above on `serious`. */
const BLOCKING: readonly string[] = ['critical', 'serious']

/**
 * The subset of axe's result this module reads.
 *
 * Structural rather than imported: `axe-core` is a dependency of
 * `@axe-core/playwright` and not of this package, so reaching into its types
 * would be a dependency the lockfile does not declare. The fields below are the
 * ones the report formats, typed to accept what axe actually produces — a CSS
 * target is a string except across a shadow boundary, where it is a list.
 */
interface ViolationNode {
  target: ReadonlyArray<string | ReadonlyArray<string>>
  html: string
  failureSummary?: string | undefined
}

interface Violation {
  id: string
  impact?: string | null | undefined
  help: string
  helpUrl: string
  nodes: ViolationNode[]
}

interface ScanResult {
  violations: Violation[]
}

/**
 * Scan the page as it currently stands and fail if anything blocking is found.
 *
 * `label` is the state being scanned, in the words of the screen a reader would
 * recognise ("the permission matrix"), because it ends up in the failure
 * message and a failure that does not say *where* is a failure somebody has to
 * reproduce by hand.
 *
 * The report is intentionally wider than the assertion needs: axe's rule id and
 * help URL, the CSS target of the offending node, and axe's own one-line
 * explanation. Everything needed to fix it without re-running the suite.
 */
export async function expectNoBlockingViolations(page: Page, label: string): Promise<void> {
  const results: ScanResult = await new AxeBuilder({ page }).withTags([...WCAG_22_A_AA]).analyze()

  const blocking = results.violations.filter(
    (violation) => violation.impact != null && BLOCKING.includes(violation.impact),
  )

  expect(
    blocking.map((violation) => describeViolation(violation)),
    `${label}: blocking WCAG A/AA violations (§10.4 fails the gate on these)`,
  ).toEqual([])
}

/** A CSS path, with a shadow-DOM hop rendered as an arrow rather than a list. */
function describeTarget(target: ViolationNode['target']): string {
  return target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : part)).join(' ')
}

/** One violation, rendered for a failure message rather than for a report file. */
function describeViolation(violation: Violation): string {
  const shown = violation.nodes.slice(0, 3)
  const lines = [
    `[${violation.impact ?? 'unknown'}] ${violation.id} — ${violation.help}`,
    `  ${violation.helpUrl}`,
  ]
  for (const node of shown) {
    lines.push(`  at ${describeTarget(node.target)}`)
    // The markup, not just where it is: a CSS path usually points at an
    // element whose colour comes from a class further up the tree, and the
    // reader who has to fix it should not have to reproduce the state to see
    // what axe was looking at — the failure is already the whole report.
    const html = node.html.replace(/\s+/g, ' ').trim()
    lines.push(`    <${html.length > 400 ? `${html.slice(0, 400)}…` : html}`)
    if (node.failureSummary !== undefined) {
      lines.push(...node.failureSummary.split('\n').map((part) => `    ${part.trim()}`))
    }
  }
  const hidden = violation.nodes.length - shown.length
  if (hidden > 0) {
    lines.push(`  … and ${hidden} more node(s) of the same rule`)
  }
  return lines.join('\n')
}
