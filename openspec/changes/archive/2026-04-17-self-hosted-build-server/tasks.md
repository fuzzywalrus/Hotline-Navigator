# Tasks: Self-Hosted Build Server

## Implementation

- [x] Create `Dockerfile.linux-build` in repo root — Ubuntu 22.04 with all build deps, Rust, Node 22
- [x] Create `.github/workflows/build-self-hosted.yml` — check job (lint/test on self-hosted runner)
- [x] Add `build-macos` job — native universal binary, artifact upload, release upload on tags
- [x] Add `build-ios` job — unsigned .ipa for sideloading, artifact upload, release upload on tags
- [x] Add `build-linux-x64` job — Docker with `--platform linux/amd64`, artifact upload, release upload on tags
- [x] Add `build-linux-arm64` job — Docker with `--platform linux/arm64`, artifact upload, release upload on tags
