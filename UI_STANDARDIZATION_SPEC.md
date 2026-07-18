# Upstand Dashboard UI/UX Standardization Specification

## Status and scope

This specification standardizes the 19 dashboard surfaces listed in the audit:

Projects, Deployments, Templates, Requests, Remote Servers, SSH Keys, Docker Swarm, Docker Inventory, Docker Registry, Web Server, Certificates, Git Providers, S3 Storage, SCIM, Single Sign-On, Monitoring, Notifications, Audit Logs, and Tags.

The review covered the shared dashboard shell, page hierarchy, collection/list/table surfaces, forms, dialogs, destructive flows, loading/empty/error states, feedback, and the nested Project → Environment → Resource experience. Evidence is taken from the current implementation under apps/web/src/app/(dashboard) and apps/web/src/features/resources.

This is a design and implementation contract. When a page has existing domain-specific behavior, the exception is documented rather than treated as a reason to invent a second visual pattern.

## Non-negotiable foundations

### Theme tokens and dark mode

Use shadcn semantic tokens everywhere in dashboard UI:

~~~tsx
bg-background text-foreground bg-card text-card-foreground
bg-muted text-muted-foreground bg-accent text-accent-foreground
bg-primary text-primary-foreground border-border border-input
ring-ring bg-destructive text-destructive-foreground
~~~

Do not add page-level utilities such as "bg-blue-500", "text-zinc-300", "bg-black/15", "bg-[#0c0d12]", "text-emerald-500", or "text-rose-500". Current examples occur in Deployments, Docker Inventory, Remote Servers, SSH Keys, Projects, Git Providers, Templates, nested Environments/Resources, and Web Server. The log/code surface may use a dedicated semantic "bg-code"/"text-code-foreground" token if the product needs a terminal treatment; it must not hardcode a dark hex value.

Add semantic status tokens to the shared UI theme if the current shadcn set does not provide them:

~~~css
--success / --success-foreground
--warning / --warning-foreground
--info / --info-foreground
~~~

Expose them through reusable Badge variants. Components should consume success, warning, info, secondary, and destructive, not raw color utilities. This is required for light/dark mode and future theme changes.

The web app currently uses apps/web/components.json with the Hugeicons icon library while the shared package configuration identifies Lucide. The canonical dashboard rule is: use @upstand/ui primitives and the app’s Hugeicons adapter in apps/web; do not mix direct icon-library imports inside individual pages.

### Layout rhythm

- Use the shared DashboardPage and DashboardPageHeader on every listed page.
- Page content is a single responsive column with a maximum readable width of max-w-7xl, px-4 py-6, and md:px-8; the existing shell is the source of truth.
- Use space-y-4 for field/compact content stacks and space-y-6 for page sections. Use p-4 or p-6 for component surfaces. Do not introduce one-off padding values such as p-5, p-12, or arbitrary pixel padding unless a documented dense/code surface requires it.
- Use gap-* for flex/grid relationships; do not mix margin-based spacing with the layout rhythm.
- Section spacing is 24px (space-y-6); related controls inside a section are 16px (space-y-4); label/control spacing is 8px (space-y-2).
- Every full page has one h1. Card titles are text-lg font-semibold; helper/body text is text-sm; compact metadata is text-xs; display metrics use tracking-tight and tabular numerals.
- Use text-wrap: balance/text-pretty for page and section headings and min-w-0 plus truncate, line-clamp-*, or break-words for user-provided names, URLs, IDs, and error messages.
- Every interactive element must retain the shadcn focus treatment: focus-visible:ring-* or the equivalent built into the primitive. Use hover:bg-accent, explicit active state, and disabled:pointer-events-none disabled:opacity-50 consistently.

### Shell and navigation

The existing Sidebar → SidebarInset → header structure is the standard. Keep:

- Organization switcher at the top of the sidebar.
- Four navigation groups: Workloads, Infrastructure, Integrations, Management.
- Global Search, theme toggle, breadcrumb, and SidebarTrigger in the header.
- A scrollable main region with overflow-x-hidden and no nested page-level horizontal scrollbar except a table/code region that explicitly owns it.

The breadcrumb convention is Dashboard / [current page]. Nested pages extend it to Dashboard / Projects / [project] / [environment] / [resource]. The current page name must not be repeated as an unrelated page title or hidden in an action label.

## 1. Page header and hierarchy

### Current inconsistencies

- Most pages use DashboardPageHeader, but header actions vary from primary create buttons to search inputs, refresh icon-only buttons, selectors, and Back to catalog controls.
- Counts are embedded into titles (Remote Servers (n)), while other pages show counts in cards or descriptions.
- Page titles vary in case and specificity: Deployments & Queues, Web Server (Caddy), Request Monitoring, SCIM Provisioning, and S3 Storage.
- Some pages omit an icon or use a different title level inside the page (Certificates, SSO, and parts of Web Server).

### Standard pattern

~~~tsx
<DashboardPage>
  <DashboardPageHeader
    title="Remote Servers"
    description="Add isolated deploy, build, and database hosts."
    icon={<CloudServerIcon aria-hidden="true" />}
    actions={<PageActions />}
  />
  <PageToolbar />
  <PageContent />
</DashboardPage>
~~~

- Title: stable noun phrase, Title Case, no live count in the title.
- Description: one sentence in text-sm text-muted-foreground, active voice, explaining the page’s job.
- Icon: optional only when the page has a clear resource identity; if used, it is decorative (aria-hidden="true") and uses text-primary.
- Actions: only page-level actions. Primary action is first; refresh is secondary and icon-only only when its aria-label is explicit.
- Search/filter controls belong in a page toolbar immediately below the header, not in the header action slot. The exception is a single compact target selector needed to define the page’s data source (Docker Inventory, Monitoring).
- A count appears as Badge variant="secondary" or in the section description, for example 24 servers, never in the h1.

### Canonical page titles

Use these titles exactly: Projects, Deployments, Templates, Requests, Remote Servers, SSH Keys, Docker Swarm, Docker Inventory, Docker Registry, Web Server, Certificates, Git Providers, S3 Storage, SCIM, Single Sign-On, Monitoring, Notifications, Audit Logs, and Tags.

Domain detail can appear in the description or a section title: Web Server with description Configure Caddy routing…; Monitoring with a selected server badge; SCIM with Provision users from your identity provider….

### Legitimate exceptions

- Templates may show Back to catalog while in Studio because it changes the page mode, not because it is a normal collection action.
- Docker Inventory and Monitoring may keep a target/time-range selector in the header because changing it changes the query scope. They still move refresh and secondary filters into the toolbar where possible.
- Resource detail pages may include a contextual Back to Environment link above their tab system; this is navigation and should remain a link, not a generic button.

## 2. Cards, lists, and collection surfaces

### Current inconsistencies

Projects, Remote Servers, SSH Keys, Docker Registry, Git Providers, S3 Storage, Notifications, Tags, and nested Environment/Resource views all use cards, but each has a different anatomy, padding, hover treatment, status treatment, and action placement. Some actions are hidden until hover (Projects, SSH Keys, nested Environment/Resource cards), which makes them difficult to discover and unavailable to keyboard and touch users. Audit Logs and Request details use list/event markup; Docker Inventory and Monitoring use several bespoke table-like surfaces.

### Standard collection card

Use a shadcn Card with the full composition:

~~~tsx
<Card>
  <CardHeader className="flex flex-row items-start justify-between gap-4 p-4">
    <div className="flex min-w-0 items-start gap-3">
      <ResourceIcon />
      <div className="min-w-0">
        <CardTitle className="truncate text-base">Name</CardTitle>
        <CardDescription className="line-clamp-2">Secondary metadata</CardDescription>
      </div>
    </div>
    <StatusBadge />
  </CardHeader>
  <CardContent className="p-4 pt-0">Metadata and description</CardContent>
  <CardFooter className="flex flex-wrap items-center justify-end gap-2 p-4 pt-0">
    <SecondaryAction />
    <PrimaryAction />
    <ActionsMenu />
  </CardFooter>
</Card>
~~~

- Use p-4 for normal cards and p-6 for forms/complex settings. Do not combine card padding with ad hoc bg-card/20, border-border/40, or custom shadows per page.
- Header anatomy is leading icon/avatar, name, secondary metadata, and status. The name is the visual anchor.
- Metadata uses a consistent definition-list treatment for label/value pairs. Labels are text-xs text-muted-foreground; values are text-sm font-medium.
- Actions stay visible on touch and keyboard. Use one or two Button variant="ghost" size="icon-sm" controls with an accessible label, or a DropdownMenu titled Actions when there are three or more actions.
- Do not place an invisible absolute link over an entire card while also nesting interactive controls. Make the name a real link and keep actions as separate controls.
- Use Badge for status, provider, type, and tag metadata. Do not make a status from an unstyled span.

### List item anatomy

Use a list item when the record is event-like or metadata-dense but does not need a table:

1. leading icon/avatar or status marker;
2. min-w-0 flex-1 content column with name and secondary metadata;
3. status or timestamp aligned to the trailing edge;
4. actions in a stable trailing action group;
5. Separator/border between items, not a mixture of divide-y and custom borders.

This is the canonical surface for notification deliveries, SCIM tokens, registered SSO providers, stored certificates, and audit events. Audit events may retain their expandable metadata details, but the outer event row must use this anatomy.

### Exceptions

- Projects, Environments, and Resources are navigational entities and may use cards to show hierarchy and counts. They must still use the shared card anatomy and a visible name link.
- Monitoring stat cards are metric cards, not collection cards; they use the metric pattern in section 11.
- Docker Inventory Info is a responsive metric grid; it is not a collection list.

## 3. Tables

### Current inconsistencies

- Deployments, Requests, Docker Inventory, Docker Swarm, Resource Domains, and parts of Monitoring use tables, while Audit Logs uses a custom article list and Monitoring uses a raw table.
- Header styling, action-column widths, hover states, numeric alignment, and status Badge variants differ.
- Sorting is a text toggle in Requests rather than a consistent sortable header. Most tables have no sort affordance or aria-sort.
- Destructive row actions are icon-only in Docker Inventory and Swarm, while Deployments uses a text button and Audit Logs has no row action.
- Pagination exists in Requests/Templates but is absent or bespoke elsewhere.

### Standard table pattern

- Use the shared Table, TableHeader, TableHead, TableBody, TableRow, and TableCell primitives. Monitoring’s raw table must be migrated.
- Wrap dense tables in overflow-x-auto rounded-lg border and keep the table’s minimum width explicit so mobile can scroll the table without scrolling the page.
- Header labels are short, Title Case, and stable: Service, Environment, Server, Status, Updated, Actions.
- Primary identifier is first; status and state are near the identifier; timestamps are near the end; actions are always last and right-aligned.
- Numeric, duration, byte, count, and ID columns use tabular-nums. Code/ID values use font-mono text-xs and truncate/break-all where appropriate.
- Table rows use hover:bg-accent and focus-within:bg-accent; do not make an entire row clickable unless the row contains a real link/button with a visible focus target.
- Selection is only present when bulk actions exist. Use a leading checkbox column, selected-row background via semantic tokens, and a bulk-action bar above the table.
- Row action group: one visible text action for the primary task (View Logs, Validate); secondary/destructive actions in an Actions dropdown. Icon-only controls need both aria-label and a tooltip.

### Sorting

Sortable headers render a Button variant="ghost" size="sm" inside TableHead, with the active direction icon and aria-sort="ascending|descending". The label remains text; the icon is supplementary. Sort state and filter state are reflected in query parameters so links/bookmarks preserve the view.

### Inline editing

Inline editing is allowed only for a single, low-risk cell such as Swarm node availability or a deployment concurrency value. The canonical flow is: display value → explicit Edit trigger → field with label → Save and Cancel → inline validation/status. Never save silently on blur. A pending save disables only the edited control and shows Saving… with a Spinner.

### Table-specific application

- Deployments: History and Queue use the standard table; View Logs is the primary row action; cancelling a queued job is destructive and confirmed with AlertDialog.
- Requests: retain the table plus pagination and Sheet detail; convert the keyboard-clickable row into a semantic link/button target or a row action button.
- Docker Inventory: use the same table for Containers, Images, Volumes, Networks, and Services. Put upload/remove controls in the row action menu.
- Docker Swarm: Nodes and Tasks use the same table; node availability is the documented inline-edit exception.
- Audit Logs: keep an event list because the expanded JSON metadata is better than a wide table, but use the standard list anatomy and standard pagination footer.
- Resource Domains and Monitoring container metrics use the standard Table; no raw table markup.

## 4. Tabs and secondary navigation

### Current inconsistencies

Deployments and Resource Detail use shadcn Tabs, while Docker Inventory uses a custom vertical list of Buttons. Monitoring uses sections without tabs. Tab state is local React state in many places rather than URL state.

### Standard pattern

- Use Tabs, TabsList, TabsTrigger, and TabsContent for peer views of the same dataset or resource.
- Tabs are horizontal and scrollable on small screens; they do not wrap into multiple rows. Use an accessible overflow strategy rather than shrinking labels below text-sm.
- Active tab uses the primitive’s semantic active state; do not hand-roll bg-muted/80/text-primary classes.
- Persist tab state in the URL (?tab=history, ?tab=containers) where a user can reasonably share or revisit the view.
- Tab labels are nouns, not mixed action phrases: History, Queue, Concurrency; Nodes, Tasks; General, Environment, Deployments, Logs.

### Exceptions

- Resource Detail has many tabs and may use a horizontally scrollable tab list with icons. It must keep the same primitive and URL state.
- Docker Inventory has six peer data kinds and may use a responsive vertical navigation layout on desktop, but it should be composed from the same Tabs state model and use a mobile Sheet or horizontal scroll.

## 5. Dialogs, Sheets, Drawers, and confirmations

### Current inconsistencies

- Creation/edit flows use Dialog, but width, padding, rounded corners, header density, and footer alignment are page-specific.
- Destructive confirmation is split between AlertDialog, plain Dialog, confirm(), and window.confirm() across Deployments, Docker Inventory, Web Server, Notifications, Tags, Projects, and nested Project/Environment/Resource pages.
- Requests correctly uses a Sheet for request details; other quick-edit/filter opportunities use full Dialogs.
- Some dialogs use Saving..., Testing..., and Deleting...; the product otherwise uses the typographic ellipsis (…).

### Standard overlay selection

- Dialog: create, edit, import, reveal, inspect, logs, and other focused workflows that need a modal surface.
- Sheet: request details, filter panels, quick edits, and long read-only detail views that benefit from preserving page context.
- AlertDialog: any destructive or irreversible action, including delete, revoke, remove, restore, rotate credentials, force-remove Docker resources, drain/remove Swarm nodes, and destructive cleanup.
- Drawer: mobile-first bottom-sheet workflow only when the content is short and touch-oriented. Do not create a fourth ad hoc overlay type.

### Canonical structure

~~~tsx
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Remote Server</DialogTitle>
      <DialogDescription>Connect a server using SSH.</DialogDescription>
    </DialogHeader>
    <form>…</form>
    <DialogFooter>
      <Button type="button" variant="outline">Cancel</Button>
      <Button type="submit">Create Server</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
~~~

- Every Dialog/Sheet/Drawer has a real title; use sr-only only when the visible title is intentionally supplied elsewhere.
- Keep DialogHeader, body content, and DialogFooter in that order. Dialog body is scrollable with max-h-[calc(100dvh-1rem)] and overscroll-contain.
- Desktop footer order is Cancel then primary action. Mobile actions are full width and retain the same semantic order. The primary action is always the last action in the DOM.
- Cancel uses variant="outline" for forms and variant="ghost" for secondary close-only flows; do not alternate without a reason.
- Submit labels describe the result: Create Project, Save Changes, Generate Key, Import SSH Key, Test Connection, Restore Backup.
- Pending labels use …: Saving…, Testing…, Deleting…, Generating…. Disable the submit action while the request is pending and show a Spinner with data-icon="inline-start".
- Avoid autoFocus except for a single obvious desktop form input; never use it in long or mobile dialogs without testing.

### Destructive confirmation copy

Use this form:

~~~text
Delete [object name]?
[Object name] will be permanently deleted. This action cannot be undone.
~~~

The destructive action label is Delete [Object], Revoke [Object], Remove [Object], or Restore Backup, never just Confirm or Continue.

For high-impact actions, add a second sentence explaining the consequence and require a typed phrase. Web Server backup restore should use Type RESTORE_WEB_SERVER to confirm, not a browser confirm.

### Exceptions

- Long log viewers may use a full-height Dialog with a code surface and a Copy Logs action.
- Requests’ detail panel is correctly a Sheet because the table remains the user’s context.
- The one-time generated SSH private-key reveal is a Dialog with an explicit Copy Private Key and I’ve saved it gate; this is a security-specific exception to the normal form footer.

## 6. Forms and field conventions

### Current inconsistencies

Most forms use raw div + Label + control stacks. Notifications and Tags already use shadcn FieldGroup/Field, while other pages use custom space-y-2 wrappers. Required indicators, helper text, validation, input names, autocomplete, field IDs, and error placement vary. Some forms use raw input checkboxes and custom toggle buttons.

### Standard pattern

Use FieldGroup and Field for all new and refactored forms:

~~~tsx
<FieldGroup>
  <Field data-invalid={Boolean(error)}>
    <FieldLabel htmlFor="server-name">Name <RequiredMark /></FieldLabel>
    <Input
      id="server-name"
      name="name"
      autoComplete="off"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? "server-name-error" : undefined}
    />
    {error ? <FieldError id="server-name-error">{error}</FieldError> : <FieldDescription>…</FieldDescription>}
  </Field>
</FieldGroup>
~~~

- Labels are sentence case and match the canonical field name: Server Name, Access Key ID, Private Key, Email Domain.
- Required fields use a consistent visible * with an accessible explanation at the form level, or the text (required) where the field is security-sensitive. Optional fields are explicitly labeled only when the form has required fields.
- Helper text is directly below the control, uses FieldDescription, and explains format, consequence, or next step. Do not put validation only in a toast.
- Validation is inline, adjacent to the field, uses data-invalid on Field and aria-invalid on the control, and focuses the first invalid field on submit.
- Inputs are full width by default, h-9, and use w-full. Two-column groups begin at md and collapse to one column on mobile.
- Use the correct input types: email, url, number, password, date, and file. Use inputMode where useful. Add name, autoComplete, and spellCheck={false} for credentials, codes, usernames, and YAML/PEM/code fields.
- Placeholders end with … and show an example, e.g. https://registry.example.com…. Never use a placeholder as the only label.
- Use Textarea/CodeEditor for PEM, YAML, JSON, Caddyfile, logs, and keys. Use monospace and break-all for long code/secret values.
- Use Switch for a binary preference, Checkbox for a binary form option, RadioGroup for mutually exclusive choices, ToggleGroup for 2–7 peer options, and Select/Combobox for long choices. Do not hand-roll segmented controls with buttons.

### Page-specific form groups

- SSH Keys: Generate vs. Import is a ToggleGroup; generated private keys are one-time output, not a normal editable field.
- Git Providers: provider-specific fields are grouped under a FieldSet/legend. Keep provider selection first and expose only relevant fields.
- SSO: OIDC vs. SAML should be a ToggleGroup/radio group with the conditional fields in a clearly labeled fieldset.
- Templates and Web Server: code editors need a visible label, helper text, fixed loading/editor height, and a validation Alert below the editor.
- S3 additional flags and Web Server middlewares are repeatable field groups. Each row has a visible label/index, an Add action, a Remove action with an accessible label, and inline validation.

## 7. Buttons and call-to-action hierarchy

### Current inconsistencies

The same create intent is labeled New, Add, Create, Store, Save, Register, and Update. Destructive actions alternate between ghost buttons, red text icons, variant="destructive", and native browser dialogs. Some buttons use icon-only controls without consistent tooltip/label treatment.

### Standard hierarchy

- Primary: Button default variant; one per decision area. It creates, saves, submits, deploys, or applies the main change.
- Secondary: Button variant="outline"; refresh, test, validate, export, copy, or alternative path.
- Tertiary: Button variant="ghost"; cancel, close, back, or low-emphasis navigation.
- Destructive: Button variant="destructive"; only inside a confirmed destructive flow or for an explicit destructive submit after the confirmation step.
- Links: use real Link/a for navigation and external destinations. Do not use clickable div, span, or button for navigation.

### Canonical labels

- Managed records: Create Project, Create Template, Create Server, Create Tag, Create Certificate, Create Destination, Create Registry, Create Notification.
- Credentials/integrations: Add SSH Key, Add Git Provider, Connect Provider, Create Provider Token.
- Editing: Save Changes, Save Configuration, Update [Object] only when the object noun adds clarity.
- Operational: Refresh, Test Connection, Validate Server, View Logs, Copy Logs, Run Now, Retry Delivery, Rotate Token, Show DNS Challenge.
- Destructive: Delete Project, Delete Server, Remove Provider, Revoke Provider, Force Remove Container, Restore Backup.
- Empty-state primary actions repeat the page action exactly; do not use Get Started when Create Project is known.
- Never use ...; use … for pending labels and copy.

### Icon rules

Use an icon plus text for page-level and modal actions. Icon-only is allowed for refresh, edit, delete, copy, close, and row actions only when the button has an aria-label and a tooltip. Icons inside Button use data-icon="inline-start"/"inline-end"; do not add manual icon sizing inside Button unless the primitive requires it.

## 8. Search, filtering, sorting, and query state

### Current inconsistencies

Search appears in page headers (Projects), card headers (Deployments/Audit Logs/Templates), or custom filter rows (Docker Inventory/Requests). Some filters reset pagination, but filter state is generally local and not URL-addressable. Reset/clear affordances are inconsistent.

### Standard toolbar

Use one PageToolbar composition beneath the page header:

~~~tsx
<div className="flex flex-wrap items-center gap-2">
  <SearchField placeholder="Search projects…" />
  <FilterSelect label="Status" />
  <FilterButton />
  <ActiveFilterChips />
  <Button variant="ghost" size="sm">Clear Filters</Button>
</div>
~~~

- Search has a leading Search icon, an accessible label, type="search", and a clear button once text exists.
- One or two simple filters stay inline. Three or more filters move into a Sheet opened by Filters, with an active-filter count and Apply Filters/Clear All actions.
- Filter values are shown as removable Badge variant="secondary" chips below the toolbar when active.
- Clear behavior resets only the current page’s filter state and returns pagination to page 1.
- Search/filter/sort/page/tab state is synchronized to URL query parameters. The user should be able to refresh, share, and use browser Back/Forward without losing state.
- Debounce free-text search before querying; do not make every keystroke trigger a heavyweight request.

### Application

- Projects: search in the toolbar.
- Templates: search plus separate catalog/template pagination; keep the two datasets’ state independent.
- Audit Logs: search, action, and resource filters in the toolbar; show chips and total.
- Requests: date range, status group, sort field, and direction in a Filter Sheet on small screens and an inline toolbar on large screens.
- Deployments: search History and a Queue state filter; do not place search in the page header.
- Docker Inventory: target selector is scope; Containers additionally expose search/state filters; logs expose target/service/tail/follow controls.
- Web Server logs: refresh interval and line count are component controls, not global page filters.

## 9. Status, health, and state indicators

### Current inconsistencies

Equivalent states use different labels and colors: Success, Connected, Ready, Healthy, and Active all use different combinations; Running is blue in Deployments but green in Docker; Needs setup, Not configured, Inactive, and Unknown use no common mapping. Raw color utilities appear throughout status badges and dots.

### Standard status vocabulary

Use a shared StatusBadge with an optional semantic icon and a text label. Do not rely on color alone.

| Semantic state | Badge variant | Canonical labels | Icon family |
|---|---|---|---|
| positive | success | Healthy, Ready, Connected, Active, Enabled, Success, Succeeded, Passed | Check circle |
| in progress | info | Running, Checking, Setting Up, In Progress | Activity/loader |
| attention | warning | Queued, Pending, Needs Setup, Degraded, Not Configured, Needs Attention | Clock/alert |
| failure | destructive | Failed, Error, Unavailable, Rejected | X/alert |
| neutral | secondary | Inactive, Disabled, Unknown, None, Not Recorded | Minus/info |

Label transformations are explicit and human-readable: setting_up → Setting Up, dead_letter → Dead Letter, 5xx → 5xx. Do not render raw machine values with only replace("_", " ") when capitalization or terminology needs correction.

Use Badge for status, Progress for continuous values, and a status dot only inside a Badge or a clearly labeled health row. A pulsing animation is reserved for active asynchronous work, not every Healthy state. Respect prefers-reduced-motion.

### Page mapping

- Projects/Environments/Resources: Active, Production, or the actual resource runtime state.
- Deployments: Success, Running, Queued, Failed.
- Remote Servers: Ready, Setting Up, Failed.
- Git Providers: Connected, Needs Setup.
- SSO/SCIM: Verified, Not Verified, Active, Revoked as appropriate.
- Monitoring: Healthy, Not Configured, Needs Attention; score thresholds use Progress plus a Badge.
- Web Server security checks: Passed, Warning, Failed.
- Docker resources: Running, Paused, Exited, Dead, Removing, with the same semantic mapping everywhere.

## 10. Empty, no-result, unavailable, and error states

### Current inconsistencies

Notifications/Templates/Swarm already use the shadcn Empty component, but Projects, Servers, SSH Keys, Git Providers, S3, Docker Registry, Tags, Certificates, Deployments, Docker Inventory, Monitoring, Requests, SCIM, SSO, and nested Project/Environment/Resource views mostly use bespoke div/p markup. Copy varies between Title Case, sentence case, punctuation, and No … Found.

### Standard Empty component

Use Empty for every full collection or filtered-result empty state:

~~~tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><ResourceIcon aria-hidden="true" /></EmptyMedia>
    <EmptyTitle>No Projects Yet</EmptyTitle>
    <EmptyDescription>Create a project to organize environments and resources.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent><Button>Create Project</Button></EmptyContent>
</Empty>
~~~

Canonical copy:

- no data: No [Plural] Yet + Create your first [singular] to [outcome].
- filtered: No [plural] Match Your Filters + Clear filters or try another search.
- unavailable: use Alert variant="destructive" with Retry/Refresh, not Empty.
- permission/organization missing: use an Alert or Empty titled Select an Organization with the organization switcher/action.
- no activity: No [activity] Recorded Yet + explain when it appears.

Use sentence-style descriptions; reserve Title Case for titles and buttons. Do not render a blank card or only No data.

### Exceptions

- A log/code viewer may use a compact inline message such as No Logs Available inside the viewer.
- A chart with no historical samples should say Collecting Historical Samples…; that is a loading/data-collection state, not an empty collection.
- A repeatable form section may use a compact Empty or inline dashed row (No Managed Middlewares Configured) provided it still has a clear Add action.

## 11. Loading and asynchronous states

### Current inconsistencies

Most pages show centered Spinners even when the final layout is known. Templates mixes Loader2, text, and custom animation; Web Server, SSH Keys, Docker, Monitoring, Requests, and Deployments use different spinner sizes and message placement. There is little component-level Skeleton coverage.

### Standard pattern

- Page-level unknown layout: centered Spinner with Loading [page]…, role="status", and aria-live="polite".
- Known card/list/table layout: Skeleton placeholders matching final dimensions and number of rows/cards. If a card is h-[200px], its loading card is exactly h-[200px]; do not cause layout shift.
- Table loading: render 5–8 TableRows with cell-shaped Skeletons, preserving column widths.
- Card grid loading: render the same number of card shells at the responsive breakpoint.
- Component refetch: preserve existing content and show a small Spinner in the affected header/control; do not blank the whole page.
- Button mutation: keep the button label semantics and prepend Spinner; pending label uses … (Saving…, Testing…).
- Use aria-busy="true" on the loading region and announce meaningful async state changes with aria-live="polite".
- Do not use animate-pulse as a substitute for Skeleton geometry or a status indicator.

### Page-specific behavior

- Deployments/Requests/Logs: preserve the table shell while rows load.
- Monitoring/Docker Inventory: preserve stat/card geometry while data refetches.
- Templates: preserve editor height and catalog card dimensions while queries load.
- SSH key reveal, setup, terminal, and GPU operations may use a Spinner because the duration is indeterminate and the content is an operation dialog.

## 12. Pagination and long datasets

### Current inconsistencies

Requests uses Previous/Next only; Audit Logs uses custom icon buttons; Templates uses a richer Pagination component; Deployments has no pagination; Docker Inventory and Web Server logs show bounded or unbounded lists without a shared page-size pattern.

### Standard pattern

Use the shared Pagination primitive at the bottom of the collection surface:

- left: total count and visible range, e.g. Showing 1–25 of 148;
- middle/left on wide screens: page-size Select (25, 50, 100);
- right: numbered pages when there are enough pages, plus Previous and Next labels;
- disabled controls use disabled and aria-disabled only as supplemental state;
- page, page size, filters, sort, and search are URL parameters.

Use Load More only for append-only activity feeds where preserving scroll is more valuable than random access. Use a bounded window for logs and live queues; do not add numbered pagination to an actively streaming terminal.

### Exceptions

- Audit Logs and Requests should use numbered pagination because users need historical navigation.
- Templates’ Built-in Catalog and Your Catalog keep separate paginators because they are separate datasets.
- Deployments Queue, Docker Inventory resource lists, and Web Server recent runs may use bounded windows, but must state the window size and offer Refresh/View All where applicable.

## 13. Notifications, toasts, alerts, and feedback

### Current inconsistencies

The app correctly centralizes Sonner through Providers, but success/error/info copy varies widely, some actions use a toast for validation that should be inline, and page-level errors are mixed with empty state copy. There are no consistent rules for warning/info toasts or live announcements.

### Standard feedback model

- Toast: short-lived confirmation of a completed action, copy-to-clipboard result, background operation queued, or recoverable transient error.
- Inline FieldError: input-specific correction required before submit.
- Inline Alert: page/section query failure, security warning, validation result, or an action that needs persistent attention.
- AlertDialog: destructive decision before the action.
- Persistent status region: long-running setup, provisioning, restore, streaming, or monitoring state.

Use the global <Toaster richColors /> as the only toast host. Standardize placement to bottom-right on desktop and bottom-center on mobile, with a maximum of three visible toasts. Sonner already provides the host; the wrapper should expose consistent aria-live="polite" behavior.

### Canonical copy

- success: [Object] created, [Object] updated, [Object] deleted, [Operation] queued, [Value] copied to clipboard.
- error: [Action] failed. [Next step or recovery].
- warning: [Object] needs attention. [Consequence or next step].
- info: [Operation] is in progress… or [Feature] is not configured.

Avoid exclamation marks, vague Something went wrong, duplicated success toasts, and server error strings without a user-facing next step. Use toast.promise or the mutation lifecycle only once per operation.

## 14. Accessibility, interaction, and motion contract

- Icon-only controls: aria-label, tooltip, and visible focus ring.
- Controls: explicit Label/htmlFor or an accessible name; native button for actions and Link/a for navigation.
- Decorative icons: aria-hidden="true".
- Async status: role="status"/aria-live="polite" for non-error updates; role="alert" for errors.
- Tables: semantic headers, aria-sort for sortable columns, no row click behavior without keyboard support.
- Dialog/Sheet/Drawer: title, description where useful, trapped focus, Escape to close unless the operation is pending, overscroll-behavior: contain, and focus return to the trigger.
- Destructive actions: confirmation dialog or an explicit undo window; never immediate browser confirm().
- Use prefers-reduced-motion for pulsing status dots, chart transitions, spotlight effects, and modal/dropdown animations. Animate only opacity/transform; never use transition: all.
- Keep touch targets at least the shadcn size-9 default for icon actions; use size-8 only for dense table actions with a tooltip and adequate row spacing.
- Dates and numbers use Intl.DateTimeFormat/Intl.NumberFormat; counts/durations/metrics use tabular-nums.

## 15. Page coverage and migration notes

This table is the implementation index. The pattern rules above are the source of truth; the notes identify each page’s unique surfaces.

| Page | Surfaces to standardize | Required exception or note |
|---|---|---|
| Projects | Project card grid, search, create/duplicate/delete dialogs, project → environment → resource cards | Keep hierarchy cards; replace hover-only actions and custom empty markup. |
| Deployments | History/Queue tables, Concurrency cards/form, Logs Dialog, cancel action | Logs remain a full-height Dialog; replace native cancel confirmation. |
| Templates | Metric cards, Studio form/editor, AI panel, catalog cards, search, two paginators, deploy Dialog, delete AlertDialog | Studio/editor is a full-page mode; fixed editor height is required. |
| Requests | Access-log settings, cleanup form, stats/chart, filters, table, pagination, detail Sheet | Sheet is the canonical detail exception; keep date-range chart controls. |
| Remote Servers | Server cards, status/setup flow, validation Dialog, create/edit form, delete flow | Validation is an operation Dialog; replace raw color dots. |
| SSH Keys | Key cards, generate/import mode, edit/rotate, one-time reveal Dialog, delete flow | One-time private-key reveal is a security-specific Dialog exception. |
| Docker Swarm | Organization/engine alerts, initialization form, join command cards, Nodes/Tasks tabs and tables, node inline state, action AlertDialog | Join commands remain code/copy cards; destructive node actions require confirmation. |
| Docker Inventory | Target selector, resource-kind navigation, Info metrics, five resource tables, Logs/Stats controls, terminal/log surfaces | Use responsive Tabs state; code/log panels may use semantic code tokens. |
| Docker Registry | Registry cards, CRUD Dialog, test connection, delete confirmation | Server selection should be a Select/Combobox, not a free ID input. |
| Web Server | Security audit, backup schedule/run list, control menus, status, settings/code editors, HTTPS cards, logs, GPU/env/ports Dialogs, terminal | High-risk restore/cleanup must use typed AlertDialog confirmation. |
| Certificates | PEM form, stored-certificate list, edit state, delete AlertDialog | PEM fields use monospace, spellCheck={false}, and inline validation. |
| Git Providers | Provider cards, connection status, OAuth/install links, provider-specific form, delete flow | Provider choice is a fieldset; external destinations remain real links. |
| S3 Storage | Destination cards, provider/credential form, repeatable flags, test connection, delete flow | Secret fields use edit-mode leave blank to keep existing helper text. |
| SCIM | Token creation, one-time token reveal/copy, provider-token list, rotate/revoke flows | Token output must stay in a live warning region and never be re-shown. |
| Single Sign-On | Enforcement Switch, provider list, DNS challenge/verification, OIDC/SAML form, remove flow | OIDC/SAML choice is a shared option set; DNS verification is a persistent inline status. |
| Monitoring | Server/range selectors, agent status, metric cards, thresholds form, charts, container table, runtime details | Chart color inputs use chart tokens; migrate raw table to Table. |
| Notifications | Empty state, channel cards, test/edit/remove actions, delivery activity, provider form Dialog | Replace native confirm; provider form already demonstrates the canonical Field pattern. |
| Audit Logs | Search/action/resource toolbar, event list with expandable metadata, pagination | Event list is the documented table exception; keep semantic time and expandable details. |
| Tags | Tag list, color badge, validation form, create/edit Dialog, delete flow | Keep color picker as a native input, but pair it with semantic validation and no raw status color classes. |

## 16. Recommended shared components

Create or consolidate these reusable building blocks before page-by-page migration:

- DashboardPage / DashboardPageHeader / PageToolbar
- StatusBadge with semantic variants and icon mapping
- PageEmpty built on Empty
- PageSkeleton, CardGridSkeleton, TableSkeleton
- SearchField, FilterSelect, FilterSheet, ActiveFilterChips
- TableToolbar, TablePagination, SortableTableHead, RowActions
- ConfirmActionDialog built on AlertDialog
- FormSection, RequiredMark, and the FieldGroup/Field composition
- ResourceCard/ResourceListItem for Project, Environment, Resource, Server, Registry, S3, Git, SSH, and Notification collections
- OperationDialog for setup, validation, restore, GPU, terminal, and log operations

Shared components own tokens, spacing, focus, loading, and copy conventions. Page files should supply resource data and domain-specific labels, not reimplement visual primitives.

## 17. Definition of done

A page is standardized when:

- it uses the shared page/header/toolbar structure;
- all colors are semantic tokens or approved chart/code tokens;
- the collection surface uses the correct Card/List/Table pattern;
- all destructive actions use AlertDialog and all critical actions have explicit labels;
- forms use FieldGroup/Field, inline validation, correct input metadata, and consistent pending labels;
- loading states preserve final geometry with Skeletons;
- empty states use Empty with canonical copy;
- filters, tabs, sorting, and pagination are URL-addressable where stateful;
- status labels/icons/variants match the shared mapping;
- toasts, inline Alerts, and field errors follow the feedback model;
- keyboard, screen-reader, reduced-motion, mobile, and long-content behavior have been checked; and
- the same action uses the same shadcn primitive everywhere in the 19-page set.

