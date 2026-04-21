## Why

Hotline Navigator already has full wire-level support for the fogWraith DATA_COLOR (0x0500) extension — we parse incoming colors and the Rust send path is plumbed through — but the only frontend call site hardcodes `color: null`, so we silently never opt in. Per the spec's implicit-opt-in model, that means servers in `auto` delivery mode (lemoniscate's default) won't echo *anyone else's* colors to us either. We're a color-aware client that's invisibly opted out. This change exposes a picker, aligns our user-management spec to what we actually emit and parse, and adds receiver-side toggles for display and legibility.

## What Changes

- Add a global nickname color picker in Settings, persisted in `preferencesStore` alongside the icon. Wire the selected color through `update_user_info` → `send_set_client_user_info`, replacing the hardcoded `color: null`.
- "No color" state means the wire field is omitted entirely (matches 1.9.x client behavior — distinct from sentinel `0xFFFFFFFF` "explicit clear").
- Add preference **"Display username colors"** (default: on). When off, received colors are stripped at render time only (wire behavior unchanged — we still parse and could re-enable instantly).
- Add preference **"Enforce legibility"** (default: on). When on, colors that fall too close to the current theme background get HSL L-clamped (raw lightness pushed away from background lightness until a minimum visual delta is met). Applies to user-set colors *and* system message colors (admin red, self green).
- Add a `getDisplayColor(rawColor, themeBg, prefs)` render helper used by user list, chat renderers, and any system-message styling site. Computed per-message (not cached) so theme toggles reflow instantly with no invalidation walk.
- Realign `user-management` spec to fogWraith canonical: document field 0x0500 as primary delivery, trailing-bytes-on-UserNameWithInfo as legacy fallback, and **0x0500 wins** when both forms appear in the same packet.
- Document the implicit opt-in model: client signals color-awareness by including DATA_COLOR in its first SET_CLIENT_USER_INFO (304); servers in `auto` mode then echo colors back.

## Capabilities

### New Capabilities

(none — extending existing capabilities)

### Modified Capabilities

- `user-management`: Replace the trailing-bytes-only "Custom User Nick Colors" requirement with a fogWraith-aligned wire spec covering both delivery forms, the priority rule (0x0500 wins), the implicit-opt-in flow, and the send-side requirement that the client transmit its chosen color in SET_CLIENT_USER_INFO.
- `settings`: Add nickname color picker requirement (alongside username/icon), plus two new receiver-side preferences (display toggle, legibility enforcement).

## Impact

- **Frontend**:
  - [GeneralSettingsTab.tsx](hotline-tauri/src/components/settings/GeneralSettingsTab.tsx) — color picker UI, two new preference toggles
  - [preferencesStore.ts](hotline-tauri/src/stores/preferencesStore.ts) — `nickColor: number | null`, `displayUserColors: bool`, `enforceColorLegibility: bool`
  - New helper module (e.g. `src/utils/displayColor.ts`) exporting `getDisplayColor`
  - [UserList.tsx](hotline-tauri/src/components/users/UserList.tsx), [DiscordChatRenderer.tsx](hotline-tauri/src/components/chat/DiscordChatRenderer.tsx), [ChatTab.tsx](hotline-tauri/src/components/chat/ChatTab.tsx), and any other site rendering colored names — switch from raw `user.color` to `getDisplayColor(...)`
- **Backend (Rust)**:
  - No protocol code changes — wire support already exists at [chat.rs:45-52](hotline-tauri/src-tauri/src/protocol/client/chat.rs#L45-L52), [state/mod.rs:488-495](hotline-tauri/src-tauri/src/state/mod.rs#L488-L495), [client/mod.rs:1522-1525](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L1522-L1525), and [client/users.rs:46-54](hotline-tauri/src-tauri/src/protocol/client/users.rs#L46-L54).
  - May need to add a tiebreak rule in code if both 0x0500 and trailing-bytes are present in the same parse — current paths handle them independently and don't reconcile. To verify during implementation.
- **Wire compatibility**: Fully backward compatible. Servers that don't understand 0x0500 ignore the field; we never parse what isn't there. No protocol negotiation needed.
- **Spec docs**: [openspec/specs/user-management/spec.md](openspec/specs/user-management/spec.md) and [openspec/specs/settings/spec.md](openspec/specs/settings/spec.md) updated.
- **Risk**: Low. Frontend-only changes plus a spec-doc realignment. The legibility helper is the only meaningful new logic and it's pure (input color + theme bg → output color), trivially testable.
- **Out of scope**: per-bookmark color identity, chat message text colors, color-picker UX beyond the standard control, server-side anything (lemoniscate's `colored-nicknames` change covers that), removing the trailing-bytes parser (kept indefinitely for old servers).
