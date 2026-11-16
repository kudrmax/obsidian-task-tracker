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

/** How a host asks one model. Never throws: every failure is a reply. Logs its own detail. */
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

Lines have no ids in the file, so each question gives each task a short ref, `t1`, `t2`… in the order sent, mapped to
`TaskItem.id`. That id holds through the plugin's own writes (moves, renames, folds) and through an edit elsewhere that
keeps the line in place; a task cut and pasted by another editor during the wait gets a new id and reads as not found.

```json
{
  "today": "2026-11-16",
  "tasks": [
    { "ref": "t1", "title": "Write the offer", "list": "today", "inProgress": true, "priority": "p1",
      "due": null, "time": "14:00", "projects": ["Job"], "labels": [], "parent": null },
    { "ref": "t2", "title": "Call the bank", "list": "soon", "inProgress": false, "priority": null,
      "due": "2026-11-20", "time": null, "projects": [], "labels": [], "parent": null },
    { "ref": "t3", "title": "Find the contract", "list": "soon", "parent": "t2", "...": "..." }
  ]
}
```

Words, not codes: `list` is today / soon / inbox / backlog, a priority by its prefix, projects by name, dates ISO.
Descriptions are not sent in v1 (long, private, not needed to rank). A briefing is plain data:
`{ input: string, refs: Readonly<Record<string, string>> }`.

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
  | { readonly kind: "task"; readonly title: string; readonly task: TaskItem; readonly note: string }
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
  /** A tap on a row: runs it, or stops it while it runs. Resolves with what to show. */
  press(actionId: string, target?: AssistantTarget): Promise<AssistantOutcome>;
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
running run stops it (that press resolves `stopped`, as does the run's). A run is keyed by its action and target: one
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
- read: `taskRef` is a ref of this briefing and its task exists and is open → `task`; a ref not in the briefing →
  `badAnswer`; a ref whose task is closed or no longer found → `gone`;
- empty Today and Soon → no call, «Today and Soon have no open tasks.»
- default prompt:

> You help me choose what to do. Below are my tasks for today and for soon. If I could do only one of them and nothing
> else, which one would make the biggest difference? Weigh impact over urgency; a task in progress or with a time
> today counts for more only if it truly matters more. Answer with its ref, and in two or three short sentences in the
> language of my tasks, say why this one.

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
- **Lead:** descriptions not sent in v1; a subtask can be the answer.
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
  read «Model»); a `choice` field is a text field with its choices offered under it (a datalist); a model not served
  here is listed in the dropdown, disabled; Timeout is written when the field is left, a prompt as it is typed, and
  Reset to default lights up as soon as the prompt differs from the default.
