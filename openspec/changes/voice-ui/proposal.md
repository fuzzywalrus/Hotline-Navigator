## Why

The voice protocol and audio layers handle signaling and media, but users need a way to interact with voice chat. This phase adds the visual interface: join/leave/mute controls integrated into chat rooms, a persistent voice status bar showing who is speaking, and speaking indicators on user icons. The status bar is especially important for mobile where screen space is limited — users need at-a-glance awareness of voice activity without keeping the chat tab open.

## What Changes

- Add a voice status bar component that persists across all tabs when the user is in a voice room, showing room name and currently speaking user(s)
- Add speaking indicators (visual overlay or animation) on user icons in the user list for users who are actively speaking
- Add join/leave voice controls in the public chat tab and each private chat tab header
- Add a mute/unmute toggle accessible from the voice status bar and chat tab controls
- Add a voice participant overlay/panel showing all voice participants with their mute and speaking state
- Display voice availability status based on server capability echo and HOPE connection state
- Show appropriate feedback when voice is unavailable (no HOPE, server doesn't support voice, user lacks accessVoiceChat privilege)
- Add microphone permission request flow (platform permission dialog) triggered on first voice join attempt

## Capabilities

### New Capabilities
- `voice-ui`: Voice chat user interface — status bar, speaking indicators, join/leave/mute controls, participant panel, permission flow, and availability feedback

### Modified Capabilities
- `public-chat`: Add voice join/leave control to the public chat tab header
- `private-chat-rooms`: Add voice join/leave control to private chat tab headers
- `user-management`: Add speaking indicator overlay to user icons in the user list

## Impact

- **New components**: `VoiceStatusBar`, `VoiceSpeakingIndicator`, `VoiceControls`, `VoiceParticipantPanel`
- **State management**: Voice state (current room, participants, speaking users, mute) consumed from Tauri events via new hooks (`useVoiceState`)
- **Layout**: Status bar sits above/below the main content area, visible across all tabs when in a voice room
- **User list**: Speaking indicator is a lightweight visual cue (e.g., colored ring, pulsing glow) on the existing user icon — not a full redesign
- **No new Rust code** — this is purely TypeScript/React consuming events already emitted by voice-protocol and voice-desktop
