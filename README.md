
# Hotline Navigator

A modern, cross-platform Hotline client built with **Tauri**, React, and Rust. This is a spiritual port of David Mierau's wonderful [Hotline app](https://github.com/mierau/hotline), bringing the classic Hotline protocol to modern platforms.

## Platform Support

Right now the iOS and iPadOS versions are not in the app store and must be built manually.

| Platform | Architecture | Status |
|----------|--------------|--------|
| **macOS** | x86_64, ARM64 (Universal) | ✅ Supported (macOS 11.0+) |
| **Windows** | x86_64 | ✅ Supported |
| **Linux** | x86_64, ARM64 | ✅ Supported |
| **iOS** | ARM64 | ✅ Supported (iOS 18.7+) |
| **iPadOS** | ARM64 | ✅ Supported (iPadOS 18.7+) |

[Download the Latest Release](https://github.com/fuzzywalrus/hotline/releases/tag/v0.1.0)

## About This Project

This is a **Tauri-based Hotline client** that provides a modern, cross-platform experience for the classic Hotline protocol. Built with React and Rust, it offers:

- **Cross-Platform**: Single codebase for macOS, Windows, and Linux
- **Modern Stack**: React + TypeScript frontend, Rust backend
- **Full Protocol Support**: Chat, file sharing, news, message boards, and more
- **Native Performance**: Tauri's lightweight architecture for fast, efficient apps

**Note:** This project does not include server software. This is a client for connecting to and participating on Hotline servers. If you would like to host your own Hotline server (and you should!), please check out the very capable [Mobius project](https://github.com/jhalter/mobius).

For more details about the Tauri client implementation, see the [`hotline-tauri/README.md`](hotline-tauri/README.md).

