## Why

The fogWraith Hotline spec defines a WebRTC-based voice chat extension using an SFU architecture. Before any audio or WebRTC work can begin, the client needs to speak the wire protocol: 7 new transaction types, 5 new field constants, capability negotiation, and access privilege checks. This foundational layer unblocks all subsequent voice work (desktop audio, UI, mobile) and can be tested against Lemoniscate with packet-level validation before any media flows.

## What Changes

- Add 7 voice transaction types: JoinVoiceRoom (600), LeaveVoiceRoom (601), VoiceSdpOffer (602), VoiceSdpAnswer (603), VoiceIceCandidate (604), VoiceRoomStatus (605), VoiceMute (606)
- Add 5 voice field constants: DATA_VOICE_SDP (0x01F5), DATA_VOICE_ICE (0x01F6), DATA_VOICE_CODEC (0x01F7), DATA_VOICE_MUTED (0x01F8), DATA_VOICE_PARTICIPANTS (0x01F9)
- Add `CAPABILITY_VOICE = 0x0004` and advertise it during login (OR'd with existing CAPABILITY_LARGE_FILES)
- Parse the server's echoed capability bitmask to determine voice availability
- Add access privilege bit 55 (`accessVoiceChat`) check before allowing voice room joins
- Implement voice room state tracking per connection: current room, participants, mute state
- Parse the binary participant format (6 bytes per participant: user_id + flags + codec_id)
- Enforce HOPE-only policy: voice transactions SHALL only be sent on HOPE-encrypted connections (RC4 or AEAD)
- Emit Tauri events for voice state changes so the UI layer (voice-ui) can subscribe

## Capabilities

### New Capabilities
- `voice-protocol`: Voice chat wire protocol — transaction types, field constants, capability negotiation, access privilege, participant state tracking, HOPE enforcement, and Tauri event bridge for voice state

### Modified Capabilities
- `server-connection`: Add CAPABILITY_VOICE to the login capability bitmask; parse server capability echo to detect voice support; track voice availability as connection state
- `hope`: Enforce policy that voice transactions require an active HOPE-encrypted connection; do not advertise CAPABILITY_VOICE on non-HOPE connections

## Impact

- **Protocol constants**: `constants.rs` gains 7 transaction types, 5 field types, 1 capability flag
- **Connection state**: New voice state struct on the client connection tracking current room, participants, mute, and whether server supports voice
- **Transaction dispatch**: `mod.rs` transaction handler loop gains cases for 602, 604, 605 (server-initiated notifications)
- **HOPE integration**: Login flow conditionally sets CAPABILITY_VOICE bit based on HOPE status
- **Tauri events**: New events (`voice-room-status`, `voice-sdp-offer`, `voice-ice-candidate`, etc.) emitted to the frontend
- **No new crate dependencies** — this is pure protocol parsing
