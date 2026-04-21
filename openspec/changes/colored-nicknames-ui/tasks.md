## 1. Preferences store

- [ ] 1.1 Add `nickColor: number | null` field to `preferencesStore` with default `null`
- [ ] 1.2 Add `setNickColor(color: number | null)` action
- [ ] 1.3 Add `displayUserColors: boolean` field with default `true` and `setDisplayUserColors` action
- [ ] 1.4 Add `enforceColorLegibility: boolean` field with default `true` and `setEnforceColorLegibility` action
- [ ] 1.5 Verify Zustand `persist` middleware picks up the three new fields without manual migration (existing fields use the same pattern)

## 2. Display color helper

- [ ] 2.1 Create `src/utils/displayColor.ts` exporting `getDisplayColor(rawColor, themeBg, prefs)`
- [ ] 2.2 Implement `hexToHsl` and `hslToHex` helpers (no new deps — ~20 lines of arithmetic)
- [ ] 2.3 Implement L-clamp logic with `MIN_DELTA = 0.30` constant (tunable; named constant at top of file)
- [ ] 2.4 Handle edge inputs: null/undefined/empty rawColor → return undefined; malformed hex → return undefined
- [ ] 2.5 Add unit tests covering: legible color passes through, dark-bg + dark color → lightened, light-bg + light color → darkened, displayUserColors=false → undefined, enforceColorLegibility=false → unchanged
- [ ] 2.6 Add a thin `useThemeBackground()` hook (or constant lookup) that returns the current theme bg hex based on resolved `darkMode` preference

## 3. Settings UI

- [ ] 3.1 Add nickname color picker control to `GeneralSettingsTab.tsx` next to the icon picker (native `<input type="color">` plus a "clear" button)
- [ ] 3.2 Wire picker value to `preferencesStore.nickColor`, converting `#RRGGBB` ↔ u32 at the boundary
- [ ] 3.3 Add "Display username colors" checkbox bound to `displayUserColors`
- [ ] 3.4 Add "Enforce legibility" checkbox bound to `enforceColorLegibility`
- [ ] 3.5 Visually group the picker + two checkboxes under a "Username color" subsection in the General tab

## 4. Wire send-side

- [ ] 4.1 Replace `color: null` at [GeneralSettingsTab.tsx:40](hotline-tauri/src/components/settings/GeneralSettingsTab.tsx#L40) with `color: usePreferencesStore.getState().nickColor`
- [ ] 4.2 Audit other `update_user_info` invocations (if any) — same change
- [ ] 4.3 Trigger `update_user_info` whenever `nickColor` changes in preferences (subscribe in the same place that already reacts to username/icon changes; if no such hook exists, add one)
- [ ] 4.4 Verify the Tauri command signature accepts `number | null` and serializes to Rust `Option<u32>` correctly via serde — smoke-test by setting a color, watching the wire (debug println in `send_set_client_user_info`), and confirming field 0x0500 appears with the expected u32 value
- [ ] 4.5 Verify "no color" state results in field 0x0500 being omitted entirely (not sent as 0xFFFFFFFF)

## 5. Render-side wiring

- [ ] 5.1 Update `UserList.tsx` line 41 to use `getDisplayColor(user.color, themeBg, prefs)` instead of raw `user.color`
- [ ] 5.2 Find all chat-renderer sites that style usernames by color (`DiscordChatRenderer.tsx`, `ChatTab.tsx`, `useServerEvents.ts`, anything else surfaced by `grep -rn "user.color\|color}}"`) and route through `getDisplayColor`
- [ ] 5.3 Find system-message color sites (admin red, self green, broadcast blue) and route through `getDisplayColor` (passing `displayUserColors: true` in the prefs argument so only legibility applies)
- [ ] 5.4 Verify private-message dialogs and private-chat-room user lists render colors via the helper

## 6. Wire parse-side documentation

- [ ] 6.1 Add a comment at [client/mod.rs:1522](hotline-tauri/src-tauri/src/protocol/client/mod.rs#L1522) (and the equivalent in the 117 handler) documenting the "0x0500 wins over trailing bytes" tiebreak rule per spec
- [ ] 6.2 Add a comment at [client/users.rs:46](hotline-tauri/src-tauri/src/protocol/client/users.rs#L46) noting that this trailing-bytes parse is the legacy-fallback form and that field 0x0500 takes priority on transactions where both are present
- [ ] 6.3 No code changes expected — the existing parsers already operate on different transaction shapes and don't conflict in practice; verify this assumption holds by walking the call sites

## 7. Manual verification

- [ ] 7.1 Connect to `lemoniscate-local` (or any color-aware server) with a color set; confirm own color appears in the user list and chat
- [ ] 7.2 Confirm other users' colors appear after our 304 with field 0x0500 (the implicit opt-in)
- [ ] 7.3 Toggle "Display username colors" off; confirm all user-set colors disappear, system colors remain
- [ ] 7.4 Set a color very close to the dark theme background (e.g. `#1B1B1B`); toggle "Enforce legibility" on; confirm color renders lighter
- [ ] 7.5 Switch theme between light and dark; confirm clamped colors reflow on each toggle without a refresh
- [ ] 7.6 Connect to a server that does NOT support 0x0500 (legacy Mobius without the extension); confirm we still display correctly and our outbound 304 with field 0x0500 doesn't break the connection
- [ ] 7.7 Connect with no color set; confirm 304 omits field 0x0500 entirely (verify with debug println on the Rust side)

## 8. Spec doc updates (apply phase)

- [ ] 8.1 Apply the `user-management` spec delta (new wire requirements, opt-in flow, modified update-own-info)
- [ ] 8.2 Apply the `settings` spec delta (picker requirement, two new toggle requirements)
- [ ] 8.3 Run `openspec validate` to confirm the change archives cleanly
