import type { ComponentProps, ReactNode } from 'react'
import type { Control, FieldPath, FieldValues } from 'react-hook-form'

import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { cn } from '@/lib/utils'

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './form'

/**
 * The reusable validated fields of BIG-PROMPT §5.4 — `InputField`,
 * `TextareaField`, `SelectField`, `CheckboxField` and the date/time fields —
 * composed from the pattern in `./form.tsx`.
 *
 * Each one renders the whole field: label (with the required marker), control,
 * description, message. Feature code writes
 *
 * ```tsx
 * <InputField control={form.control} name="email" label="Email" required />
 * ```
 *
 * and gets `aria-invalid`, the `aria-describedby` chain, the error message
 * element and the required marker without repeating any of it.
 *
 * **Values are strings.** RHF stores what the control gives it, and every
 * control here gives a string (or a boolean, for `CheckboxField`). Numbers and
 * dates are the *schema's* business — `z.coerce.number()`, an ISO day for
 * `DateField`, `HH:mm` for `TimeField` — which keeps one conversion point
 * instead of one per screen.
 */

interface FieldBase<TValues extends FieldValues> {
  control: Control<TValues>
  name: FieldPath<TValues>
  label: ReactNode
  /** Help text rendered between the control and the message. */
  description?: ReactNode
  /**
   * Renders the required marker plus a screen-reader "(required)". Validation
   * itself comes from the Zod schema — this is the visible contract only.
   */
  required?: boolean
  disabled?: boolean
}

/** RHF's value is a union of every field type; controls want their own. */
function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function FieldFooter({ description }: { description?: ReactNode }): ReactNode {
  return (
    <>
      {description ? <FormDescription>{description}</FormDescription> : null}
      <FormMessage />
    </>
  )
}

type InputFieldProps<TValues extends FieldValues> = FieldBase<TValues> &
  Omit<
    ComponentProps<'input'>,
    'value' | 'defaultValue' | 'onChange' | 'name' | 'id' | 'ref' | 'disabled'
  >

export function InputField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  ...inputProps
}: InputFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...inputProps}
              name={field.name}
              disabled={disabled}
              ref={field.ref}
              value={stringValue(field.value)}
              onChange={(event) => {
                field.onChange(event.target.value)
              }}
              onBlur={field.onBlur}
            />
          </FormControl>
          <FieldFooter {...(description !== undefined ? { description } : {})} />
        </FormItem>
      )}
    />
  )
}

type TextareaFieldProps<TValues extends FieldValues> = FieldBase<TValues> &
  Omit<
    ComponentProps<'textarea'>,
    'value' | 'defaultValue' | 'onChange' | 'name' | 'id' | 'ref' | 'disabled'
  >

export function TextareaField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  ...textareaProps
}: TextareaFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...textareaProps}
              name={field.name}
              disabled={disabled}
              ref={field.ref}
              value={stringValue(field.value)}
              onChange={(event) => {
                field.onChange(event.target.value)
              }}
              onBlur={field.onBlur}
            />
          </FormControl>
          <FieldFooter {...(description !== undefined ? { description } : {})} />
        </FormItem>
      )}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
}

type SelectFieldProps<TValues extends FieldValues> = FieldBase<TValues> & {
  options: readonly SelectOption[]
  placeholder?: string
  className?: string
}

export function SelectField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  placeholder,
  required = false,
  disabled = false,
  className,
}: SelectFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          {/* The label's `htmlFor` addresses the trigger — the focusable element —
              which is why FormControl wraps the trigger and not the Select root. */}
          <Select
            value={field.value === '' || field.value == null ? null : String(field.value)}
            onValueChange={(value) => {
              field.onChange(value)
            }}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className={cn('w-full', className)}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldFooter {...(description !== undefined ? { description } : {})} />
        </FormItem>
      )}
    />
  )
}

type CheckboxFieldProps<TValues extends FieldValues> = FieldBase<TValues> & {
  className?: string
}

export function CheckboxField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required = false,
  disabled = false,
  className,
}: CheckboxFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem required={required} className={className}>
          <div className="flex items-start gap-2">
            <FormControl>
              <Checkbox
                checked={field.value === true}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true)
                }}
                disabled={disabled}
                ref={field.ref}
                className="mt-0.5"
              />
            </FormControl>
            <div className="grid gap-1">
              {/* Font-normal: this label reads as body copy, not as a form heading. */}
              <FormLabel className="font-normal">{label}</FormLabel>
              <FieldFooter {...(description !== undefined ? { description } : {})} />
            </div>
          </div>
        </FormItem>
      )}
    />
  )
}

type DateFieldProps<TValues extends FieldValues> = FieldBase<TValues> & {
  placeholder?: string
}

/** Stores an ISO calendar day (`YYYY-MM-DD`) — see `lib/format-date.ts`. */
export function DateField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  required = false,
  disabled = false,
}: DateFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <DatePicker
              value={stringValue(field.value)}
              onChange={(value) => {
                field.onChange(value)
              }}
              disabled={disabled}
              invalid={fieldState.invalid}
              {...(placeholder !== undefined ? { placeholder } : {})}
            />
          </FormControl>
          <FieldFooter {...(description !== undefined ? { description } : {})} />
        </FormItem>
      )}
    />
  )
}

type TimeFieldProps<TValues extends FieldValues> = FieldBase<TValues> & {
  placeholder?: string
}

/** Stores a 24-hour `HH:mm` string — see `ui/time-picker.tsx`. */
export function TimeField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  required = false,
  disabled = false,
}: TimeFieldProps<TValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem required={required}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <TimePicker
              value={stringValue(field.value)}
              onChange={(value) => {
                field.onChange(value)
              }}
              disabled={disabled}
              invalid={fieldState.invalid}
              {...(placeholder !== undefined ? { placeholder } : {})}
            />
          </FormControl>
          <FieldFooter {...(description !== undefined ? { description } : {})} />
        </FormItem>
      )}
    />
  )
}
