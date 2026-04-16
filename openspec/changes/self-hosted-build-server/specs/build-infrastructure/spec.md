# Spec: Build Infrastructure

## Dockerfile.linux-build

- MUST use `ubuntu:22.04` as base image
- MUST install the same system dependencies as `build.yml`: libwebkit2gtk-4.1-dev, libappindicator3-dev, librsvg2-dev, patchelf, libssl-dev, libgtk-3-dev, libayatana-appindicator3-dev
- MUST install Rust stable toolchain via rustup
- MUST install Node.js 22
- MUST support `--platform linux/amd64` and `--platform linux/arm64`
- MUST mount the repo as a volume and output build artifacts to `src-tauri/target/release/bundle/`
- Output formats: `.deb` and `.AppImage`

## build-self-hosted.yml

### Triggers
- `workflow_dispatch` (manual)
- Push tags matching `v*`
- MUST NOT trigger on `pull_request` (public repo security)

### Runner targeting
- All jobs use `runs-on: [self-hosted, macOS, ARM64]`
- Except Linux jobs which run Docker on the self-hosted runner

### Jobs

#### check
- TypeScript typecheck, ESLint, Vitest (frontend)
- Cargo clippy, cargo test (backend)

#### build-macos
- Needs: check
- Build universal binary: `npx tauri build --target universal-apple-darwin`
- Upload `.dmg` and `.app.tar.gz` as artifacts
- Upload to GitHub Release on tag push (draft)

#### build-ios
- Needs: check
- Build unsigned .ipa for sideloading
- Upload .ipa as artifact
- Upload to GitHub Release on tag push (draft)

#### build-linux-x64
- Needs: check
- Run Docker container with `--platform linux/amd64`
- Upload `.deb` and `.AppImage` as artifacts (named with x64)
- Upload to GitHub Release on tag push (draft)

#### build-linux-arm64
- Needs: check
- Run Docker container with `--platform linux/arm64`
- Upload `.deb` and `.AppImage` as artifacts (named with arm64)
- Upload to GitHub Release on tag push (draft)

### Artifact naming
- `hotline-navigator-macOS-universal`
- `hotline-navigator-iOS-unsigned`
- `hotline-navigator-Linux-x64`
- `hotline-navigator-Linux-arm64`
