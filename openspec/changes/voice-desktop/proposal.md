## Why

With the voice wire protocol in place (voice-protocol), the client can exchange signaling messages but has no way to actually establish media connections or handle audio. This phase adds the WebRTC stack (`webrtc-rs`) for peer connections, DTLS/SRTP, and ICE negotiation, plus audio capture and playback via `cpal`. The Rust-side approach is chosen over webview-side WebRTC because it works uniformly across all Tauri targets (desktop and mobile) — Android's system WebView does not support `RTCPeerConnection`, and Linux WebKitGTK often lacks WebRTC.

## What Changes

- Integrate `webrtc-rs` crate for RTCPeerConnection, ICE agent, DTLS, and SRTP
- Wire the SDP offer/answer flow: receive Tx 602 (SDP offer) → create RTCPeerConnection → set remote description → create answer → send Tx 603 (SDP answer)
- Wire ICE candidate exchange: receive Tx 604 → add ICE candidate; emit local ICE candidates → send Tx 604
- Implement audio capture via `cpal` at 8000 Hz mono with G.711 µ-law encoding (256-entry lookup table)
- Implement audio playback: decode incoming µ-law RTP streams to PCM, mix N-1 streams, output via `cpal`
- Implement per-stream jitter buffers for reorder and gap interpolation (fixed 60ms initial)
- Implement client-side voice activity detection (RMS energy threshold on decoded PCM) for speaking state
- Handle SDP renegotiation when participants join/leave mid-session (port-0 recycled media sections)
- Add `webrtc`, `cpal`, and related audio crates to `Cargo.toml`

## Capabilities

### New Capabilities
- `voice-webrtc`: WebRTC peer connection lifecycle, SDP offer/answer, ICE candidate exchange, DTLS/SRTP media transport, and renegotiation handling
- `voice-audio`: Audio capture (cpal, 8kHz mono), G.711 µ-law encode/decode, multi-stream mixing, jitter buffers, voice activity detection, and audio playback

### Modified Capabilities
- `voice-protocol`: Connect signaling transactions to actual WebRTC operations; voice room join now establishes a peer connection, leave tears it down

## Impact

- **Crate dependencies**: `webrtc` (includes ICE, DTLS, SRTP, RTP, SDP), `cpal` for audio I/O — significant binary size increase (~3-5 MB)
- **Threading model**: Audio capture/playback runs on a dedicated real-time thread (cpal callback); WebRTC ICE/DTLS run on their own async tasks; mixing happens in the audio output callback
- **New module**: `voice/` module tree — `webrtc.rs` (peer connection), `audio.rs` (capture/playback/mixing), `codec.rs` (µ-law tables), `jitter.rs` (buffer)
- **UDP port**: Media uses server port + 4 (configurable); firewall considerations for users
- **Resource usage**: 64 kbps per participant per direction; mixing is CPU-light (sum + clamp on 160 i16 samples per 20ms frame)
