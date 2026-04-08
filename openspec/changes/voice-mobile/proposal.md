## Why

The desktop voice implementation (voice-desktop) uses `webrtc-rs` and `cpal` for audio, which are designed to be cross-platform. However, mobile targets (iOS and Android) have platform-specific requirements around audio backends, microphone permissions, and background execution that need dedicated testing and adaptation. This phase validates and fixes the voice stack on mobile, adds platform permission flows, and handles mobile-specific concerns like audio session management and app backgrounding during active voice calls.

## What Changes

- Verify `webrtc-rs` compiles and functions on iOS (aarch64-apple-ios) and Android (aarch64-linux-android) targets
- Verify or replace `cpal` audio backend on each mobile platform:
  - iOS: CoreAudio via `cpal` (should work — same backend as macOS) or fallback to AVAudioEngine via Tauri plugin
  - Android: Oboe via `cpal`'s Android backend or dedicated `oboe` crate integration
- Add iOS microphone permission: `NSMicrophoneUsageDescription` in `Info.plist` + runtime permission request via Tauri plugin
- Add Android microphone permission: `RECORD_AUDIO` in `AndroidManifest.xml` + runtime permission request
- Handle audio session configuration on iOS (AVAudioSession category `.playAndRecord`, mode `.voiceChat`)
- Handle audio focus on Android (AudioManager focus request/abandonment)
- Handle app backgrounding: maintain voice connection when app is backgrounded, resume audio when foregrounded
- Handle interruptions (phone call, alarm) gracefully — auto-mute or disconnect as appropriate
- Test and fix any mobile-specific WebRTC issues (ICE gathering behind mobile NAT, cellular network transitions)

## Capabilities

### New Capabilities
- `voice-mobile`: Mobile platform adaptation for voice — audio backend validation, microphone permissions, audio session/focus management, background execution, and interruption handling for iOS and Android

### Modified Capabilities
- `voice-audio`: Platform-specific audio backend selection and configuration; may need conditional compilation (`#[cfg(target_os)]`) for iOS AVAudioSession and Android AudioManager integration
- `voice-ui`: Microphone permission request dialog adapted for mobile platform conventions; voice controls sized and positioned for touch interaction

## Impact

- **Build configuration**: Tauri mobile build targets need `webrtc-rs` and audio crates to cross-compile; may require additional C/C++ dependencies for WebRTC on Android (NDK)
- **Platform manifests**: iOS `Info.plist` gains `NSMicrophoneUsageDescription`; Android `AndroidManifest.xml` gains `RECORD_AUDIO` permission and possibly `FOREGROUND_SERVICE` for background voice
- **Conditional compilation**: `#[cfg(target_os = "ios")]` and `#[cfg(target_os = "android")]` blocks for audio session management
- **Testing**: Requires physical devices or emulators with audio support; WebRTC ICE behavior differs on cellular vs WiFi
- **Binary size**: `webrtc-rs` on mobile may pull in additional platform-specific TLS/crypto libraries
