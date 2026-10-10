import { describe, expect, it } from 'vitest'

import { DEV_TOOLS_FLAG, ENABLED_FEATURES, devFeatureFlags } from '@/config/features'

/**
 * The build-time flags (F054).
 *
 * `devFeatureFlags` is pure in `dev` precisely so both branches are reachable
 * from a test — the production branch cannot be executed by the process running
 * the suite, and a branch nobody can execute is a branch nobody has read. The
 * last test pins `ENABLED_FEATURES` to whatever the running build mode resolves
 * to, which is the property `lib/auth.tsx` depends on and the only way `dev.tools`
 * can appear in a caller's set at all.
 */
describe('devFeatureFlags', () => {
  it('enables the developer tools flag in a development build', () => {
    expect([...devFeatureFlags(true)]).toEqual([DEV_TOOLS_FLAG])
  })

  it('enables nothing in a production build', () => {
    expect(devFeatureFlags(false).size).toBe(0)
  })

  it('hands out a new set each call, so one caller cannot edit another’s', () => {
    // `ReadonlySet` is the honest return type — callers must not edit it — so the
    // cast is the test's, and the claim it makes is about the *copy*: editing
    // what one caller received must not reach the next caller or the module.
    const first = devFeatureFlags(true) as Set<string>
    first.add('something.else')

    expect(devFeatureFlags(true).has('something.else')).toBe(false)
    expect(ENABLED_FEATURES.has('something.else')).toBe(false)
  })

  it('resolves the application’s flag set from this build’s own mode', () => {
    expect([...ENABLED_FEATURES]).toEqual([...devFeatureFlags(import.meta.env.DEV)])
  })

  it('names the lab’s flag with the dot form the registry uses', () => {
    // `meetsAccess` compares the flag as an opaque string; the dot form is what
    // the registry and this module must agree on, and nothing else checks it.
    expect(DEV_TOOLS_FLAG).toBe('dev.tools')
  })
})
