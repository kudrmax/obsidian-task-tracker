# Assistant: asking a model about the tasks

Status: draft for Max, 2026-11-16, after two reviews (requests and architecture; feasibility with experiments on the
SDK). Desktop plugin on the Mac only for now; the core is shaped for a local model and the iPhone app later.

## Why

Max wants buttons that send some of his tasks to a language model with a prompt and get back an answer in a fixed
shape the plugin can act on. Today the model is Claude through his subscription; later a local model and the iPhone
app. The first button is **Best task**: of the tasks in Today and Soon, the one with the most impact, and why.

The feature is mostly the mechanism; Best task is its first user and its proof.

## Principles

1. **One button = one file.** Everything about a button (where it is offered, its labels in each state, which tasks
   it sends, its default prompt, the answer's shape, how the answer is read, its words) lives in its action file in
   the core. The machinery goes over the list of actions and never names one.
2. **One model = one profile + one transport.** The profile (core, data): id, name, its failure words, its settings
   fields with defaults. The transport (host infrastructure): how to ask. The machinery goes over the lists and never
   names a model; only Claude's profile file says «Claude».
3. **Settings by key, not by name.** Prompts by action id, model settings by model id: a new button or model adds
   keys, never a field in the shared settings type.
4. **The core decides, the UI draws** (`CLAUDE.md`): which rows, their labels, which tasks, the prompt, the words, the
   settings fields. The UI draws rows, a spinner, a popup and fields from ready models.
5. **The core runs anywhere.** No SDK, no Node, no `AbortSignal`, no `console` in `core/` (ES2021, JavaScriptCore).
   Stop and time come through the core's own ports.
6. **The door is stateless.** What the iPhone app will call later carries its state in plain data, as `TaskIdState`.

## Max's requests (the review checks each against this spec)

| # | Request | Answered in |
|---|---|---|
| R1 | A mechanism, not one hard-coded button: button = prompt + set of tasks + answer shape | «Actions» |
| R2 | The set is data: Today only, all, a project's, a few tasks, one task | «Scope and target» |
| R3 | The answer in a fixed JSON shape | «The model port», «Best task» |
| R4 | Claude through the subscription, never an API key | «Claude: the subscription» |
| R5 | Claude ↔ local model is a setting; a local model is added, not changed in | «Models», «What a change touches» |
| R6 | Only Claude built now | «Not now» |
| R7 | Errors handled: no login, subscription ended, limit, no network… | «Failures», «Claude: reading the stream» |
| R8 | A direct call, no proxy process | «Claude» |
| R9 | A spinner on the button while waiting; the plugin never blocked | «What Max sees», «Running» |
| R10 | Desktop now; ready for the iPhone app; the phone plugin unharmed | «Platforms», «Claude: not on the phone» |
| R11 | Tasks go out with ids; the answer names an id, not a title | «Briefing» |
| R12 | The prompt in the settings, a sensible default | «Settings», «Best task» |
| R13 | The reason comes back too; a popup; nothing moved or highlighted | «Best task», «What Max sees» |
| R14 | Clean layers, open for extension | «Principles», «Layers», «What a change touches» |

## What Max sees

1. **The row.** «⋯» in the bottom capsule (Search, Select tasks) gets a third row, **Best task** (icon: sparkles).
   In Obsidian on the Mac only; elsewhere the row is not there.
2. **Waiting.** A tap closes the menu as every row does. The «⋯» icon becomes a small spinning ring (`--tc-muted`)
   until the answer. Everything else works meanwhile: scrolling, dragging, menus, typing; the call runs in another
   process and the plugin only awaits it. Opening «⋯» while it spins shows the row as **Stop** with the ring; a tap
   stops the run, the ring goes, nothing is shown.
3. **The answer.** A popup in the middle of the Obsidian window, the plugin's panel look (`--tc-panel-bg`, radius 14,
   panel shadow, `--tc-backdrop`): a small title **Best task**, the chosen task drawn as its card is drawn in the list
   (a subtask can be chosen: a step is a fine answer), and Claude's reason under it (Obsidian's markdown, so a list or
   bold reads well), **Close** at the bottom. Esc, Close or the backdrop close it. Nothing on the screen moves or
   lights up. The popup belongs to the window, not to the plugin's view, so it comes even if the view was closed.
4. **A failure.** The same popup: the title **Couldn't find the best task** and one sentence of what to do («Failures»).
   Stop shows nothing.
5. **Settings.** More → a fourth page, **Assistant** («Settings»).

The popup and the spinner reuse existing parts (panel, card, menu row, backdrop). Their board is drawn after Max has
seen the feature work (`CLAUDE.md`: a screen the design doesn't show is designed before it is polished).

## Layers

```
obsidian/ui                 «⋯» rows from offers, the spinner, AnswerPopup (per outcome kind), the Assistant page (generic fields)
   │  contracts only
core/application/assistant  AssistantService (contract) ← AssistantServiceImpl, built in composeCore
                            actions/: AssistantAction (interface), BestTask       ← ASSISTANT_ACTIONS
                            models/:  ModelProfile (interface), claudeProfile      ← MODEL_PROFILES
                            ModelChoice, TaskScope, Briefing, failure words
                            ports: ModelTransport, StopSignal (+ Timers, Clock as today)
obsidian/infrastructure/assistant   ClaudeTransport implements ModelTransport (claude-agent-sdk), loaded lazily
obsidian/compose.ts         tells composeCore which models it serves and how: { ids: ["claude"], transport }
```

- `CorePorts` gains `models?: HostModels` (optional: a host without models, the door today, passes none). `Core`
  gains `assistant: AssistantService`; `Services` carries it.

```ts
/** The models a host serves, and, where the core itself asks, how. */
interface HostModels {
  readonly ids: readonly string[];                       // Obsidian on the Mac: ["claude"]; the iPhone app later: what Swift serves
  readonly transport?: (id: string) => TransportLoader;  // absent where the host asks the model itself (the door: prepare/finish)
}
```
- Only `obsidian/infrastructure/assistant/ClaudeTransport.ts` imports `@anthropic-ai/claude-agent-sdk`. Everything
  else imports it by `import type` only, so the SDK stays behind esbuild's lazy initialiser (a test guards it).

## The core

### The model port

```ts
interface ModelQuestion {
  readonly instructions: string;        // the prompt from the settings
  readonly input: string;               // the briefing, JSON
  readonly answerSchema: JsonSchema;    // a plain object type in the core
}

type ModelReply =
  | { readonly ok: true; readonly answer: unknown }               // parsed JSON, not yet trusted
  | { readonly ok: false; readonly failure: ModelFailure };

interface ModelFailure { readonly kind: FailureKind; readonly detail: string }   // detail: for the console

type FailureKind =
  | "notInstalled" | "signedOut" | "noAccess" | "limit" | "busy" | "offline"
  | "badModel"      // the model name in the settings is unknown
  | "timeout" | "badAnswer" | "stopped" | "unknown";

/** Stopping, without AbortSignal (not in ES2021 nor in JavaScriptCore), and why: Max's Stop, or the timeout. */
type StopReason = "user" | "timeout";
interface StopSignal { readonly stopped: StopReason | null; onStop(fn: (reason: StopReason) => void): () => void }

/** How a host asks one model. Never throws: every failure is a reply, its detail in it (the frontend logs the outcome's). */
interface ModelTransport {
  ask(question: ModelQuestion, modelSettings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply>;
  /** A hint for a settings field, found on this host (Claude: the path of `claude` found, or «not found»). */
  hint?(fieldKey: string, modelSettings: Readonly<Record<string, string>>): Promise<string | null>;
}

/** The host's transports, loaded only when first used (the SDK must not load on the phone). */
type TransportLoader = () => Promise<ModelTransport>;
```

The timeout lives in the service, through the `Timers` port: it stops the signal with `"timeout"`. A transport stopped
by `"user"` replies `stopped`; stopped by `"timeout"` it replies the kind it can tell (Claude: from the last retry,
«Claude: reading the stream»), else `timeout`. The service shows nothing only for `stopped`.

### Model profiles

```ts
/** A model as the core knows it: data only. */
interface ModelProfile {
  readonly id: string;                                      // "claude"
  readonly name: string;                                    // "Claude"
  readonly fields: readonly SettingField[];                 // its settings, drawn by the Assistant page
  readonly words: Readonly<Record<Exclude<FailureKind, "stopped">, string>>;   // what each failure tells Max to do
  readonly unavailable: string;                             // why it isn't offered on a host that doesn't serve it
}

interface SettingField {
  readonly key: string;                 // "model", "path"
  readonly label: string;
  readonly kind: "text" | "choice";
  readonly choices?: readonly string[]; // offered, typing another allowed
  readonly default: string;
  readonly note?: string;
}
```

`MODEL_PROFILES = [claudeProfile]`. `claudeProfile` (`core/application/assistant/models/claude.ts`):

- fields: `model` (choice `sonnet` / `opus` / `haiku`, default `sonnet`), `path` (text, default empty: «Empty: found
  by itself»);
- words (`{timeout}` is filled from the settings):

| Kind | Words |
|---|---|
| notInstalled | Claude Code isn't installed. Install it, or set the path to `claude` in Settings → Assistant. |
| signedOut | Claude Code isn't signed in. Run `claude` in Terminal and log in. |
| noAccess | Claude refused: your subscription or account has no access now. Check it at claude.ai. |
| limit | Claude's usage limit is reached. Try again when it resets. |
| busy | Claude is overloaded. Try again in a minute. |
| offline | Can't reach Claude. Check the network or the VPN. |
| badModel | Claude doesn't know the model set in Settings → Assistant. |
| timeout | Claude didn't answer in {timeout}. |
| badAnswer | Claude's answer didn't name one of the tasks. Try again. |
| unknown | Claude failed. The details are in the console. |

`stopped` has no words: nothing is shown. `unavailable`: «Claude works in Obsidian on the Mac.»

### Model choice

`ModelChoice` (core) joins the profiles with the host's models:

- `available` = the profiles whose id the host serves (`HostModels.ids`; on the Mac: Claude; on the phone: none).
- `chosen` = the profile of `settings.assistant.model` if available here, else null. **No silent fallback:** if Max
  chose a local model and it isn't there, nothing quietly spends a Claude call; the rows are not offered and the
  Assistant page says why.

### Scope and target

```ts
type TaskScope =
  | { readonly kind: "lists"; readonly lists: readonly SectionKey[] }    // ["now", "soon"]
  | { readonly kind: "project" }                                         // the target's project, with its subprojects' tasks
  | { readonly kind: "target" }                                          // the tasks the button was pressed on, with their subtasks
  | { readonly kind: "all" };                                           // every open task

/** Where a button is pressed and on what: «⋯» on nothing; later a task's menu, Select, a project. */
type AssistantPlace = "more" | "task" | "selection" | "project";
interface AssistantTarget {
  readonly place: AssistantPlace;
  readonly taskIds?: readonly string[];   // "task", "selection"
  readonly projectId?: string;            // "project"
}
```

A scope that needs a target it wasn't given (a project scope pressed from «⋯») is an action bug, caught by a test over
`ASSISTANT_ACTIONS`: each action's places give what its scope reads.

`tasksIn(scope, target)` reads through the task service's reads (the items the screen draws): open tasks only, each
with its open subtasks. «now» is what Today shows (dated today or earlier lands there already); «soon» is the whole
Soon list, dated ones too.

### Briefing

The model chooses among what Max can **start now**, never among goals (Max, 2026-11-17: «по факту я не буду делать все
это одновременно, я буду делать именно первый подпункт»). From each open task of the scope's lists, by how it lies in
the file (`candidatesOf`, the core). This is the action's choice (`briefing: "candidates"`, Best task's); an action about
the tasks pressed on (`briefing: "tasks"`) sends them as they are, each open subtask right after its task with `parent`:

- a task with no open subtask: the task itself;
- a folded task (`collapsed`): only its next step, the one its card shows (`nextStep`): its subtasks are done in order;
- an unfolded task with open subtasks: not itself (it is a goal, not an action), but each open subtask by these same
  rules, at any depth: a folded subtask gives its next step.

Each candidate comes with what it is for, so the model understands the result without ranking by it:

- `goals`: the chain of tasks above it, the top one first, each with its title, description, priority, due date, time,
  projects and labels;
- `after`: for the next step of a folded task, the open tasks of that folded branch that come after the step, in file
  order (depth first), each with its title and description (a task is always both, Max, 2026-11-17); empty otherwise;
- its own `description`: the nested lines without a checkbox (`TaskItem.description`), as Markdown.

Lines have no ids in the file, so each question gives each candidate a short ref, `t1`, `t2`… in the order sent, mapped
to `TaskItem.id`; goals and steps after have no ref and cannot be the answer. The id holds through the plugin's own
writes (moves, renames, folds) and through an edit elsewhere that keeps the line in place; a task cut and pasted by
another editor during the wait gets a new id and reads as not found.

```json
{
  "today": "2026-11-17",
  "candidates": [
    { "ref": "t1", "title": "Write the offer", "list": "today", "inProgress": true, "priority": "p1",
      "due": null, "time": "14:00", "projects": ["Job"], "labels": [], "description": null, "goals": [], "after": [] },
    { "ref": "t2", "title": "Find the contract", "list": "soon", "inProgress": false, "priority": null, "due": null,
      "time": null, "projects": [], "labels": [], "description": null,
      "goals": [{ "title": "Call the bank", "description": "- ask about the fee", "priority": null,
                  "due": "2026-11-20", "time": null, "projects": [], "labels": [] }],
      "after": [{ "title": "Write down the questions", "description": "- the fee, the term" },
                { "title": "Call", "description": null }] }
  ]
}
```

Words, not codes: `list` is today / soon / inbox / backlog (a candidate's list is its top task's), a priority by its
prefix, each project by its path in the tree (`Люди → Окружение в Сербии → Где знакомиться`), dates ISO. A briefing is plain data: `{ input: string, refs: Readonly<Record<string, string>> }`,
`refs` holding the candidates only.

### Actions

```ts
interface AssistantAction {
  readonly id: string;                                  // "bestTask", the key of its prompt in the settings
  readonly places: readonly AssistantPlace[];           // ["more"]
  readonly labels: { readonly idle: string; readonly running: string };   // "Best task" / "Stop"
  readonly icon: string;                                // "sparkles"
  readonly title: string;                               // the popup's title: "Best task"
  readonly failureTitle: string;                        // "Couldn't find the best task"
  readonly scope: TaskScope;
  readonly briefing: "candidates" | "tasks";             // how its tasks are shown to the model: "candidates"
  readonly defaultPrompt: string;
  readonly answerSchema: JsonSchema;
  /** No tasks to send: the words shown instead of a call. */
  readonly emptyWords: string;
  /** The answer read against the briefing and the tasks as they are now. */
  read(answer: unknown, briefing: Briefing, tasks: TaskReads): ActionResult;
}

type ActionResult =
  | { readonly kind: "task"; readonly taskId: string; readonly note: string }
  | { readonly kind: "failed"; readonly why: "badAnswer" | "gone" };
```

`ASSISTANT_ACTIONS = [bestTask]`. The service, the menu rows, the settings page and the popup go over it.

### Outcomes

What the popup draws, ready (titles and words included):

```ts
type AssistantOutcome =
  | { readonly kind: "task"; readonly title: string; readonly task: TaskItem; readonly card: TaskCard; readonly note: string }   // card drawn with task's marks
  | { readonly kind: "failed"; readonly title: string; readonly words: string; readonly detail: string }   // the frontend logs detail
  | { readonly kind: "stopped" };
```

`detail` carries the failure for the console, including the ones the core makes (timeout, badAnswer, gone): the core
has no console, the frontend writes it there.

`gone` (the chosen task was done, given up or deleted during the wait) reads «That task was closed while {model} was
thinking.», not a model failure.

### Running: `AssistantService` (the contract)

```ts
interface AssistantOffer { readonly actionId: string; readonly label: string; readonly icon: string; readonly running: boolean }

interface AssistantService {
  /** The rows a place offers now, labels and icons for their state included; empty with no model here. */
  offers(place: AssistantPlace): readonly AssistantOffer[];
  /** Any run under way: «⋯» spins. */
  readonly busy: boolean;
  /** A tap on a row that isn't running: runs it; while its run is under way, waits for that run. Never stops. */
  press(actionId: string, target?: AssistantTarget): Promise<AssistantOutcome>;
  /** A tap on a running row (Stop): stops its run; nothing under way, nothing happens. */
  stop(actionId: string, target?: AssistantTarget): void;
  onChange(listener: () => void): () => void;

  /** The Assistant page, ready: the models, the chosen one, its fields with values and hints, the prompts, or why none. */
  page(): Promise<AssistantPage>;
  /** Writes a model's field, the chosen model, a prompt (empty or Reset: the default again), the timeout. */
  set(change: AssistantSetting): void;

  /** The two halves of a run, for a host that asks the model itself (the iPhone app through the door). Stateless. */
  prepare(actionId: string, target?: AssistantTarget): PreparedQuestion | AssistantOutcome;
  finish(prepared: PreparedQuestion, reply: ModelReply): AssistantOutcome;
}

/** Plain data: travels to the host and back. */
interface PreparedQuestion {
  readonly kind: "question";
  readonly actionId: string;
  readonly modelId: string;
  readonly target: AssistantTarget | null;
  readonly question: ModelQuestion;
  readonly refs: Readonly<Record<string, string>>;
}

interface AssistantPage {
  readonly models: readonly { readonly id: string; readonly name: string; readonly available: boolean }[];  // the chosen one listed even if not served here
  readonly chosen: string;
  readonly unavailable: string | null;          // the chosen profile's `unavailable` when this host doesn't serve it
  readonly fields: readonly {                    // the chosen model's
    readonly key: string; readonly label: string; readonly kind: "text" | "choice";
    readonly choices: readonly string[]; readonly value: string; readonly note: string | null; readonly hint: string | null;
  }[];
  readonly timeoutSeconds: number;
  readonly prompts: readonly { readonly actionId: string; readonly title: string; readonly prompt: string; readonly isDefault: boolean }[];
}

type AssistantSetting =
  | { readonly kind: "model"; readonly id: string }
  | { readonly kind: "field"; readonly modelId: string; readonly key: string; readonly value: string }
  | { readonly kind: "prompt"; readonly actionId: string; readonly value: string | null }   // null: Reset to default
  | { readonly kind: "timeout"; readonly seconds: number };                              // clamped to 10..600
```

`press` while idle = `prepare` → (an outcome: done) → load the chosen transport → `ask` → `finish`. `press` on a
running run asks nothing again and resolves with that run's outcome; `stop` stops it (the run resolves `stopped`). The
frontend calls `stop` for an offer with `running: true`, `press` otherwise, so a Stop left on screen after the answer
came starts nothing. A run is keyed by its action and target: one
at a time per key (the same button on another task is another run). A run outlives the view; the plugin's unload
stops every run.

## Claude

`ClaudeTransport implements ModelTransport` in `obsidian/infrastructure/assistant/`, with `query()` of
`@anthropic-ai/claude-agent-sdk` (Max's rule: the agent SDK, which logs in through Claude Code; no `anthropic` SDK).
Called straight from the plugin, no proxy process or server (R8).

### Claude: the subscription

- `pathToClaudeCodeExecutable`: the `path` field, else the first that exists of `/opt/homebrew/bin/claude`,
  `/usr/local/bin/claude`, `~/.local/bin/claude`. None → `notInstalled`, no call. The SDK spawns a native binary
  directly (no `node` needed); the SDK's own bundled binary is not used (the plugin ships only `main.js`).
- `env`: Obsidian's environment without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (otherwise Claude Code bills an
  API key instead of the subscription), with `/opt/homebrew/bin` and `/usr/local/bin` added to `PATH` (an npm-installed
  `claude` is a node script and needs `node` from the Dock's empty `PATH`). The SDK replaces the environment entirely
  when `env` is given, so it is spread from `process.env`.
- The init message's `apiKeySource` must say no API key is in use: `"none"` (what a subscription login gives, seen in
  the spike) or `"oauth"`. Any other value (`ANTHROPIC_API_KEY`, `apiKeyHelper`, `/login managed key`, `user`,
  `project`, `org`, `temporary`) stops the run as `noAccess` before a model answers.

### Claude: the call

`model` = the `model` field; `systemPrompt` = instructions; prompt = input; `outputFormat: { type: "json_schema",
schema }`; `tools: []` (it only reads what it is given); `settingSources: []` (Max's CLAUDE.md, hooks and skills are
not loaded); `persistSession: false`; `cwd` = the plugin's folder; `abortController` driven by the stop signal. No
`maxTurns`: structured output takes more than one internal turn.

### Claude: reading the stream

One function, with its own test fed message streams built from the SDK's types and the CLI's strings (real failure
streams would need live calls):

| What arrives | Kind |
|---|---|
| `result` success with `structured_output` | ok |
| `result` success, `is_error` or no `structured_output`; `error_max_structured_output_retries` | badAnswer |
| assistant `error`: `authentication_failed` | signedOut |
| `billing_error`, `account_on_hold`, `oauth_org_not_allowed`, `verification_required`, `cloud_credential_error` | noAccess |
| `rate_limit`; a `rate_limit_event` with `status: "rejected"` | limit |
| `overloaded`; `server_error` | busy |
| `server_error` whose text says the connection was lost | offline |
| `model_not_found` | badModel |
| thrown error with `code === "ENOENT"` | notInstalled |
| thrown `AbortError` (the SDK exports it) after a `"user"` stop | stopped |
| stopped with `"timeout"`, by the last `system/api_retry`: `error_status` null → offline, 429 → limit, 5xx/529 → busy, none → timeout | as named |
| `invalid_request`, `max_output_tokens`, `unknown`, other results, other throws | unknown |

A blocked region has no message of its own: it arrives as connection failures (offline) or `unknown`. The «connection
was lost» row matches the CLI's exact text, kept in the table's test. Every failure's detail reaches the console
through the outcome's `detail`.

### Claude: not on the phone

The SDK needs Node (`child_process`), which Obsidian on iOS lacks. The transport exists only where
`Platform.isDesktopApp && Platform.isMacOS` (as `runAppleScript` in `main.ts`); its loader is
`() => import("./infrastructure/assistant/ClaudeTransport")`, which esbuild keeps behind a lazy initialiser.

Build changes (from the experiments):

- `esbuild.config.mjs`: `external` also lists the `node:`-prefixed builtins; `define: { "import.meta.url":
  '"file:///task-calendar/main.js"' }` (the SDK calls `createRequire(import.meta.url)` at load; in cjs it is undefined).
- An `events` wrapper for the bundle (an esbuild plugin resolving `events` / `node:events` to
  `obsidian/infrastructure/assistant/eventsInWindow.js`): the SDK calls `events.setMaxListeners(n, new
  AbortController().signal)`, and in Obsidian's window `AbortController` is Chromium's, which Node's `events` rejects
  (`ERR_INVALID_ARG_TYPE`, before any call). The wrapper passes everything through and skips only a target Node
  rejects with that code; `setMaxListeners` only raises a warning threshold. Found in the spike.
- `main.js` grows from about 1 MB to about 2.5 MB. Accepted; if the phone's start suffers, the next step is a second
  file loaded from the plugin folder on the Mac only.

## Models

`obsidian/compose.ts` passes the transports this host has:

```ts
const transports: Record<string, TransportLoader> = isMac
  ? { claude: () => import("./infrastructure/assistant/ClaudeTransport").then((m) => new m.ClaudeTransport(pluginDir)) }
  : {};
models: { ids: Object.keys(transports), transport: (id) => transports[id] }
```

## What a change touches (R5, R1, R2)

| Change | Added | Existing lines changed |
|---|---|---|
| A local model | `models/local.ts` (profile: fields `url`, `model`; its words), `infrastructure/assistant/LocalTransport.ts` (OpenAI-compatible HTTP, `response_format: json_schema`, works on the phone plugin too) | one entry in `MODEL_PROFILES`, one entry in the transports in `compose.ts` |
| A button in «⋯» | `actions/<name>.ts` | one entry in `ASSISTANT_ACTIONS`; if its result is a new kind: one kind in `ActionResult`/`AssistantOutcome` (`contracts.ts`) and a popup renderer |
| A button in a task's menu, on Select or on a project | the same | plus, once per place: that menu draws `offers(place)` and passes the target (`TaskMenu`, `BulkMenu`/`BulkController`, the project's menu) |
| The iPhone app | the door's `prepare` / `finish` (it passes the model ids Swift serves, no transport) and the app's transport in Swift | none in the core |

No settings type, no failure table, no settings page, no service changes for any of them.

## Settings

New in `TaskCalendarSettings` (a shared contract, changed once by this spec):

```ts
interface AssistantSettings {
  readonly model: string;                                                   // "claude"
  readonly timeoutSeconds: number;                                          // 120, 10..600
  readonly prompts: Readonly<Record<string, string>>;                       // by action id; missing or blank: the default
  readonly models: Readonly<Record<string, Readonly<Record<string, string>>>>;  // by model id, by field key; missing: the field's default
}
```

`settingsFrom` reads `assistant` field by field (two levels: `prompts` and each model's map), dropping values that are
not strings. Defaults are read where used: `prompts[id]?.trim() || action.defaultPrompt`, `models[id]?.[key] ??
field.default`; Reset deletes the key.

**The prompt holds the meaning, the code holds the shape.** Max asked whether the comment and the JSON format should
also sit in the prompt in the settings. The format shouldn't: the code reads the fields `taskRef` and `reason`, so a
format edited in the settings would break the reading. With structured output the schema goes to the model
separately and is enforced; the prompt needn't describe it. What the reason should be (length, language, tone) is
meaning, so it is in the prompt.

**The Assistant page** (More → Assistant, like Calendars), drawn from `page()`: Model (dropdown of the available
models), the chosen model's fields (Claude: Model, Path to `claude` with the found path as the hint), Timeout, then per
action its prompt (textarea) and **Reset to default**. With no model here (the phone): the words of `unavailable`, and
the prompts still editable (they sync).

## Best task

`actions/bestTask.ts`:

- places `["more"]`; labels Best task / Stop; title Best task; failure title Couldn't find the best task;
- scope `{ kind: "lists", lists: ["now", "soon"] }`;
- schema `{ taskRef: string, reason: string }`, both required, no other fields;
- read: `taskRef` is a candidate's ref and its task exists and is open → `task`; a ref not among the candidates (a goal
  named, a made-up ref) → `badAnswer`, never a silent swap for a step; a ref whose task is closed or no longer found →
  `gone`;
- the popup shows the chosen candidate as the screen draws it: the next step of a folded task on that folded task's
  two-line card (its own title small above, the step below), any other candidate on its own card with the title of the
  task right above it small (`over`), a top task alone; the card's marks are its card's;
- empty Today and Soon → no call, «Today and Soon have no open tasks.»
- default prompt:

> You help me choose the one task that matters most. Below is each thing I could start now: a task, or the next step
> of a bigger task, with the goals above it and, for a step, the steps after it. Pick the one whose doing would change
> my life the most: what becomes different for me — my relationships, health, money, work, home, freedom — once it is
> done. Judge by meaning, not by how the task sounds: a step is not more important because it is big, concrete, ends in
> a finished product or sounds responsible; a short task can matter more than a long one. Count only what this step
> itself gives: its goals show what it is for, but what the goals or the steps after it would give is not done by it.
> A due date is urgency, not impact. Don't invent what a task is for; judge by what is written. A description line that
> starts with «Контекст:» is context I added myself, often after an assistant misjudged that task: take it as true and
> weigh the task with it; it doesn't rule the task out. Answer with its ref,
> and in two or three short sentences in the language of my tasks, say what changes in my life when this one is done;
> don't speak about the other tasks.

## Best task: marking the answer with a label (2026-11-17)

Max: besides the popup, Settings → Assistant gets an optional **label** for Best task, one of the labels he already has
(the settings' `labels`), or none. With one set, a `task` answer also marks the chosen task with that label, and the label
is on exactly one task: taken off wherever else it stands.

- **As Max would do it by hand, nothing hard-coded.** The marking goes through the same calls a tap in the task's menu
  makes (`TaskService.menu` and `toggleLabel`), never its own write and never a copy of the label rules. What the menu
  would not let Max do, the marking doesn't do: a label tile that is disabled or missing for the chosen task (today: a
  task with a priority carries no labels) means the marking is refused, and nothing is changed anywhere. If the label
  rules change one day (labels beside a priority), the marking follows them by itself.
- **Order:** put on the chosen task first; only if it took (the task as it then stands carries the label) is it taken
  off every other task that has it, done and given-up ones included, so it ends on exactly one. A refused marking
  leaves the label where it was.
- **Which task:** the card the answer is drawn on, through that card's own menu, as Max would mark it by hand (the lead,
  at the review, replacing «the step gets it»): a task or an unfolded task's subtask is marked itself; a folded task's
  next step is drawn on the folded task's card, whose menu labels the folded task (`docs/plugin/screen.md`), so the
  folded task gets the label and the popup and the list show it.
- **When:** only on a `task` outcome. A failure, Stop, a timeout or `gone` touch no label. The chosen task already
  carrying it: nothing to put on, it is still taken off the others.
- **The popup** stays as it is and draws the chosen task as it stands after the marking (its card shows the label). A
  refused marking adds one line under the card, the core's words: «Couldn't add the label {name} to this task.»
- **The label gone from the settings** (renamed or removed) reads as none: nothing is marked, the page shows none.
- **Settings page:** under Best task's prompt, a «Label» row: a dropdown of None and the labels in the settings' order,
  their titles as the screen shows them; the core gives the rows ready (`AssistantPage`), the frontend only draws them.
- **Undo:** each write is the menu's own (`toggleLabel`), and the marking's writes (put on, taken off the others) are
  one step: one Undo puts the label back where it was, never leaving it on two tasks.

## Platforms

- **Obsidian on the Mac:** everything above.
- **Obsidian on the phone:** no transport, no rows, no SDK loaded; the page shows why. A local model over HTTP later
  makes it available with no other change.
- **The iPhone app, later:** `prepare` / `finish` go into the door; the app asks a model itself (`URLSession` to a
  local server, or a relay on the Mac). Briefing, prompt, schema, reading and words stay in the core.

## Not now

The local model, the iPhone app, Best task moving or highlighting the task, other buttons and places, sending
descriptions, a «Check Claude» button (it would spend a call), the popup's board (after Max sees it work).

## Tests

- **Core, fake transport:** briefing (refs, words, parents, only open tasks, every scope kind, the target); Best task
  read (good ref; unknown ref → badAnswer; closed or deleted during the wait → gone; empty lists → no call); a ref still
  found after the task was moved and renamed through the service during the wait; press/stop/timeout/one run at a time;
  `busy`, `offers` labels in each state, `onChange`; words per profile with `{timeout}`; `prepare` + `finish` equal
  `press`; `PreparedQuestion` survives `JSON.parse(JSON.stringify(…))`; a host with `ids` but no `transport` gets
  offers and `prepare` (the door's case); a timeout stop and a user stop reply differently; two runs of one action on
  different targets run side by side; every action's places give what its scope reads.
- **Model choice:** chosen by the setting; chosen but no transport → no offers and the `unavailable` words; **a second
  fake profile and transport added in a test file alone get offered and asked, with no other file touched** (R5's
  proof); **a second fake action likewise** (R1's proof).
- **Settings:** merge of partial `prompts`/`models`, non-strings dropped, blank prompt reads the default, Reset.
- **ClaudeTransport:** the stream table; the options passed (`tools: []`, `settingSources: []`, schema, path, env
  without API keys and with `PATH`); the path search; `apiKeySource` check.
- **Build:** the built `main.js` loads with every Node builtin made to throw (and `obsidian`, `@codemirror/*` stubbed,
  as `tests/phone/build.test.ts` does); no non-type import of `ClaudeTransport` or the SDK outside `compose.ts`'s loader;
  `core/task-calendar-phone.js` has no SDK.
- The existing guards (`architecture`, `uiDecides`, `styles`) unchanged.

## Stages

1. **Spike:** the esbuild changes, `ClaudeTransport` called once from the test Obsidian on the Mac with exactly the
   options above. Proves the bundled SDK runs in Obsidian's Electron with the system `claude`, that `tools: []` keeps
   structured output, and records `apiKeySource` for an OAuth login. **One real call: needs Max's yes** (`haiku`, a
   question of a few tokens).
2. **Backend:** the ports, profiles, choice, scope, briefing, actions, Best task, the service, settings, tests.
3. **Obsidian frontend** (from the backend's branch): `ClaudeTransport`, compose, the rows, the spinner, the popup, the
   Assistant page, `docs/plugin/` (a page «Ассистент», the «⋯» line in `screen.md`, the More page in `settings.md`).
4. **Reviewer:** the diffs against this spec, the R-table and «What a change touches».
5. **Check in the test Obsidian** (desktop, dark and light): the row, the spinner while working elsewhere, Stop, the
   popup, failures (a wrong path → notInstalled; signed out by `CLAUDE_CONFIG_DIR` set to an empty folder → signedOut),
   the phone view without the row. **The real Best task on a copy of Max's tasks: one `sonnet` call on ≈30 tasks,
   needs Max's yes.** The plugin's start with the bigger `main.js` measured against master's (desktop, phone view);
   after the release, its start on Max's iPhone checked (Obsidian's console through Sync isn't readable from the Mac,
   so: the plugin opens and the screen is as before). More than half a second slower → the second-file step from
   «Claude: not on the phone».

No Swift stage (R6).

## Decisions

- **Lead:** the row is in «⋯»: it already holds actions on the tasks as a whole (Search, Select).
- **Lead:** Stop is the same row, not a cancel on the spinner: the spinner stays a sign, one place to act.
- **Lead:** default Claude model `sonnet` (one call per tap; ranking needs judgement); `haiku` and `opus` a setting
  away.
- **Lead:** ~~descriptions not sent in v1; a subtask can be the answer~~ replaced on 2026-11-17: the answer is a
  candidate (a task, or a folded task's next step, or an unfolded task's subtask), never a goal; descriptions are sent,
  they say what a goal is for. Found on Max's tasks: sonnet chose the whole Belgrade plan for its well-written goal
  while Max would start its first five-minute step.
- **Lead:** no silent fallback to another model.
- **Spike (2026-11-16):** the bundled SDK ran in the test Obsidian's window with the system `claude` and the options
  above (`tools: []`, `settingSources: []`, `json_schema`): `haiku` answered `structured_output` in 2.2 s, two internal
  turns; the stream was `system/init`, `assistant`, `user`, `rate_limit_event`, `result/success`. A subscription login
  reports `apiKeySource: "none"`. Without the `events` wrapper the SDK throws at once in the window.
- **Backend:** `prepare`, `finish` and `set` return promises: the service reads the tasks file and writes the settings,
  both asynchronous. The door, later, runs the same pure parts (`tasksIn`, `briefingOf`, the action's `read`) over the
  text it is handed, synchronously.
- **Backend:** `offers(place, target?)`: a task's menu passes its task, so its row says Stop only while that task's run is
  under way; left out, the place alone (`{ place }`). `press(actionId, target?)` left out is `{ place: "more" }`.
- **Backend (review):** `press` never stops; `stop(actionId, target?)` does, and is a no-op with nothing under way. A
  press during a run waits for that run's outcome with no second call. Found by the review: «⋯» drawn once and left open
  showed a stale Stop that, as a toggle, started a new paid call after the answer came.
- **Backend (review):** on a host that doesn't serve the chosen model, `page().fields` is empty: the page shows the
  `unavailable` words and the prompts only («Settings»).
- **Backend (review):** the page's own words come from the core in `AssistantPage.words` (`model`, `timeout`,
  `timeoutNote`, `prompts`, `promptsNote`, `reset`), so neither frontend writes them.
- **Backend:** `stopAll()` on the contract: the plugin's unload stops every run, each press resolving `stopped`.
- **Backend:** `press` never rejects but for an action id no button has (a bug). A transport that fails to load is
  `unknown`, its error in `detail`.
- **Backend:** nothing to send (empty lists, no tasks file) is a `failed` outcome: the action's `failureTitle` and its
  `emptyWords`. The chosen model not served here, or served without a transport (the door's case), pressed anyway:
  `failed` with the profile's `unavailable`. A model id no profile has: «No model is set for the assistant. Choose one in
  Settings → Assistant.», and the page lists it by its id, unavailable, with no fields.
- **Backend:** a transport stopped by the timeout that replies `stopped` reads as `timeout`; one that doesn't reply within
  5 s of the timeout (`TIMEOUT_GRACE_MS`) ends the run as `timeout` anyway, so a hung call never keeps the spinner.
- **Backend:** an action's `read` gets a `TaskLookup` (`find(id)`: every list, Done too, every depth), not `TaskReads`.
  The tasks come from `TaskServiceImpl.listed()` (every task of every list as the screen's `TaskItem`, and today), behind
  the assistant's own port `AssistantTasks`; `TaskService`'s contract is unchanged.
- **Backend:** the briefing's `due` is the due date only; `time` is `HH:MM` for a time today and `2026-11-20T10:00` for
  another day (the spec's example: a time today, `due` null). Labels by the name the screen shows (`Good_fun` → «Good
  fun»). `all`, `project` and `target` read Today, Soon, Inbox, Backlog in that order, open tasks only.
- **Backend:** `AssistantTarget.projectId` is the project's name; a task is in it when one of its projects has it on its
  path (subprojects included). A `target` task named under another named task is sent once, under it.
- **Backend:** a model field set blank is its default again (the key goes, as a prompt's Reset); a blank saved value
  reads as the default. The transport gets every field's value with defaults filled.
- **Backend:** `onChange` also fires on every settings change (the chosen model changes the offers).
- **Backend:** the door gets no assistant method now; `DOOR_COVERAGE` marks `AssistantService` host-owned until the
  iPhone app's assistant. `data.json` writes `assistant` after `resultMark` (`obsidian/settingsFile.ts`' key order, one
  line, with its byte-for-byte test).
- **Backend (steps):** the `task` outcome carries the card to draw, ready: `{ kind: "task"; title; task: TaskItem; card:
  TaskCard; note }`. The popup draws `card` with the marks of `task` (as a list card draws `task.card`). A folded task's
  next step: `task` is that folded task (the topmost folded task above the step, the one it was chosen from) and `card`
  its own `card` (`over` its title, the step's title below); any other subtask: `task` is the subtask, `card` its own
  title with its parent's title in `over`, `step` null; a task: `over` null. It is worked out from the tasks as they
  are when the answer comes (`drawnAnswer`, `TaskLookup.above`), so a fold changed during the wait draws as it is now.
- **Backend (steps):** the candidate rules are the action's choice (the lead, at the review): `AssistantAction.briefing`
  is `"candidates"` (Best task: `{ today, candidates }`) or `"tasks"` (an action on the tasks pressed on: `{ today,
  tasks }`, each open task by a ref with its open subtasks right after it, `parent` naming its task's ref, as before, now
  with `description` too, since a task is always its title and description). A task met twice is one candidate, or
  one task sent. A folded task's next step is `TaskItem.card.step`, the
  very item its card shows; the tasks between the folded task and the step are goals too (Move to Belgrade → Find a
  flat → Pick districts: both are goals), and `after` holds the open tasks of the folded branch after the step in file
  order, their own subtasks included, each as `{ title, description }` (description null when none), as goals carry
  theirs. A goal's or a step-after's id answered as a ref is `badAnswer`: refs hold the
  candidates only.
- **Frontend-obsidian (steps):** the list card's renderer draws the answer: `renderTaskCard` takes the face to draw
  (`face`, default `task.card`), so the popup passes `outcome.card` with `outcome.task`'s marks, one mechanism, no copy.
  A face handed in is drawn as given: its `over` never gives way to a rename waiting to be written (that rename is the
  task's, not the parent's), and its title line is the task's own (a waiting rename shown) unless it shows a step.
  Whether the face is handed in is said by the option (`face` given), never by object identity (the review: a copied
  card of the same shape drew the other way).
- **Frontend-obsidian:** the transport logs nothing itself: every failure's detail goes back in the reply, and the
  frontend writes the outcome's `detail` to the console once (a transport that logged too gave the same line twice).
  `ModelTransport`'s doc comment («Logs its own detail») can say so the next time the core is touched.
- **Frontend-obsidian:** «connection was lost» is read from any assistant error, not only `server_error`: the CLI's
  words «Connection lost…», «…went to sleep before a response…» and «Unable to connect to API…» (Claude Code 2.1.325)
  are `offline` whatever code they come with.
- **Frontend-obsidian:** the `path` hint is the `claude` a call would run (the path set if it exists, else the first
  found), or «Not found». Other fields have no hint.
- **Frontend-obsidian:** the transport's `cwd` is the plugin's folder as the file system has it (the vault's base path
  joined with the plugin's folder).
- **Frontend-obsidian:** the popup is the plugin's own overlay and panel (`Overlay`, `Panel`, class `is-answer`), centred
  in the window, 360 wide at most; the reason is drawn as a description is (`tc-desc-text`), selectable; a failure's
  words are markdown too, so `claude` reads as code; Close is the strong pill across the panel. The card in it is not
  pressable. The popup lives with the plugin (`AssistantAnswers`, built in `main.ts`), so it comes with the view closed.
- **Frontend-obsidian:** the spinning ring is one CSS ring in `--tc-muted`, 2 px, a turn in 900 ms: 20 px in place of
  «⋯»'s dots, 18 px in place of a row's icon (the row keeps the icon's room).
- **Frontend-obsidian:** an offer's `icon` is a drawing's name in `kit/icons.ts` (`sparkles` added); a name with no
  drawing draws the row without an icon.
- **Frontend-obsidian:** More → Assistant: the chosen model's name stands as a heading over its fields (else two rows
  read «Model»); a `choice` field is a dropdown of its choices (the lead, at the check: a datalist hid the choices behind a typed
  value; a saved value outside the choices stays listed); a model not served
  here is listed in the dropdown, disabled; Timeout is written when the field is left, a prompt as it is typed, and
  Reset to default lights up as soon as the prompt differs from the default.
- **Frontend-obsidian (review):** «⋯» follows the core while it is open: its assistant rows are drawn again on every
  `onChange`, so a run that ends while the menu stands turns Stop back into Best task; the menu stops listening when it
  closes (or hands its sheet to Search). A running row calls `stop`, any other `press`. The capsule's copy over the sheet
  is drawn again with them, so its ring goes when the run ends.
- **Frontend-obsidian (review):** a blank or non-numeric Timeout is not written: the field shows the saved value again
  (it used to write 0, which the core kept as 10 s).
- **Frontend-obsidian (review):** the page's own words (Model, Timeout and its line, Prompts and its line, Reset to
  default) are `page.words`; where the chosen model isn't served the page draws no model fields, only the unavailable
  words, Timeout and the prompts.
- **Backend (label):** an action declares what it does besides its answer as `options: ActionOption[]` (`assistant/options/`):
  a key, a row label, its choices from the settings and `afterAnswer`. Best task's is `answerLabel`; the service, the page
  and `set` go over the options and never name one, so the next action with an option adds an entry to its own list.
  Saved in `AssistantSettings.options` by action id, then option key (`{ bestTask: { label: "Focus" } }`), as `models` is;
  an old `data.json` without it reads `{}`. A saved value no choice has any more reads as none, on the page and in a run.
- **Backend (label):** the page carries an action's rows in its prompt's entry (`prompts[i].options`, drawn under that
  prompt): `{ key, label, choices: { value, title }[], value }`, none first (`value: null`, «None»), the labels in the
  settings' order by `labelTitle`. `set({ kind: "option", actionId, key, value })` writes one; null is None (the key goes,
  and an action left with no option goes too).
- **Backend (label):** the menu the marking reads is the one the screen opens for the card the answer is drawn on
  (`drawnAnswer`'s `task`), from its list's column (`listCardMenuFrom`: Today's day column, Soon, Inbox, Backlog, Done).
  Refused when that menu has no labels group, its tiles are disabled or the label has no tile, or `toggleLabel` comes back
  without the label on it. The others are found in every list and depth (Done too) by the labels the screen reads, and
  taken off in one `toggleLabel` of them all. (Replaces «the chosen task's opened on the whole screen».)
- **Backend (label):** the marking's writes are one undo step: `UndoHistory.together(work)` joins the writes recorded
  while `work` runs, each only when it starts from the text the previous one left. A change from outside in between (by
  hand, Sync) closes the step so far and the next write starts another, so one Undo never takes that change back (the
  review: the first version joined across it). The assistant reaches it through its port `AssistantSteps`
  (`AssistantDeps.steps`, the undo history in `composeCore`).
- **Backend (label):** a run stopped (Stop or the timeout) before the marking ends as stopped or timed out and marks
  nothing, also when the answer had already come. Once the marking has begun it runs to the end and the run ends with the
  answer: a Stop or the timeout's grace then is too late (the lead, at the re-review: a Stop that settled the run while
  the writes went on moved the label with no popup).
- **Backend (label):** a write that throws during the marking keeps the answer: the popup shows the chosen task with
  the option's words («Couldn't move the label {name}.») in `notice`, and the error in the `task` outcome's new
  `detail: string | null`, which the frontend writes to the console as a failure's.
- **Backend (label):** the chosen task gone only after the marking wrote is still shown, as it stood when the answer
  came (no «gone» after a marking).
- **Backend (label):** the `task` outcome gains `notice: string | null`, the line under the card (null for none), and `detail: string | null` (above); `task`
  and `card` are read again after the marking. The marking runs in `finish`, so `press` and the door's later `finish`
  alike mark.
- **Frontend-obsidian (label):** an option row is a stock `Setting` with a dropdown, drawn right after its prompt's field;
  each choice is held in the dropdown by its place in `choices` (so none, `null`, needs no stand-in value that a label
  could also have), and a change sends that choice's `value` as given. The row is drawn whatever the choices: with no
  labels in the settings it offers None alone.
- **Frontend-obsidian (label):** the notice is a line of its own right under the card, before the reason: caption size
  (`--tc-font-caption`), the caption colour (`--tc-muted`), 6 px from the card (`--tc-answer-notice-gap`, the popup's
  12 px gap pulled in) so it reads as said of the card, flush with the popup's title and reason.
- **Frontend-obsidian (label):** an outcome's `detail` goes to the console whenever it is not null, a `task`'s as a
  `failed`'s, once per shown outcome, with the same «Task Calendar assistant:» prefix; the popup is the answer's (no
  failure look), its `notice` under the card.
- **Lead (impact, 2026-11-17):** the default prompt asks what changes in Max's life, not «the biggest difference», and
  each project goes as its path in the tree. On Max's 38 candidates the old prompt chose «По коду, Readme и dmg…» in 5
  of 5 sonnet runs and 3 of 3 opus runs, every time for a goal due today and the steps after it («without it no post»),
  calling the rest small; the step only sounded big and finished. The new prompt with paths chose the brainstorm about
  his circle in Belgrade in 5 of 5. Several answers can be right (Max: the photos, the brainstorm, the coffee); what is
  wrong is a choice by how a task sounds. The time of day, Max's own priorities and the meaning of labels are not sent:
  Best task picks the task with the most impact, not what to do this minute, and must judge by meaning, not by marks.
