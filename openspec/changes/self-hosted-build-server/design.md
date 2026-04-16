# Design: Self-Hosted Build Server

## Overview

Add a self-hosted GitHub Actions runner on a Mac Mini M4 that builds macOS, iOS (unsigned), and Linux (x86_64 + aarch64 via Docker) targets. Existing CI workflow is untouched.

## Components

### 1. Dockerfile.linux-build

Single Dockerfile that produces Linux builds for both architectures. Mirrors the existing `build.yml` Ubuntu 22.04 environment exactly. Multi-platform support via `--platform` flag at runtime.

### 2. build-self-hosted.yml Workflow

New workflow file alongside existing `build.yml`. Targets `self-hosted, macOS, ARM64` runner labels. Triggers on `workflow_dispatch` and `v*` tags only (public repo security).

Jobs:
- `check` — lint/test on the runner itself (Rust clippy, cargo test, npm typecheck/lint/test)
- `build-macos` — native universal binary (`universal-apple-darwin`)
- `build-ios` — unsigned .ipa for sideloading
- `build-linux-x64` — Docker with `--platform linux/amd64`
- `build-linux-arm64` — Docker with `--platform linux/arm64`

### 3. Mac Mini Setup (manual, not in repo)

Runner agent, Colima, Rust, Node, Xcode installed manually. No setup scripts in the repo.

## Key Decisions

- **Colima over Docker Desktop** — free, CLI-only, better for headless server
- **No PR triggers** — public repo, self-hosted runner security
- **Separate workflow file** — existing `build.yml` unchanged, no regressions
- **Single Dockerfile, two platforms** — same image, different `--platform` at runtime
- **iOS unsigned** — no provisioning profile, builds with `--export-method debugging` or equivalent for sideloader .ipa
