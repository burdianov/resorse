import { cloneElement, createContext, useContext, useId, useMemo } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { Controller, FormProvider, useFormContext } from 'react-hook-form'
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * The form pattern of BIG-PROMPT §5.4: `Form`, `FormField`, `FormItem`,
 * `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, plus a
 * form-level `FormError`. The field components that sit on top of it
 * (`InputField`, `SelectField`, …) live in `./fields.tsx`.
 *
 * The shadcn registry has no `form` item for the `base-nova` style — `shadcn
 * add form` exits 0 without creating a file — so this file is written by hand
 * against our own primitives (the same route `date-picker`/`time-picker` took
 * in F014). Two deliberate differences from the reference version:
 *
 * - **No `Slot`.** The reference's `FormControl` uses Radix's `Slot`, which is
 *   not part of this stack. `cloneElement` does the same job for one child:
 *   it injects the element `id`, `aria-describedby` and `aria-invalid` that
 *   make the control addressable by its label and its message. A component
 *   that does not forward unknown props to a DOM node will silently drop
 *   them — `DatePicker`/`TimePicker` therefore take `aria-describedby` (and
 *   `invalid`) explicitly.
 * - **Both ids are always referenced.** `aria-describedby` points at the
 *   description and message ids even when nothing renders there yet: an
 *   unresolved reference is ignored by assistive technology (the F014 Tooltip
 *   record reaches the same conclusion), and the moment a message appears it
 *   is announced without any re-wiring.
 *
 * Every message is keyed to the field through `useId`, so a form can be
 * rendered any number of times without id collisions.
 */

interface FormFieldContextValue {
  name: FieldPath<FieldValues>
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null)

interface FormItemContextValue {
  id: string
  required: boolean
}

const FormItemContext = createContext<FormItemContextValue | null>(null)

const Form = FormProvider

function FormField<
  TValues extends FieldValues = FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
>(props: ControllerProps<TValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

function FormItem({
  className,
  required = false,
  children,
  ...props
}: ComponentProps<'div'> & { required?: boolean }) {
  const id = useId()
  const value = useMemo(() => ({ id, required }), [id, required])

  return (
    <FormItemContext.Provider value={value}>
      <div data-slot="form-item" className={cn('grid gap-2', className)} {...props}>
        {children}
      </div>
    </FormItemContext.Provider>
  )
}

/**
 * The field's wiring: ids, validation state and requirement. Used by the
 * components in this file; feature code normally composes the components.
 */
export function useFormField() {
  const fieldContext = useContext(FormFieldContext)
  const itemContext = useContext(FormItemContext)
  if (!fieldContext || !itemContext) {
    throw new Error('useFormField must be used inside <FormField><FormItem>')
  }

  const { getFieldState, formState } = useFormContext()
  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    name: fieldContext.name,
    required: itemContext.required,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

function FormLabel({ className, children, ...props }: ComponentProps<typeof Label>) {
  const { error, formItemId, required } = useFormField()

  return (
    <Label
      htmlFor={formItemId}
      data-slot="form-label"
      {...(error ? { 'data-error': true } : {})}
      className={cn('data-[error=true]:text-destructive-text', className)}
      {...props}
    >
      {children}
      {required ? (
        <>
          {/* Visible marker for sighted users, spelled out for screen readers. */}
          <span aria-hidden="true" className="text-destructive-text">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </Label>
  )
}

/**
 * What `FormControl` injects into its single child — the type is the contract a
 * control must satisfy to be usable in a field. React's own `aria-invalid` type
 * is wider than boolean, hence the union below.
 */
interface InjectableProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling'
}

function FormControl({ children }: { children: ReactElement<InjectableProps> }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return cloneElement(children, {
    id: formItemId,
    'aria-describedby': error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId,
    ...(error ? { 'aria-invalid': true } : {}),
  })
}

function FormDescription({ className, ...props }: ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      id={formDescriptionId}
      data-slot="form-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? '') : children
  if (!body) return null

  return (
    <p
      id={formMessageId}
      data-slot="form-message"
      className={cn('text-sm text-destructive-text', className)}
      {...props}
    >
      {body}
    </p>
  )
}

/**
 * The form-level summary, rendered once per form. It speaks for the whole
 * submission: the server's message from `applyServerErrors` (or the client-side
 * "correct the highlighted fields" when validation failed locally), announced
 * via `role="alert"` — individual field messages carry no role, so a failed
 * submit produces exactly one announcement.
 */
function FormError({ className }: { className?: string }) {
  const { formState } = useFormContext()
  const rootError = formState.errors.root
  const rootMessage = typeof rootError?.message === 'string' ? rootError.message : undefined
  const fieldErrorCount = Object.keys(formState.errors).filter((key) => key !== 'root').length

  if (!rootMessage && fieldErrorCount === 0) return null

  return (
    <div
      role="alert"
      data-slot="form-error"
      className={cn(
        'rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive-text',
        className,
      )}
    >
      {rootMessage ?? 'Please correct the highlighted fields.'}
    </div>
  )
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormError,
}
