import { useState } from 'react'
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FlaskConicalIcon,
  InboxIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import { PageHeader } from '@/components/common/page-header'
import { BrandMark } from '@/components/common/brand-mark'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { FilterChip } from '@/components/common/filter-chip'
import { LoadingState } from '@/components/common/loading-state'
import { SecureLink } from '@/components/common/secure-link'
import { SearchField } from '@/components/common/search-field'
import { StatusBadge } from '@/components/common/status-badge'
import { ThemeToggle } from '@/components/common/theme-toggle'
import { CategoryBarChart } from '@/components/charts/bar-chart'
import { DonutChart } from '@/components/charts/donut-chart'
import { TrendChart } from '@/components/charts/trend-chart'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LabCase, LabSection, SampleNote } from '@/pages/tools/lab-section'
import { FileLabSection } from '@/pages/tools/file-lab'

/**
 * `/tools/components` — the component lab (F054).
 *
 * **This page does not exist in a production build, and that is enforced by
 * registration.** The route is registered inside `config/navigation.ts` from a
 * literal — `import.meta.env.DEV ? [labRoute] : []` — and Vite replaces that
 * expression with `false` when it builds for production, so the branch, this
 * module and the chart library it pulls in are dropped from the output rather
 * than merely hidden. The build's own output is the evidence: `pnpm run build`,
 * then a search of `dist/` for a sentence from this page.
 *
 * The `dev.tools` feature flag is the *second*, narrower guard, and it does a
 * different job: it hides the Tools group and its link from every caller whose
 * feature set lacks the flag (`meetsAccess` fails closed). It does **not** close
 * the route — `RouteGuard` evaluates permissions and `adminOnly`, not flags — so
 * within a development build this page is reachable by typing its URL as an
 * administrator, which is exactly how a developer is meant to open it.
 *
 * **What the page is for.** A component that is only ever seen inside a real
 * screen is a component nobody has looked at: the states it can be in are the
 * states that screen happens to produce. This page puts each primitive in the
 * states that matter — empty, loading, failed, disabled, destructive — where the
 * cost of changing one is a reload.
 *
 * **Values that are written here are labelled.** Every section below draws its
 * own numbers and labels, and the ones that are not from the API say so; the
 * files section is the exception, because there is nothing honest to fake about
 * a store — it goes through the API and stores something real. `SampleNote`
 * marks the panels that are placeholders, and the rule is that a value that
 * came from the server never gets one.
 */
export function ComponentLabPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Component lab"
        description="The primitives this application draws with, their states, the chart shapes, and the file store."
        breadcrumbs={<AppBreadcrumbs />}
      />

      <DevOnlyNotice />

      <ActionsSection />
      <StatusSection />
      <FormSection />
      <StatesSection />
      <OverlaySection />
      <DisclosureSection />
      <TableSection />
      <ChartsSection />
      <FileLabSection />
      <NotShownSection />
    </div>
  )
}

/**
 * The banner is part of the page rather than a comment above it: the first
 * question anyone asks on finding this route is whether it ships, and the answer
 * has to be on the screen — including how it is checked, so the claim can be
 * re-verified instead of trusted.
 */
function DevOnlyNotice() {
  return (
    <div
      data-slot="dev-only-notice"
      className="flex gap-3 rounded-lg border border-dashed p-4"
    >
      <FlaskConicalIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">Development builds only.</p>
        <p className="text-muted-foreground">
          The route is registered from an <code className="font-mono">import.meta.env.DEV</code>{' '}
          literal, so a production bundle contains neither this page nor a route to it — Vite
          folds the expression away and the entry is simply not in the registry. To check that
          rather than believe it: <code className="font-mono">pnpm run build</code>, then search{' '}
          <code className="font-mono">dist/</code> for a sentence from this page.
        </p>
        <p className="text-muted-foreground">
          The <code className="font-mono">dev.tools</code> flag is what hides the link: the Tools
          group disappears for anyone without it. It does not close the route — the route guard
          checks permissions and the admin flag, not flags — so an administrator can still reach
          this address by typing it, which is how a developer opens the lab.
        </p>
        <p className="text-muted-foreground">
          Placeholder values are marked <SampleNote />. Anything unmarked was read from the API —
          which on this page means the files section, and only that.
        </p>
      </div>
    </div>
  )
}

function ActionsSection() {
  return (
    <LabSection
      title="Actions"
      description="Buttons in every variant and size, badges, and the spinner they borrow while busy."
    >
      <LabCase title="Button — variants">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </LabCase>

      <LabCase
        title="Button — sizes, icons and busy"
        note="loading tells the reader the click landed; the label stays so the button does not change width under the pointer."
      >
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Add">
          <PlusIcon />
        </Button>
        <Button size="icon-sm" aria-label="Delete">
          <Trash2Icon />
        </Button>
        <Button loading>Saving</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </LabCase>

      <LabCase title="Badge — variants">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="ghost">Ghost</Badge>
        <Badge variant="link">Link</Badge>
      </LabCase>

      <LabCase title="Avatar" note="Initials, because there is no image to load.">
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>
            <InboxIcon />
          </AvatarFallback>
        </Avatar>
      </LabCase>

      <LabCase
        title="Spinner and Separator"
        note="A spinner says work is happening; it never says what — the sentence beside it does."
      >
        <Spinner />
        <span className="text-sm text-muted-foreground">Loading</span>
        <Separator orientation="vertical" className="h-6" />
        <Button variant="outline" size="sm" loading>
          <Spinner />
          Working
        </Button>
      </LabCase>
    </LabSection>
  )
}

function StatusSection() {
  return (
    <LabSection
      title="Status and chrome"
      description="One vocabulary for lifecycle states, and the pieces the shell draws in its header."
    >
      <LabCase
        title="StatusBadge"
        note="Four known states, and an unknown one — which is deliberately not guessed at, it is shown as it came."
      >
        <StatusBadge status="active" />
        <StatusBadge status="inactive" />
        <StatusBadge status="pending" />
        <StatusBadge status="failed" />
        <StatusBadge status="quarantined" />
      </LabCase>

      <LabCase title="Breadcrumb" note="The trail above every screen's title.">
        <Breadcrumb className="w-full">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin/users">Administration</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Users</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </LabCase>

      <LabCase title="BrandMark and ThemeToggle" note="Both are live controls, not pictures of them.">
        <BrandMark />
        <ThemeToggle />
      </LabCase>

      <LabCase
        title="FilterChip"
        note="A filter that is currently applied, and the way to take it off."
      >
        <FilterChip label="Status" value="Active" onRemove={() => undefined} />
        <FilterChip label="Search" value="a very long search term" onRemove={() => undefined} />
      </LabCase>
    </LabSection>
  )
}

function FormSection() {
  const [select, setSelect] = useState('alpha')
  const [checked, setChecked] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('2026-01-15')
  const [time, setTime] = useState('09:30')
  const [calendar, setCalendar] = useState<Date | undefined>(new Date(2026, 0, 15))

  return (
    <LabSection
      title="Form controls"
      description="Every control a form can be built from, each wired to real state so it actually moves."
    >
      <LabCase title="Input and Label" note="Including the invalid state and a disabled one.">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="lab-input">Full name</Label>
          <Input id="lab-input" placeholder="Ada Lovelace" />
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="lab-invalid">Email</Label>
          <Input id="lab-invalid" aria-invalid defaultValue="not-an-email" />
        </div>
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="lab-disabled">Account number</Label>
          <Input id="lab-disabled" disabled defaultValue="Managed elsewhere" />
        </div>
      </LabCase>

      <LabCase title="Textarea">
        <div className="w-full max-w-sm space-y-1.5">
          <Label htmlFor="lab-textarea">Notes</Label>
          <Textarea id="lab-textarea" placeholder="Anything worth remembering…" rows={3} />
        </div>
      </LabCase>

      <LabCase title="InputGroup" note="An input with something attached to either end.">
        <div className="w-full max-w-sm">
          <InputGroup>
            <InputGroupInput placeholder="Search files" aria-label="Search files" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Search">
                <SearchIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </LabCase>

      <LabCase title="SearchField" note="Debounced, and it says so in its docstring rather than on screen.">
        <div className="w-full max-w-sm">
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search users…"
            aria-label="Search users in the lab"
          />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          value: {search === '' ? '(empty)' : search}
        </span>
      </LabCase>

      <LabCase title="Select">
        <div className="w-full max-w-xs">
          <Select value={select} onValueChange={(value) => setSelect(value ?? '')}>
            <SelectTrigger className="w-56" aria-label="Sample option">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alpha">Alpha</SelectItem>
              <SelectItem value="beta">Beta</SelectItem>
              <SelectItem value="gamma">Gamma</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </LabCase>

      <LabCase
        title="Checkbox and Switch"
        note="A checkbox is a fact you are asserting; a switch is a setting you are turning on. Both are controlled here."
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="lab-checkbox"
            checked={checked}
            onCheckedChange={(next) => setChecked(next === true)}
          />
          <Label htmlFor="lab-checkbox">Include inactive accounts</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="lab-switch"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="lab-switch">Notify me by email</Label>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {checked ? 'on' : 'off'} / {enabled ? 'on' : 'off'}
        </span>
      </LabCase>

      <LabCase title="DatePicker and TimePicker" note="Stored as strings: a calendar day and a 24-hour time.">
        <div className="space-y-1.5">
          <Label htmlFor="lab-date">Start date</Label>
          <DatePicker id="lab-date" value={date} onChange={setDate} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-time">Start time</Label>
          <TimePicker id="lab-time" value={time} onChange={setTime} />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {date} {time}
        </span>
      </LabCase>

      <LabCase
        title="Calendar"
        note="The day grid the pickers open. Given its own state here so a month can be paged through."
      >
        <Calendar
          mode="single"
          selected={calendar}
          onSelect={setCalendar}
          className="rounded-lg border"
        />
      </LabCase>
    </LabSection>
  )
}

function StatesSection() {
  return (
    <LabSection
      title="States"
      description="What a region says when it has nothing, when it is working, and when it failed."
    >
      <LabCase
        title="EmptyState"
        note="Empty is a state, not a blank panel — it says what is missing and offers the way out."
      >
        <div className="w-full">
          <EmptyState
            icon={InboxIcon}
            title="Nothing here yet"
            description="When there is something to show, it appears here."
            action={
              <Button size="sm">
                <PlusIcon />
                Create one
              </Button>
            }
          />
        </div>
      </LabCase>

      <LabCase
        title="ErrorState"
        note="Two variants: something went wrong, and the network is gone. The second one is not the first one — the copy, the icon and the retry label all differ. It takes no error object on purpose: it renders only strings the caller wrote, so a failed request can never leak a stack or a response body onto the screen."
      >
        <div className="w-full space-y-3">
          <ErrorState
            onRetry={() => {
              toast('Retry pressed')
            }}
          />
          <ErrorState variant="offline" />
        </div>
      </LabCase>

      <LabCase title="LoadingState / Skeleton / Spinner" note="A first load shows the shape of what is coming.">
        <div className="w-full space-y-3">
          <LoadingState label="Loading the thing…" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </LabCase>

      <LabCase
        title="Progress"
        note="determinate is the default; a bar with no value is the base primitive's indeterminate mode."
      >
        <div className="w-full max-w-sm space-y-4">
          <Progress value={62}>
            <ProgressLabel>Uploading</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Progress value={8}>
            <ProgressLabel>Almost empty</ProgressLabel>
            <ProgressValue />
          </Progress>
        </div>
      </LabCase>
    </LabSection>
  )
}

function OverlaySection() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <LabSection
      title="Overlays"
      description="Everything that covers the page, and the reason each one exists."
    >
      <LabCase
        title="Dialog"
        note="For a question the page cannot ask inline. Escape and the overlay close it; both buttons are inside."
      >
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>A dialog</DialogTitle>
              <DialogDescription>
                It is here to ask one thing. Everything else on the page is inert while it is
                open, which is exactly why nothing goes in one that could be said beside it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Continue</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </LabCase>

      <LabCase
        title="ConfirmDialog"
        note="The composite over Dialog: a destructive action, named on the button that does it."
      >
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2Icon />
          Delete something
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete this thing?"
          description="This cannot be undone. (Nothing is actually deleted — this is the lab.)"
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            toast('Confirmed')
          }}
        />
      </LabCase>

      <LabCase title="Sheet" note="A panel that slides in — for content too large to sit in a dialog.">
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>A sheet</SheetTitle>
              <SheetDescription>
                Same modal semantics as the dialog, a different amount of room.
              </SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                Close
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </LabCase>

      <LabCase title="DropdownMenu" note="A list of actions. Items are actions, never navigation.">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Actions
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Sample group</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => toast('Renamed')}>
              Rename
              <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast('Duplicated')}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => toast('Deleted')}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </LabCase>

      <LabCase title="Popover" note="A small surface anchored to a control — richer than a tooltip, lighter than a dialog.">
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
          <PopoverContent className="w-72 space-y-1">
            <PopoverTitle>Anchored content</PopoverTitle>
            <PopoverDescription className="text-muted-foreground">
              Popovers are dismissed by clicking away, so nothing that must be answered goes in
              one.
            </PopoverDescription>
          </PopoverContent>
        </Popover>
      </LabCase>

      <LabCase title="Tooltip" note="Hover or focus. A tooltip labels a control; it never carries the only copy of something.">
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Delete" />}>
            <Trash2Icon />
          </TooltipTrigger>
          <TooltipContent>Delete this row</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
          <TooltipContent>A tooltip</TooltipContent>
        </Tooltip>
      </LabCase>

      <LabCase
        title="Toasts (sonner)"
        note="The app mounts one Toaster; these buttons raise the three tones it has."
      >
        <Button variant="outline" onClick={() => toast('Something happened')}>
          Neutral
        </Button>
        <Button variant="outline" onClick={() => toast.success('Saved')}>
          Success
        </Button>
        <Button variant="outline" onClick={() => toast.error('That did not work')}>
          Error
        </Button>
      </LabCase>
    </LabSection>
  )
}

function DisclosureSection() {
  const [tab, setTab] = useState('one')
  const [open, setOpen] = useState(true)

  return (
    <LabSection
      title="Disclosure and search"
      description="Showing a part of something, and finding a thing in a long list."
    >
      <LabCase title="Tabs" note="Views of the same subject. Never a wizard — switching does not imply an order.">
        <div className="w-full">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Sample tabs">
              <TabsTrigger value="one">First</TabsTrigger>
              <TabsTrigger value="two">Second</TabsTrigger>
              <TabsTrigger value="three">Third</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="pt-3 text-sm text-muted-foreground">
              The first view.
            </TabsContent>
            <TabsContent value="two" className="pt-3 text-sm text-muted-foreground">
              The second view.
            </TabsContent>
            <TabsContent value="three" className="pt-3 text-sm text-muted-foreground">
              The third view.
            </TabsContent>
          </Tabs>
        </div>
      </LabCase>

      <LabCase title="Collapsible" note="Content folded away, with the trigger staying visible.">
        <div className="w-full max-w-md">
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              <ChevronDownIcon className={open ? '' : '-rotate-90'} />
              Details
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 text-sm text-muted-foreground">
              Folded away by default when it is not what most readers came for.
            </CollapsibleContent>
          </Collapsible>
        </div>
      </LabCase>

      <LabCase title="ScrollArea" note="A styled scrollable region, so a scrollbar does not restyle the page.">
        <ScrollArea className="h-32 w-full max-w-sm rounded-lg border p-3">
          <div className="space-y-2">
            {Array.from({ length: 12 }, (_, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                Sample row {index + 1}
              </p>
            ))}
          </div>
        </ScrollArea>
      </LabCase>

      <LabCase
        title="Command"
        note="The palette's list. Typing filters; the empty state says nothing matched rather than showing nothing."
      >
        <div className="w-full max-w-md rounded-lg border">
          <Command>
            <CommandInput placeholder="Search the lab…" aria-label="Search the lab" />
            <CommandList>
              <CommandEmpty>Nothing matched.</CommandEmpty>
              <CommandGroup heading="Sample commands">
                <CommandItem value="alpha" onSelect={() => toast('Alpha')}>
                  <CheckIcon />
                  Alpha
                  <CommandShortcut>⌘A</CommandShortcut>
                </CommandItem>
                <CommandItem value="beta" onSelect={() => toast('Beta')}>
                  <BellIcon />
                  Beta
                  <CommandShortcut>⌘B</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </LabCase>

      <LabCase
        title="SecureLink"
        note="Renders only if the caller holds the permission — the same rule the navigation uses, applied to one link. A caller without users.read sees nothing at all here."
      >
        <SecureLink to="/admin/users" permissions={['users.read']}>
          Open the user directory
        </SecureLink>
      </LabCase>
    </LabSection>
  )
}

function TableSection() {
  const [selected, setSelected] = useState(true)

  return (
    <LabSection
      title="Table"
      description="The plain table primitives, which the screens' data tables are built on."
    >
      <LabCase title="Table" note="Sample rows — nothing on this table came from the server.">
        <div className="w-full space-y-2">
          <SampleNote />
          <div className="rounded-lg border">
            <Table>
              <TableCaption>Three sample rows.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_ROWS.map((row) => (
                  <TableRow key={row.name} data-state={selected && row.name === 'Alpha' ? 'selected' : undefined}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="lab-table-select"
              checked={selected}
              onCheckedChange={(next) => setSelected(next === true)}
            />
            <Label htmlFor="lab-table-select">Highlight the first row</Label>
          </div>
        </div>
      </LabCase>
    </LabSection>
  )
}

/** Sample values, written here on purpose, so the charts can be looked at. */
const SAMPLE_ROWS: ReadonlyArray<{ name: string; status: string; count: number }> = [
  { name: 'Alpha', status: 'active', count: 42 },
  { name: 'Beta', status: 'pending', count: 17 },
  { name: 'Gamma', status: 'inactive', count: 3 },
]

/**
 * The chart examples.
 *
 * The three shapes here are the three reasons to draw a chart: over an ordered
 * sequence, across categories, and as parts of a whole. The data is Greek
 * letters and round numbers because it is not data — it exists so the shapes,
 * the palette and the theme's colours can be inspected, and every chart says so
 * in its own description.
 */
function ChartsSection() {
  const [trend, bar, donut] = SAMPLE_CHARTS

  return (
    <LabSection
      title="Charts"
      description="Three shapes, drawn from the theme's own --chart-* tokens. The values are placeholders; the colours are not."
    >
      <LabCase title="chart-tokens" note="Reading the palette, and what happens when the theme changes.">
        <div className="w-full space-y-2">
          <SampleNote />
          <p className="text-sm text-muted-foreground">
            The SVG colours are read from the stylesheet rather than referenced with{' '}
            <code className="font-mono">var()</code>: an SVG presentation attribute is not part of
            the cascade, so a custom property in one is dropped. Switch the theme above — the
            charts are redrawn from whatever the new theme computes.
          </p>
        </div>
      </LabCase>

      <LabCase title="TrendChart" note="One series over ordered labels. The labels are the caller's; this component does not know what a date is.">
        <TrendChart
          title={trend.title}
          description={`${trend.description} Placeholder values.`}
          data={trend.data}
          valueLabel={trend.valueLabel}
          className="w-full"
        />
      </LabCase>

      <LabCase title="CategoryBarChart" note="Categories that are comparable but not ordered.">
        <CategoryBarChart
          title={bar.title}
          description={`${bar.description} Placeholder values.`}
          data={bar.data}
          valueLabel={bar.valueLabel}
          className="w-full"
        />
      </LabCase>

      <LabCase title="DonutChart" note="Parts of one whole, with the counts beside the names — comparing arcs by eye is what a donut is worst at.">
        <DonutChart
          title={donut.title}
          description={`${donut.description} Placeholder values.`}
          data={donut.data}
          valueLabel={donut.valueLabel}
          className="w-full"
        />
      </LabCase>
    </LabSection>
  )
}

const SAMPLE_CHARTS: ReadonlyArray<{
  title: string
  description: string
  valueLabel: string
  data: ReadonlyArray<{ label: string; value: number }>
}> = [
  {
    title: 'A trend',
    description: 'Seven points in order.',
    valueLabel: 'Count',
    data: [
      { label: 'P1', value: 12 },
      { label: 'P2', value: 19 },
      { label: 'P3', value: 15 },
      { label: 'P4', value: 27 },
      { label: 'P5', value: 22 },
      { label: 'P6', value: 31 },
      { label: 'P7', value: 28 },
    ],
  },
  {
    title: 'By category',
    description: 'Five categories side by side.',
    valueLabel: 'Count',
    data: [
      { label: 'Alpha', value: 42 },
      { label: 'Beta', value: 17 },
      { label: 'Gamma', value: 3 },
      { label: 'Delta', value: 25 },
      { label: 'Epsilon', value: 11 },
    ],
  },
  {
    title: 'Parts of a whole',
    description: 'Four parts that add up to one hundred.',
    valueLabel: 'Count',
    data: [
      { label: 'Alpha', value: 40 },
      { label: 'Beta', value: 30 },
      { label: 'Gamma', value: 20 },
      { label: 'Delta', value: 10 },
    ],
  },
]

/**
 * What the lab deliberately does not show, and why — listed on the page because
 * a lab that quietly covers two thirds of the primitives reads as complete.
 */
function NotShownSection() {
  return (
    <LabSection
      title="Not shown here"
      description="Primitives this page leaves alone, and the reason each one is elsewhere."
    >
      <div className="space-y-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          <span className="font-mono text-xs">sidebar.tsx</span> — the shell's own frame
          (provider, rail, inset, groups, menu). A sidebar shown inside the shell's content area
          would be a sidebar inside a sidebar; it is exercised by every screen that has one, and
          by its own tests.
        </p>
        <p>
          <span className="font-mono text-xs">sonner.tsx</span> — the <code>Toaster</code> is
          mounted once, by <code>app/providers.tsx</code>. A second one on this page would
          compete with it, so the section above raises real toasts through the mounted one.
        </p>
      </div>
    </LabSection>
  )
}
