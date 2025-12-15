<img width="836" height="188" alt="GitHub Banner" src="https://github.com/user-attachments/assets/73873a25-e18f-4dfd-9454-4c71ce271054" />

# Hotline

A modern, cross-platform Hotline client built with **Tauri**, React, and Rust. This is a spiritual port of David Mierau's wonderful [Hotline app](https://github.com/mierau/hotline), bringing the classic Hotline protocol to modern platforms.

## Platform Support

| Platform | Architecture | Status |
|----------|--------------|--------|
| **macOS** | x86_64, ARM64 (Universal) | ✅ Supported (macOS 11.0+) |
| **Windows** | x86_64 | ✅ Supported |
| **Linux** | x86_64, ARM64 | ✅ Supported |

[Download the Latest Release](https://github.com/fuzzywalrus/hotline/releases/tag/v0.1.0)

## About This Project

This is a **Tauri-based Hotline client** that provides a modern, cross-platform experience for the classic Hotline protocol. Built with React and Rust, it offers:

- **Cross-Platform**: Single codebase for macOS, Windows, and Linux
- **Modern Stack**: React + TypeScript frontend, Rust backend
- **Full Protocol Support**: Chat, file sharing, news, message boards, and more
- **Native Performance**: Tauri's lightweight architecture for fast, efficient apps

**Note:** This project does not include server software. This is a client for connecting to and participating on Hotline servers. If you would like to host your own Hotline server (and you should!), please check out the very capable [Mobius project](https://github.com/jhalter/mobius).

For more details about the Tauri client implementation, see the [`hotline-tauri/README.md`](hotline-tauri/README.md).

---

## Original Swift/macOS Client

The repository also contains the original Swift/macOS Hotline client. Below is information about that version:

# Requirements

| macOS                      | iOS                   | iPadOS            | visionOS          |
|----------------------------|-----------------------|-------------------|-------------------|
| Sequoia 15.7 or greater    | iOS 18.7 or greater   | Not yet available | Not yet available |

To keep this software fresh and running on Apple's latest platforms, the intention is to support the last two major OS releases from Apple. This gives people time to move to the latest major OS release while also allowing this project to make use of the latest APIs.

# What is Hotline?

Hotline was released in 1997 for Mac OS. A suite of three (free) applications that allowed people to join or host online communities directly from their Macs. No subscriptions. No ads.

When connected to a Hotline server you could chat with other users like IRC, message others privately like AIM, read or write threaded news like a forum, post to the server’s message board like BBS, and browse, upload, or download files like FTP. And as someone operating a Hotline server you had full control over all of it.

Hotline also included Trackers. Trackers tracked servers. If you ran a Hotline server, you could list it on one or more Trackers so people could find your server—and anyone could run a Tracker.

At a time when people were chatting over email and file sharing was passing physical media between friends, Hotline was a kind of revelation. The promise of the Internet, in a way. Computers owned by individuals, connected and passing information between each other. No central server that could take the entire network offline.

Perhaps that’s why you can still find Hotline servers and trackers running today 25 years later. Though the company who built Hotline is no longer around, and the software they made is only available through retro Mac software archives, these communities are still operating.

And this project is an attempt to create a modern open source version of Hotline for modern Apple systems. Join in. Contribute. Run your own server! Perhaps Hotline can live on for another 25 years. :)

# Goals
- Build a Hotline client for modern Apple systems.
- Keep the HotlineProtocol, HotlineClient, HotlineTrackerClient, and HotlineFileClient Swift code reusable so people can use it in other Swift Hotline projects.
- Bring a modern Hotline client to iOS, iPadOS, and macOS using one codebase.
- Ressurect the Hotline brand which has been expunged from trademark databases for over a decade. Look, I want Hotline with the classic big red H and all that on my modern Apple devices, okay? ;)
- Document the Hotline protocol.
- Have fun. :)

# macOS Screenshots
![CleanShot 2024-05-14 at 13 45 55@2x](https://github.com/mierau/hotline/assets/55453/44e02def-d457-4f29-ac5e-30438a7794c3)

# Status

| Feature                    | macOS | iOS   | iPadOS | visionOS |
|----------------------------|-------|-------|--------|----------|
| Trackers listing           |   ✓   |   ✓   |        |          |
| Multiple trackers          |   ✓   |       |        |          |
| Connect to servers         |   ✓   |   ✓   |        |          |
| Connect to multiple servers|   ✓   |       |        |          |
| Server accounts            |   ✓   |       |        |          |
| Server bookmarks           |   ✓   |       |        |          |
| Change name & icon         |   ✓   |       |        |          |
| Privacy settings           |   ✓   |       |        |          |
| Autoresponse               |   ✓   |       |        |          |
| Display server agreement   |   ✓   |   ✓   |        |          |
| Display server banner      |   ✓   |   ✓   |        |          |
| Public chat                |   ✓   |   ✓   |        |          |
| Public chat search         |   ✓   |       |        |          |
| Public chat persistence    |   ✓   |       |        |          |
| Private messages           |   ✓   |       |        |          |
| User list                  |   ✓   |   ✓   |        |          |
| User icons                 |   ✓   |   ✓   |        |          |
| User administration        |   ✓   |       |        |          |
| News reading               |   ✓   |   ✓   |        |          |
| News posting               |   ✓   |       |        |          |
| Message board reading      |   ✓   |   ✓   |        |          |
| Message board posting      |   ✓   |       |        |          |
| File browsing              |   ✓   |   ✓   |        |          |
| File downloading           |   ✓   |       |        |          |
| File uploading             |   ✓   |       |        |          |
| File info                  |   ✓   |       |        |          |
| File search                |   ✓   |       |        |          |
| File management            |       |       |        |          |
| Folder downloading         |   ✓   |       |        |          |
| Folder uploading           |   ✓   |       |        |          |
| Custom icon sets           |       |       |        |          |
