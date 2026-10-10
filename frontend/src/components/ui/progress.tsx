import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { cn } from '@/lib/utils'

/**
 * `value` is optional here although the registry's `ProgressPrimitive.Root.Props`
 * marks it required: an absent value *is* a supported state — the indeterminate
 * bar, whose track simply has no fill and whose `aria-valuenow` is omitted — and
 * it is already what this wrapper does at runtime (it forwards `value={undefined}`
 * and base-ui renders exactly that). Without the widening a caller that has no
 * number yet would have to pass `null` to say so. Found by the typechecker
 * covering `tests/` (F055 follow-up).
 */
type ProgressProps = Omit<ProgressPrimitive.Root.Props, 'value'> & { value?: number | null }

function Progress({ className, children, value, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      value={value ?? null}
      data-slot="progress"
      className={cn('flex flex-wrap gap-3', className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        'relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted',
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn('h-full bg-primary transition-all', className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn('text-sm font-medium', className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn('ml-auto text-sm text-muted-foreground tabular-nums', className)}
      data-slot="progress-value"
      {...props}
    />
  )
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
