import { APP_NAME } from '@/config/branding'

/**
 * Temporary landing page inside the F015 shell.
 *
 * F006/F009/F010 proved routing, the token theme and the persisted preference;
 * F015 wraps them in the real layout. The page itself is scaffolding: F016
 * brings the navigation registry, F017 the route states (root redirect, 403,
 * 404), and F047 the real dashboard. Nothing here renders data.
 */
export function FoundationStatus() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">
          Foundation bootstrapped: Vite, React, TypeScript, React Router, theme tokens and the
          layout shell. No application pages exist yet.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 text-card-foreground">
        <h2 className="text-sm font-medium">Theme tokens</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Temporary surface for F009/F010: every swatch below is painted from a semantic token, so
          the whole block repaints when the theme changes. The control itself now lives in the
          header (F015). This page is replaced when the real routes land in F017.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['bg-primary text-primary-foreground', 'primary'],
            ['bg-secondary text-secondary-foreground', 'secondary'],
            ['bg-muted text-muted-foreground', 'muted'],
            ['bg-accent text-accent-foreground', 'accent'],
            ['bg-destructive text-primary-foreground', 'destructive'],
          ].map(([classes, label]) => (
            <span
              key={label}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${classes ?? ''}`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Literal class names: Tailwind only generates classes it can find in source. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="size-8 rounded-md bg-chart-1" title="chart-1" />
          <span className="size-8 rounded-md bg-chart-2" title="chart-2" />
          <span className="size-8 rounded-md bg-chart-3" title="chart-3" />
          <span className="size-8 rounded-md bg-chart-4" title="chart-4" />
          <span className="size-8 rounded-md bg-chart-5" title="chart-5" />
        </div>
      </section>
    </div>
  )
}
