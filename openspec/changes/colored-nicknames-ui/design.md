## Context

Hotline Navigator's wire-level support for the fogWraith DATA_COLOR (0x0500) extension is already complete — see [chat.rs:45-52](hotline-tauri/src-tauri/src/protocol/client/chat.rs#L45-L52) (send), [client/mod.rs:1522-1525](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L1522-L1525) and [client/users.rs:46-54](hotline-tauri/src-tauri/src/protocol/client/users.rs#L46-L54) (parse). The frontend renders received colors at [UserList.tsx:41](hotline-tauri/src/components/users/UserList.tsx#L41). Two things are missing:

1. A way for the user to *pick* a color (the only `update_user_info` invocation hardcodes `color: null`).
2. Receiver-side controls for users who don't want to see colors at all, or want them clamped to remain readable against the current theme.

The current `user-management/spec.md` describes only the trailing-bytes form (older Mobius convention). The fogWraith canonical form is the standalone field 0x0500. Our code parses both, but our spec describes only one — and there's no documented tiebreak rule. Lemoniscate-local's open `colored-nicknames` server change explicitly uses field 0x0500, so we'd be its reference client. Spec drift would surface as test failures or interop confusion.

Constraints shaping the decisions below:

- **Backward compatibility is mandatory.** No protocol negotiation. New behaviors must be additive and ignorable.
- **`preferencesStore` is global.** Per-bookmark identity is out of scope for this change; the picker writes one color used everywhere.
- **No new dependencies.** HSL conversion math is small enough to inline; bringing in a color library for ~20 lines of code isn't worth the bundle weight.
- **Theme can switch at runtime.** The user can toggle dark/light at any time. Whatever we do for legibility must reflow on theme change without explicit invalidation calls.

## Goals / Non-Goals

**Goals:**
- Frontend color picker that writes `nickColor: number | null` to `preferencesStore` and triggers `update_user_info` (which already exists, just receives `null` today).
- "No color" state distinguishable from "explicit clear" — `null` means omit the field entirely (1.9.x behavior); we never send the sentinel `0xFFFFFFFF`.
- Two new preferences: `displayUserColors` (default `true`) and `enforceColorLegibility` (default `true`).
- Single render-time helper `getDisplayColor(rawColor, themeBg, prefs) → cssHex | undefined` used by every site that renders colored names.
- `user-management` spec realigned to the fogWraith canonical wire format; trailing-bytes form documented as legacy fallback with explicit priority rule (0x0500 wins).

**Non-Goals:**
- Per-bookmark color identity. Deferred — may revisit if users ask.
- Chat message text colors or any tinting beyond the nickname itself.
- Color picker UX beyond the standard HTML/native picker — no recent-colors palette, no presets, no theme suggestions.
- Server-side anything. Lemoniscate's `colored-nicknames` change covers that side.
- Removing the trailing-bytes parser. Kept indefinitely for older Mobius-derived servers.
- Caching adjusted colors on the user object. Per-message render cost is negligible; cache invalidation isn't worth the complexity.

## Decisions

### 1. Color value type and persistence

`nickColor: number | null` on `preferencesStore`, where `number` is a u32 in `0x00RRGGBB` form (matches the protocol exactly) and `null` means "no color set" (omit field on wire).

The picker UI works with `#RRGGBB` strings for the native color input; conversion to/from u32 happens at the store boundary. Rationale: persisting the protocol-native form means zero conversion in the IPC path and no ambiguity about endianness or alpha.

We deliberately do *not* support sending `0xFFFFFFFF` ("explicit clear") from the picker. The user-facing model is: pick a color, or have no color. If the spec ever requires "explicit clear" semantics (e.g., to override an admin-pinned color), that's a separate feature.

### 2. Wire send-side flow

The Rust send path already accepts `color: Option<u32>` ([state/mod.rs:488](hotline-tauri/src-tauri/src/state/mod.rs#L488)) and emits the field only when `Some` ([chat.rs:51](hotline-tauri/src-tauri/src/protocol/client/chat.rs#L51)). This change wires the frontend through:

```
preferencesStore.nickColor (number|null)
        │
        ▼
GeneralSettingsTab.tsx  invoke('update_user_info', {..., color: nickColor})
        │
        ▼
commands::update_user_info  (Rust)
        │
        ▼
state.update_user_info_all_servers(username, icon_id, color)
        │
        ▼
client.send_set_client_user_info  → emits field 0x0500 if Some
```

The `update_user_info` Tauri command signature already takes `color: Option<u32>` — needs verification that the TypeScript invoke accepts `number | null` as the JSON shape (Tauri serde maps `null` to `None`).

`update_user_info` should be called whenever `nickColor` changes in preferences, not only on initial save. The existing username/icon save paths follow this pattern; nick color slots in alongside.

### 3. Wire parse-side: tiebreak between 0x0500 and trailing bytes

Today the two parsers operate on different code paths and don't compare results:

- [client/mod.rs:1522](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L1522) handles 301/117 transactions and reads field 0x0500 from the field list.
- [client/users.rs:46](hotline-tauri/src-tauri/src/protocol/client/users.rs#L46) handles UserNameWithInfo blobs and reads trailing bytes appended to the username.

These can both fire for a single user notification if a transitional server sends both forms. **Decision: when both are present, 0x0500 takes priority.** Implementation: in the 301/117 handlers that already prefer field 0x0500, no change needed — they ignore trailing bytes by construction. For UserNameWithInfo parsing inside a user list (`TRAN_GET_USER_NAME_LIST` reply), the field-list path doesn't apply, so the trailing-bytes path remains authoritative there.

The tiebreak rule belongs in the spec primarily; in code it's already correct because the two paths handle different transaction shapes. We add a comment on the parsers documenting the rule for future readers.

### 4. Render-side helper

A single pure function:

```typescript
function getDisplayColor(
  rawColor: string | null | undefined,
  themeBg: string,                 // current background hex, e.g. "#1A1A1A"
  prefs: { displayUserColors: boolean; enforceColorLegibility: boolean }
): string | undefined
```

Behavior:

| Inputs | Output |
|---|---|
| `prefs.displayUserColors === false` | `undefined` (caller falls back to theme default text color) |
| `rawColor` falsy | `undefined` |
| `prefs.enforceColorLegibility === false` | `rawColor` unchanged |
| `prefs.enforceColorLegibility === true` and color is legible | `rawColor` unchanged |
| `prefs.enforceColorLegibility === true` and color is too close to bg | L-clamped variant |

L-clamp algorithm (HSL, all values normalized 0..1):

```
let raw_l = hslFromHex(rawColor).l
let bg_l  = hslFromHex(themeBg).l
let delta = abs(raw_l - bg_l)
const MIN_DELTA = 0.30   // tunable, not WCAG, just "visibly distinct"

if delta >= MIN_DELTA: return rawColor unchanged
else:
  // push raw_l away from bg_l
  let target_l = bg_l < 0.5
    ? min(1.0, bg_l + MIN_DELTA)   // dark bg → push toward white
    : max(0.0, bg_l - MIN_DELTA)   // light bg → push toward black
  return hexFromHsl({ h: raw.h, s: raw.s, l: target_l })
```

`MIN_DELTA = 0.30` is a starting value picked so that mid-gray bg (L≈0.5) requires colors at L<0.20 or L>0.80 to be considered "legible enough". Tuned during implementation against both default themes; if 0.30 looks wrong empirically, change the constant.

The function is called per-render (not memoized). Theme switches are free — React rerenders, `themeBg` changes, colors reflow. HSL math on a u32 is ~10 ops with no allocations; profiling will not flag this.

### 5. Theme background detection

The render helper needs the current background hex. Options considered:

| Approach | Pros | Cons |
|---|---|---|
| Pass via prop from each render site | Explicit, no global | Repetitive plumbing |
| `useTheme()` hook reading from a theme context | Clean component-level access | Requires a context if one doesn't exist |
| `getComputedStyle(document.body).backgroundColor` | Zero plumbing, always correct | Forces layout read; runs every render |
| Hardcoded constants per `darkMode` preference | Trivial | Couples helper to preferences shape |

**Decision: hardcoded constants keyed on the resolved `darkMode` preference.** Two background colors used by Tailwind in our app: light bg (`#FFFFFF` or whatever the actual base is) and dark bg (`#1A1A1A`-ish). The helper takes `themeBg` directly so callers can pass either the constant or, if a theme context shows up later, plug it in without changing the helper signature. Resolution of `system` mode happens at the call site via existing `darkMode` resolution logic.

### 6. UI surface

The picker lives in **General Settings**, in the same row/section as the icon picker. Layout:

```
┌─────────────────────────────────────────────────────┐
│  Username:  [____________]                          │
│  Icon:      [icon picker]   Color: [● ] [×]         │
└─────────────────────────────────────────────────────┘
```

- `[● ]` is a native `<input type="color">` showing the current color (or a neutral swatch if `null`).
- `[×]` clears the color back to `null` (omit on wire).

The two new preferences (`displayUserColors`, `enforceColorLegibility`) appear as checkboxes in the same General tab, grouped under a "Username colors" subsection along with the picker.

### 7. System message colors

Admin red, self green, broadcast blue, etc. — these are app-defined colors, not server-sent. Decision: **they go through `getDisplayColor` too** when `enforceColorLegibility` is on, since the user's intent ("make sure I can read names") doesn't distinguish source. The `displayUserColors` toggle does *not* affect system message coloring — that toggle is specifically about server-sent user colors, not app-defined chrome. The two prefs are independent on purpose.

This means system message renderers also call `getDisplayColor(SYSTEM_RED, themeBg, { displayUserColors: true, enforceColorLegibility: prefs.enforceColorLegibility })` — passing `true` for `displayUserColors` to bypass that gate, and `prefs` only for legibility.

A small wrapper `getSystemColor(color, themeBg, prefs)` that does this could clarify intent at call sites; decision deferred to implementation taste.

## Risks / Trade-offs

- **L-clamp picks the wrong constant.** `MIN_DELTA = 0.30` is a starting guess. → Mitigation: it's a single named constant; tune empirically during implementation. If theme system grows beyond two backgrounds, helper signature already supports any `themeBg`.
- **Picker UX is bare.** Native color picker on macOS/Windows is ugly; no theme-suggested palette. → Mitigation: accepted scope-cut. Future change can add presets if users complain.
- **System messages and user-set colors share the helper.** A user with garish admin-red preferences could disable the toggle and find their UI looks weird. → Mitigation: `displayUserColors` deliberately does NOT affect system colors, so admin red stays red regardless. The legibility toggle does, by design, since that's the whole point of the toggle.
- **Send-frequency unclear.** Today `update_user_info` is called only on username change. Color changes need to also trigger it. → Mitigation: simple — wire the same call site to fire on `nickColor` change. Same race conditions as username change (none meaningful).
- **Tiebreak rule has no test coverage today.** No server in our test set sends both forms. → Mitigation: document the rule in the spec and a code comment; if a real server emerges, the parser priority is already correct by construction.
- **Tauri serde mapping for `Option<u32>`.** TypeScript `number | null` should map to Rust `Option<u32>` via serde, but worth a smoke test. → Mitigation: implementation step verifies; if it doesn't, add explicit serde annotations.

## Open Questions

- None that block implementation. The `MIN_DELTA = 0.30` constant is a tuning question, resolved by trying it. The `getSystemColor` wrapper question is a code-style choice resolved during implementation.
