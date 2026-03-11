
# Hotline Navigator

![Hotline Navigator Banner ogo](https://raw.githubusercontent.com/fuzzywalrus/hotline/refs/heads/main/hotline-tauri/public/hotline-navigator-banner.jpg)

[Official Website](https://hotline.greggant.com)

A modern, cross-platform Hotline client built with **Tauri**, React, and Rust. This is a spiritual port of Dustin Mierau's wonderful [Hotline app](https://github.com/mierau/hotline), with the goal of bringing the classic Hotline protocol to as many modern platforms as possible. It provides multi-session, single window interface and a responsive design.

This port is divergent from the original Swift/macOS Hotline client and is not a direct port, rather a recreation of it in Tauri using React and Rust, the source code providing valuable information about the protocol and how to implement it. 



## What the hell is Hotline?

Hotline was a very popular Mac-centric chat/file-sharing service from the late 1990s to roughly 2001. Due to its completely decentralized nature, Hotline remains active, unlike many other early file-sharing services. At its core, it consists of three components: a client, a server, and a tracker. Clients connect to servers. Servers provide files, bulletin boards, and a chat room. Clients connect to said servers. Trackers are indexes of active Hotline servers that let users find Hotline servers.

Hotline in concept, was to replicate a BBS but for the internet age. Modern users would recongize more as a proto peer-to-peer or a Discord like application

Hotline's Navigator's website has a deeper drive [the history of Hotline](https://hotline.greggant.com/history/). 

## Platform Support

Right now the iOS, iPadOS, and Android versions are not in their respective app stores and must be built manually or sideloaded.

| Platform | Architecture | Status |
|----------|--------------|--------|
| **macOS** | x86_64, ARM64 (Universal) | ✅ Supported (macOS 11.0+) |
| **Windows** | x86_64 | ✅ Supported |
| **Linux** | x86_64, ARM64 | ✅ Supported |
| **iOS** | ARM64 | ✅ Supported (iOS 18.7+) |
| **iPadOS** | ARM64 | ✅ Supported (iPadOS 18.7+) |
| **Android** | ARM64, x86_64 | ✅ Supported (Android 7.0+) |

[Download the Latest Release](https://github.com/fuzzywalrus/hotline/releases/)

## About This Project

This is a **Tauri-based Hotline client** that provides a modern, cross-platform experience for the classic Hotline protocol. Built with React and Rust, it offers:

- **Cross-Platform**: Single codebase for macOS, Windows, Linux, iOS, iPadOS, and Android
- **Modern Stack**: React + TypeScript frontend, Rust backend
- **Full Protocol Support**: Chat, file sharing, news, message boards, and more
- **Native Performance**: Tauri's lightweight architecture for fast, efficient apps

**Note:** This project does not include server software. This is a client for connecting to and participating on Hotline servers. If you would like to host your own Hotline server (and you should!), please check out the very capable [Mobius project](https://github.com/jhalter/mobius).

For more details about the Tauri client implementation, see the [`hotline-tauri/README.md`](hotline-tauri/README.md).

## Sideloading on Mobile

### iOS/iPadOS

The iOS/iPadOS IPA is unsigned and must be sideloaded using a signing tool:

- **[AltStore](https://altstore.io/)** / **[SideStore](https://sidestore.io/)** — Free sideloading using your Apple ID. Apps must be refreshed every 7 days (or 365 days with a paid Apple Developer account).
- **[TrollStore](https://github.com/opa334/TrollStore)** — Permanent installs with no expiration, but only available on specific iOS versions (14.0–16.6.1, 17.0).
- **[Sideloadly](https://sideloadly.io/)** — Desktop app for sideloading IPAs via USB.

### Android

Download the APK from the releases page and install it directly. You may need to enable "Install from unknown sources" in your device settings.

## More Info about Hotline

Looking for other Hotline Clients? see [The Hotline Wiki](https://hlwiki.com/index.php?title=Clients) and [Hotline City](https://hotline.retro-os.live/index.php/downloads/category/9-hotline-clients)

