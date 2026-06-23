# Product Requirements Document — Autopilot

| Field | Value |
|---|---|
| Product | Autopilot — Project Planning & Critical-Path Web App |
| Document version | 1.1 (Updated — chart rendering decisions) |
| Author | Shankar (PMO, Truflo AI) |
| Date | 19 June 2026 |
| Status | For review |
| Reviewers | Puneet (Product), Shankar (Dev/Data Infra), Achin (DevOps/Security) |

---

## 1. Overview

Autopilot is a browser-based, local-first project planning tool that lets a single user model a portfolio of projects, break each project into Versions (1…n) and Phases (0…n), declare what must finish before what can start, and automatically compute and visualize a **PERT network** and a **Gantt chart** at both the project and portfolio level. The current state of any project — or the whole portfolio — can be exported on demand as a **PowerPoint, PDF, or Word** deliverable.

All data lives in the user's own browser via local storage. There is no backend and no account in v1: the app shell is cached for offline use and the user's portfolio is retained between sessions on the same device and browser profile.

The first reference dataset is the Truflo AI portfolio (~19 initiatives spanning scraping, trending, ClickHouse migration, security/VAPT, automation testing, product launch, and revenue), which is the planning work Autopilot is designed to automate.

## 2. Problem statement

Portfolio planning today is done by hand across Excel, Markdown, and Confluence. Each refresh of dependencies, critical path, or status means rebuilding charts and re-exporting documents manually. This is slow, error-prone, and hard to keep consistent across formats. Specifically:

- Dependencies and the resulting critical path are recomputed manually whenever an estimate or sequence changes.
- The same plan must be re-rendered separately as a PERT network, a Gantt chart, and as slides/PDF/Word for different audiences.
- There is no single source of truth that survives between planning sessions without manual file management.

Autopilot makes the plan the source of truth: enter projects, versions, phases, durations, and dependencies once, and every view and export is derived automatically and stays in sync.

## 3. Goals and non-goals

### 3.1 Goals
- Let a user create and manage a portfolio of projects, each with a start and end date.
- Support a Project → Version (1…n) → Phase (0…n) → Task hierarchy.
- Capture finish-to-start (and optionally other) dependencies at any level.
- Auto-compute three-point (PERT) durations, forward/backward pass, slack, and the critical path.
- Render an interactive PERT network and a Gantt chart per project and for the full portfolio.
- Export the latest state to PPTX, PDF, and DOCX.
- Persist all data locally in the browser and work offline.

### 3.2 Non-goals (v1)
- No server, cloud sync, or multi-device access.
- No real-time multi-user collaboration.
- No authentication/identity provider integration.
- No resource leveling, cost/budget tracking, or capacity planning.
- No direct Jira/Confluence write-back (export is the integration path for v1).

## 4. Target users and personas

| Persona | Description | Primary need |
|---|---|---|
| Portfolio planner (primary) | PMO / delivery lead managing 10–25 concurrent initiatives | Model dependencies once; get critical path, Gantt, and shareable docs automatically |
| Project owner | Owns one project, plans its versions/phases | A clean per-project Gantt and PERT they can present |
| Stakeholder (consumer) | Leadership reviewing status | A clear exported PPTX/PDF, no tool to learn |

## 5. User stories

- As a planner, I can add a project with a name, start date, and end date so it appears in my portfolio.
- As a planner, I can add Versions (V1…Vn) and Phases (Phase 0…n) under a project and give each its own dates.
- As a planner, I can mark that one item must finish before another can start, so sequencing is explicit.
- As a planner, I can enter optimistic / most-likely / pessimistic durations and have the expected duration computed for me.
- As a planner, I can see the critical path highlighted across my PERT network so I know which slips move the end date.
- As a project owner, I can open a single project and see its Gantt chart with dependencies and critical path.
- As a planner, I can export the latest state of one project or the whole portfolio as PPTX, PDF, or DOCX.
- As any user, I can close the browser and reopen Autopilot later and find my portfolio intact.
- As any user, I can export and re-import a backup file so I never lose my data if browser storage is cleared.

## 6. Functional requirements

### 6.1 Project management

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | User can create a project with: name (required), description, owner, start date, end date, status, and a color/tag. | Must |
| FR-2 | User can edit and delete projects. Deleting a project warns if other items depend on it and lists those dependents. | Must |
| FR-3 | The portfolio view lists all projects with key fields (dates, status, % complete, critical-path duration). | Must |
| FR-4 | Project end date must be ≥ start date; the app validates and blocks invalid ranges with a clear message. | Must |
| FR-5 | User can duplicate a project (with its versions/phases) as a template for a new one. | Should |

### 6.2 Versions and phases (hierarchy)

| ID | Requirement | Priority |
|---|---|---|
| FR-6 | Under a project, user can add Versions labeled V1…Vn (auto-incrementing, editable). | Must |
| FR-7 | Under a version (or directly under a project), user can add Phases labeled Phase 0…n. Phase 0 is the conventional groundwork/setup phase. | Must |
| FR-8 | Each version and phase has its own start date, end date, and optional owner. | Must |
| FR-9 | A phase can contain Tasks (the finest planning unit used for PERT estimation). Tasks are optional; planning can stop at phase level. | Should |
| FR-10 | Child date ranges are validated against the parent (a phase outside its project window raises a non-blocking warning). | Should |
| FR-11 | Hierarchy is reorderable (drag to re-sequence versions/phases/tasks). | Should |

### 6.3 Dependencies

| ID | Requirement | Priority |
|---|---|---|
| FR-12 | User can declare a dependency: "X must finish before Y can start" between any two items at the same or different levels (project↔project, phase↔phase, task↔task). | Must |
| FR-13 | Default dependency type is Finish-to-Start (FS). Optional support for Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF) and a lead/lag in days. | Should |
| FR-14 | The app prevents circular dependencies. On a cycle attempt, it blocks the action and names the cycle (e.g., "A → B → A"). The dependency graph must remain a DAG. | Must |
| FR-15 | Dependencies are visible and removable both in a list view and directly on the PERT/Gantt charts. | Must |

### 6.4 PERT chart and scheduling engine

| ID | Requirement | Priority |
|---|---|---|
| FR-16 | Each schedulable item accepts a three-point estimate: optimistic (O), most likely (M), pessimistic (P). The app computes expected duration te = (O + 4M + P) / 6 and variance σ² = ((P − O) / 6)². | Must |
| FR-17 | The engine runs a forward pass (earliest start/finish) and backward pass (latest start/finish) and computes slack per item. | Must |
| FR-18 | Items with zero slack are flagged as the critical path and visually highlighted. | Must |
| FR-19 | The PERT view renders an activity-on-node network: nodes show name and te; arrows show dependencies; the critical path is color-distinct. | Must |
| FR-20 | PERT is available per project and for the full portfolio (projects as nodes). | Must |
| FR-21 | The engine recomputes automatically whenever an estimate, date, or dependency changes. | Must |
| FR-22 | If estimates are missing, the app falls back to the entered start/end dates as the duration and flags the item as "estimate pending." | Should |
| FR-23 | The app reports project/portfolio expected duration and, where variance is available, an estimated completion-probability range. | Could |

#### 6.4.1 PERT rendering decisions (confirmed)

The PERT network is rendered entirely client-side as an SVG activity-on-node diagram. The following decisions are locked for v1:

**Layout engine — required, not optional.** Node positions must be computed by an automatic DAG layout algorithm (Sugiyama layered layout is the preferred approach). Hand-positioning is not viable once the node count exceeds ~10. The layout runs after every graph change and produces a collision-free, direction-consistent node arrangement before the SVG is painted. Candidate libraries: `elkjs` (ELK Layered) or `dagre`. Engineering owns final selection; the interface is: `layout(nodes, edges) → nodes with x/y`.

**Node anatomy.** Each node shows:
- Project/phase/task name (primary label, 14px medium)
- Expected duration te in weeks/days (12px secondary)
- Earliest start / earliest finish (ES/EF) and latest start / latest finish (LS/LF) in a four-quadrant footer (standard PERT box format, 11px)
- Slack value (shown as "Slack: n" or "Critical" if zero)

**Critical path styling.** Critical-path nodes use the danger color ramp (red fill/border); all other nodes use a neutral ramp. Arrows on the critical path are drawn with a heavier stroke weight and the same red color. A non-color cue (bold border or a "CP" badge) ensures accessibility for color-blind users.

**Interactivity.** Nodes are clickable; clicking a node opens the item editor. Hovering a node highlights all its incoming and outgoing dependency arrows. The chart is pannable and zoomable (pinch/scroll). A "fit to screen" button resets the viewport.

**Export rasterization.** For PPTX/PDF/DOCX export the SVG is serialized, drawn onto an off-screen `<canvas>` at 2× device pixel ratio, and captured as PNG. The PNG is embedded in the document. No external rendering service is involved.

### 6.5 Gantt chart

| ID | Requirement | Priority |
|---|---|---|
| FR-24 | Each project has a Gantt view: a time axis with bars for versions, phases, and tasks, grouped hierarchically and collapsible. | Must |
| FR-25 | Dependency links are drawn between bars; the critical path is highlighted consistently with the PERT view. | Must |
| FR-26 | A portfolio-level Gantt shows all projects on one timeline (project-level bars). | Must |
| FR-27 | Today marker, zoom (day/week/month), and horizontal scroll are supported. | Should |
| FR-28 | Bars are editable by drag (move/resize) where the item is not fully constrained by dependencies; edits feed back into the engine. | Could |

#### 6.5.1 Gantt rendering decisions (confirmed)

The Gantt chart is rendered client-side as an SVG or canvas element. The following decisions are locked for v1:

**Granularity levels — two modes, toggled by the user.**

*Portfolio Gantt (default view):* one bar per project. The bar spans the project's computed earliest start to latest finish. This is the view shown on the portfolio dashboard. With ~19 Truflo AI projects the chart is approximately 17 weeks wide.

*Project Gantt (project detail view):* drill-down to version → phase → task within one project. The left panel shows a collapsible tree (Version V1 › Phase 0 › Task A). Each row has one bar. Rows collapse/expand without affecting the schedule. This is the view that gives project owners their per-project timeline.

Switching between modes does not require navigation — both are tabs within the same screen.

**Bar anatomy.** Each bar shows:
- Item name (truncated with ellipsis if the bar is too narrow; full name in a tooltip on hover)
- Duration label inside the bar when wide enough (e.g., "4w")
- Finish-to-start dependency arrows drawn as angled lines connecting bar right-edges to bar left-edges; arrows on the critical path use the same danger ramp as the PERT

**Critical path styling.** Critical bars use the danger color ramp (matching the PERT). Non-critical bars use the info/neutral ramp. A "CP" label badge is added to critical bars for non-color accessibility.

**Time axis.** The axis label granularity adapts to zoom level: weeks at the default portfolio view, days when zoomed in to a single project. The current-date marker is a vertical dashed line.

**Zoom and scroll.** Pinch/scroll zooms the time axis. A zoom-to-fit button frames all bars. Horizontal scroll is always available. The left label panel is sticky.

**Resize and dependency enforcement.** In v1, bars are not drag-editable (FR-28 is Could priority). Bar positions are derived from the scheduling engine output only. Drag editing, if added in a later milestone, must re-run the engine and show a warning when a drag would violate a dependency constraint rather than silently accepting an invalid state.

**Export rasterization.** Identical approach to PERT: SVG → canvas at 2× DPR → PNG embedded in PPTX/PDF/DOCX. Long Gantt charts are split across pages in PDF/DOCX if they exceed one page width at a legible scale.

### 6.6 Export and reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-29 | User can export the latest state of a single project or the whole portfolio. | Must |
| FR-30 | Export to PowerPoint (.pptx): title slide, portfolio summary, per-project slides each containing the Gantt and/or PERT and key dates, and a critical-path summary slide. | Must |
| FR-31 | Export to PDF: a paginated report containing the same content, with rendered charts as images and dependency/critical-path tables. | Must |
| FR-32 | Export to Word (.docx): a structured document (headings per project, tables of versions/phases/dates/owners/slack, embedded chart images). | Must |
| FR-33 | Exports are generated entirely client-side (no upload of project data to any server). | Must |
| FR-34 | Export includes a generated-on timestamp and the app/data version. | Should |
| FR-35 | User can choose what to include (charts only, tables only, selected projects). | Could |

### 6.7 Local persistence and offline

| ID | Requirement | Priority |
|---|---|---|
| FR-36 | All portfolio data persists in the browser using structured local storage (IndexedDB) and survives browser/tab close and reopen on the same device and profile. | Must |
| FR-37 | The app shell and assets are cached so the app loads and functions offline after first visit (installable PWA). | Must |
| FR-38 | Data is scoped per browser profile. The app shows which local "workspace" is active and lets the user name it. | Should |
| FR-39 | User can export the entire portfolio to a single JSON backup file and re-import it to restore or move to another browser/device. | Must |
| FR-40 | The app handles storage-quota errors gracefully and warns the user before data loss is likely. | Must |
| FR-41 | A clearly labeled "reset / clear all data" action exists, with confirmation. | Should |

## 7. Data model

```
Workspace
  id, name, createdAt, schemaVersion

Project
  id, workspaceId, name, description, owner, status,
  startDate, endDate, color

Version
  id, projectId, label (e.g., "V1"), startDate, endDate, owner, order

Phase
  id, projectId, versionId (nullable), label (e.g., "Phase 0"),
  startDate, endDate, owner, order

Task                       // optional finest unit
  id, phaseId, name, owner,
  optimistic, mostLikely, pessimistic,   // days/weeks
  computedTe, variance,
  earliestStart, earliestFinish, latestStart, latestFinish, slack,
  isCritical

Dependency
  id, predecessorId, successorId,
  type (FS | SS | FF | SF), lagDays
  // predecessorId/successorId may reference Project, Version, Phase, or Task
```

Notes:
- The dependency graph across all items must be a DAG; cycle detection runs on every write (FR-14).
- `schemaVersion` enables IndexedDB migrations when the model evolves.
- Scheduling fields (`earliest*`, `latest*`, `slack`, `isCritical`) are derived, not user-entered, and are recomputed by the engine.

## 8. Information architecture and key screens

1. **Portfolio dashboard** — project list/table, portfolio Gantt toggle, portfolio PERT toggle, critical-path summary, export button, backup/restore.
2. **Project detail** — header (dates, owner, status), tabs for: Hierarchy (versions/phases/tasks), Gantt, PERT, Dependencies, Export.
3. **Item editor** — modal/drawer to create or edit a project/version/phase/task with dates and three-point estimates.
4. **Dependency editor** — pick predecessor and successor, type, and lag; inline cycle warning.
5. **Export dialog** — scope (project/portfolio), format (PPTX/PDF/DOCX), content options.
6. **Settings** — workspace name, data size/usage, backup/restore, clear data.

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Performance: portfolios up to ~50 projects / ~500 total items recompute the critical path and re-render charts in under ~500 ms on a modern laptop. |
| NFR-2 | Browser support: latest two versions of Chrome, Edge, Firefox, and Safari with IndexedDB and Service Worker support. |
| NFR-3 | Privacy: no project data leaves the browser; no analytics that capture project content. Exports are generated locally. |
| NFR-4 | Reliability: every state change is persisted atomically; an unexpected reload never loses more than the last in-progress edit. |
| NFR-5 | Accessibility: keyboard navigation, sufficient color contrast, and a non-color cue (pattern/label) for the critical path. |
| NFR-6 | Usability: a new project with versions, phases, and dependencies can be created in under 5 minutes without documentation. |
| NFR-7 | Data portability: JSON backup is human-readable and versioned. |

## 10. Technical considerations (non-binding guidance)

- **Architecture:** single-page app, fully client-side, installable as a PWA. No backend required for v1.
- **Persistence:** IndexedDB for structured data (a thin wrapper such as `idb`/Dexie); `localStorage` only for lightweight preferences; Service Worker + Cache API for the offline app shell.
- **Scheduling engine:** a pure, framework-agnostic module that takes the item/dependency graph and returns te, passes, slack, and critical path. Topological sort first (also serves cycle detection). Runs synchronously on every write; for portfolios up to ~500 items this is well within a single frame.
- **PERT layout:** an automatic DAG layout library (`elkjs` preferred, `dagre` as fallback) produces collision-free x/y positions for nodes. The SVG renderer consumes those positions — layout and rendering are intentionally decoupled so either can be swapped independently. See §6.4.1.
- **Gantt renderer:** custom SVG or canvas renderer (not a third-party Gantt widget) for full control over the critical-path styling, dependency-arrow routing, and export rasterization. A lightweight grid + positioned-bar approach avoids the coupling and bundle cost of heavy Gantt libraries. See §6.5.1.
- **Chart rasterization for export:** `SVG → <canvas> (2× DPR) → toDataURL('image/png')` — all native browser APIs, no external service. Applied to both PERT and Gantt before passing the PNG to the document generators.
- **Export generators:** client-side only — a PPTX library (e.g., `PptxGenJS`), a PDF library (e.g., `jsPDF`), and a DOCX library (e.g., `docx`). All three accept PNG images for chart embedding.

These are candidate approaches, not mandates; engineering owns final selection.

## 11. Worked example — Truflo AI portfolio

To validate the model end to end, Autopilot must reproduce the existing Truflo AI plan: ~19 projects including Scraping Framework, Trend Scaling (Airflow & PySpark), ClickHouse Migration, SOV & Discount Visualization, VAPT/ISO 27001/SOC 2, VAPT Gap-Fix & Release, Automation Testing, Performance Testing, Product Readiness & Launch, DAAS, and Truflo AI Revenue, with their inter-project dependencies. With illustrative three-point estimates, the engine should surface the critical chain Automation Testing → Performance Testing → VAPT Gap-Fix & Release → Product Readiness & Launch → Truflo AI Revenue and the corresponding portfolio duration, and let the user export that view to all three formats.

## 12. Edge cases and error handling

- Circular dependency attempt → blocked, cycle named (FR-14).
- Deleting an item with dependents → warn and list dependents; offer to reassign or remove the links.
- Child dates outside parent window → non-blocking warning with a one-click "fit to parent."
- Missing estimates → fall back to entered dates; flag "estimate pending" (FR-22).
- Storage quota exceeded → warn early, suggest backup/export, prevent silent data loss (FR-40).
- Export with no data / empty project → produce a valid file noting the empty scope rather than failing.

## 13. Acceptance criteria (sample)

- Creating Project A (start/end) and Project B with "A must finish before B starts" produces a PERT where B's earliest start equals A's earliest finish.
- Entering O/M/P of 2/4/12 yields te = 5 and σ² = ((12−2)/6)² ≈ 2.78.
- Reducing the duration of a non-critical item does not change the project end date; reducing a critical item does.
- Closing and reopening the browser restores the full portfolio without manual import.
- Each of PPTX, PDF, and DOCX exports opens in its native application and contains the project Gantt, the critical-path summary, and a generated-on timestamp.
- A JSON backup exported on one browser re-imports cleanly on another and reproduces identical charts.
- The PERT network for the Truflo AI portfolio (~19 nodes) renders without any node or label overlaps; the critical chain Automation Testing → Performance Testing → VAPT Gap-Fix & Release → Product Readiness & Launch → Revenue is highlighted in the danger ramp with a "CP" badge on each critical node.
- The portfolio Gantt shows all 19 projects as single bars on a shared ~17-week axis; switching to a project-level Gantt for any one project reveals its version → phase hierarchy in a collapsible tree with dependency arrows connecting bars.
- Clicking any PERT node opens the item editor; hovering the node highlights its incoming and outgoing dependency arrows and dims all others.
- The exported PNG of the PERT chart embedded in PPTX is sharp at 2× DPR and legible at standard slide dimensions (1920×1080).

## 14. Release plan

| Milestone | Scope |
|---|---|
| M1 — Core model & persistence | Projects/versions/phases CRUD, dates, IndexedDB persistence, JSON backup/restore |
| M2 — Dependencies & engine | Dependency editor, cycle detection, three-point estimates, critical-path computation |
| M3 — Visualization | Per-project and portfolio PERT and Gantt with critical-path highlighting |
| M4 — Export | PPTX, PDF, DOCX generation (client-side) |
| M5 — Offline & polish | PWA/offline shell, accessibility, performance hardening, settings |

## 15. Risks and open questions

- **Browser storage volatility:** clearing site data or private-mode use wipes the portfolio. Mitigated by JSON backup (FR-39) and proactive warnings; a future cloud-sync option may be needed.
- **Granularity of dependencies — decided:** dependencies are allowed at any level (project↔project, version↔version, phase↔phase, task↔task). Cross-level links (e.g., a phase depending on a project) are permitted but flagged with a visual indicator so the user is aware of the mixed-level coupling. The scheduling engine treats every item as a node regardless of level; a cross-level dependency is just an edge between nodes at different depths.
- **Export fidelity:** rasterized charts (PNG embedded) for v1. Native editable shapes in PPTX/DOCX are a future enhancement (see §16). Long Gantt charts split across pages in PDF/DOCX (see §6.5.1).
- **Single-workspace scope — decided:** one portfolio per browser profile is sufficient for v1. A workspace name is configurable for clarity (FR-38). Multiple workspaces are a future enhancement; the JSON backup/restore path (FR-39) serves the "switch context" use case in the interim.
- **DAG layout performance:** `elkjs` runs in a Web Worker to avoid blocking the main thread for large graphs. If the portfolio exceeds ~100 nodes, layout is debounced (250 ms after last change) rather than running on every keystroke.

## 16. Future enhancements

- Optional cloud sync and multi-device access.
- Real-time collaboration and comments.
- Resource and cost loading; capacity views.
- Direct Jira/Confluence two-way sync.
- Monte Carlo schedule simulation using the PERT variances.
- Native editable shapes in PPTX/DOCX exports.