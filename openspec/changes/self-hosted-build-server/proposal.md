# Self-Hosted Build Server (Mac Mini M4)

## Problem

Currently all builds run on GitHub-hosted runners. This works but:
- macOS builds use shared GitHub runners (slower, limited minutes)
- No Linux aarch64 builds at all
- iOS builds are unsigned unless Apple secrets are configured
- No way to do quick local-network builds without pushing to CI
- Build iteration requires a full CI round-trip

## Proposal

Set up the Mac Mini M4 as a **GitHub Actions self-hosted runner** that builds all non-Windows targets. The existing `build.yml` workflow remains unchanged -- anyone with native hardware or GitHub-hosted runners can still build without Docker.

A new `build-self-hosted.yml` workflow targets the Mac Mini for:
- **macOS** universal binary (native, fast)
- **iOS/iPadOS** unsigned builds (native, for sideloading)
- **Linux x86_64** via Docker container (QEMU emulation on ARM)
- **Linux aarch64** via Docker container (native speed on M4)

Windows builds remain on GitHub-hosted runners only (Tauri requires MSVC/WebView2 which can't run in Docker or on macOS).

## Architecture

```
GitHub Actions
├── build.yml (EXISTING, unchanged)
│   ├── check ─────── ubuntu-22.04
│   ├── build-macos ── macos-latest
│   ├── build-ios ──── macos-latest
│   ├── build-windows─ windows-latest
│   └── build-linux ── ubuntu-22.04
│
└── build-self-hosted.yml (NEW)
    ├── check ─────────── self-hosted, macOS, ARM64
    ├── build-macos ────── self-hosted (native universal binary)
    ├── build-ios ──────── self-hosted (unsigned .ipa for sideloading)
    ├── build-linux-x64 ── self-hosted + Docker (QEMU)
    └── build-linux-arm64 ─ self-hosted + Docker (native)
```

### Runner Communication

The GitHub Actions runner agent initiates **outbound** connections to GitHub (polling model). No inbound ports, public IP, or domain is required. The Mac Mini works from behind NAT on the local network.

```
GitHub ◄──── poll ──── Mac Mini (local network)
       ────── job ────►
```

### Linux Build via Docker

A `Dockerfile.linux-build` lives in the repo. It mirrors the Ubuntu 22.04 environment from the existing CI:

```
Dockerfile.linux-build
├── Base: ubuntu:22.04
├── System deps: libwebkit2gtk-4.1-dev, libgtk-3-dev, etc.
├── Rust stable toolchain
├── Node.js 22
└── Entry: npm ci && npx tauri build
```

The self-hosted workflow runs this container with `--platform linux/amd64` (for x86_64, QEMU) and `--platform linux/arm64` (for aarch64, native).

## Trigger Model

- **`workflow_dispatch`** — manual trigger from GitHub UI
- **Tag pushes** (`v*`) — automatic release builds
- **Not on PRs** — security: self-hosted runners should not run untrusted PR code

## Deliverables

1. `Dockerfile.linux-build` — Ubuntu 22.04 build environment
2. `.github/workflows/build-self-hosted.yml` — new workflow targeting self-hosted runner
3. Setup documentation for the Mac Mini (runner agent, Docker engine, Xcode, Rust, Node)

## What This Does NOT Change

- `build.yml` remains identical — no regressions for existing CI
- Windows builds stay on GitHub-hosted `windows-latest`
- No credentials, IPs, or domains stored in the repo
- Signing/notarization behavior unchanged (secrets-based, same as today)

## Mac Mini Prerequisites

Software to install on the Mac Mini (done manually, not automated):

| Software | Purpose |
|----------|---------|
| GitHub Actions runner agent | Receives jobs from GitHub |
| Xcode (latest) | macOS + iOS native builds |
| Rust (via rustup) | Rust compilation |
| Node.js 22 (via nvm or brew) | Frontend build |
| Colima + Docker CLI | Linux container builds (free, CLI-only, lightweight) |

Colima is preferred over Docker Desktop for a headless build server — it's free, lighter, and works well on Apple Silicon.

## Security Considerations

- **Repo is public** — the workflow must NEVER trigger on `pull_request` events (prevents arbitrary code execution on the Mac Mini by external contributors)
- Triggers limited to `workflow_dispatch` (manual) and tag pushes (`v*`) only
- Runner labels (`self-hosted, macOS, ARM64`) ensure jobs only route to the Mini
- No credentials, IPs, or domains stored in repo files — all secrets go in GitHub Settings > Secrets
- The Mac Mini should have a dedicated user account for the runner agent

## Decisions

- [x] Public repo — no PR triggers, `workflow_dispatch` + tag pushes only
- [x] Linux aarch64 builds included in releases alongside x86_64
- [x] iOS builds are unsigned .ipa for sideloaders (no provisioning profile needed)
- [x] Builds on tags (`v*`) and manual `workflow_dispatch` only, not every push
