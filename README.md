
# Hotline Navigator

![Hotline Navigator Banner ogo](https://raw.githubusercontent.com/fuzzywalrus/hotline/refs/heads/main/hotline-tauri/public/hotline-navigator-banner.jpg)

A modern, cross-platform Hotline client built with **Tauri**, React, and Rust. This is a spiritual port of Dustin Mierau's wonderful [Hotline app](https://github.com/mierau/hotline), with the goal of bringing the classic Hotline protocol to as many modern platforms as possible. It provides multi-session, single window interface and a responsive design.

This port is divergent from the original Swift/macOS Hotline client and is not a direct port, rather a recreation of it in Tauri using React and Rust, the source code providing valuable information about the protocol and how to implement it. 

## What the hell is Hotline?

Hotline was a very popular Mac-centric chat/file-sharing service from the late 1990s to roughly 2001. Due to its completely decentralized nature, Hotline remains active, unlike many other early file-sharing services. At its core, it consists of three components: a client, a server, and a tracker. Clients connect to servers. Servers provide files, bulletin boards, and a chat room. Clients connect to said servers. Trackers are indexes of active Hotline servers that let users find Hotline servers.

Hotline in concept, was to replicate a BBS but for the internet age. Modern users would recongize more as a proto peer-to-peer or a Discord like application

I made a video aobut the [the history of Hotline](https://www.youtube.com/watch?v=1ixx1ZapAPg). (Fair warning, I went too over-the-top on the editing). Salon's 1999 article, [Hotline's civil war
](https://www.salon.com/1999/02/25/feature_224/) also gives plenty of insight.


## Platform Support

Right now the iOS and iPadOS versions are not in the app store and must be built manually.  They work on said platforms!

| Platform | Architecture | Status |
|----------|--------------|--------|
| **macOS** | x86_64, ARM64 (Universal) | ✅ Supported (macOS 11.0+) |
| **Windows** | x86_64 | ✅ Supported |
| **Linux** | x86_64, ARM64 | ✅ Supported |
| **iOS** | ARM64 | ✅ Supported (iOS 18.7+) |
| **iPadOS** | ARM64 | ✅ Supported (iPadOS 18.7+) |
 |**Android**| ARM64 | TBA |

[Download the Latest Release](https://github.com/fuzzywalrus/hotline/releases/)

## About This Project

This is a **Tauri-based Hotline client** that provides a modern, cross-platform experience for the classic Hotline protocol. Built with React and Rust, it offers:

- **Cross-Platform**: Single codebase for macOS, Windows, Linux, iOS, and iPadOS. Android Planned!
- **Modern Stack**: React + TypeScript frontend, Rust backend
- **Full Protocol Support**: Chat, file sharing, news, message boards, and more
- **Native Performance**: Tauri's lightweight architecture for fast, efficient apps

**Note:** This project does not include server software. This is a client for connecting to and participating on Hotline servers. If you would like to host your own Hotline server (and you should!), please check out the very capable [Mobius project](https://github.com/jhalter/mobius).

For more details about the Tauri client implementation, see the [`hotline-tauri/README.md`](hotline-tauri/README.md).

## More Info about Hotline


Looking for other Hotline Client? see [The Hotline Wiki](https://hlwiki.com/index.php/Clients_New) and [Hotline City](https://hotline.retro-os.live/index.php/downloads/category/9-hotline-clients)

