## Why

Hotline Navigator has no behavioral specs. The `openspec/specs/` directory is empty. Every future change proposal needs existing specs to reference as "Modified Capabilities," but there are none to reference. Bootstrapping specs for all current capabilities creates the foundation that makes the propose → apply → archive workflow useful going forward. It also gives AI agents and new contributors a structured, testable description of what the system does today.

## What Changes

- Create specification files for every major capability currently implemented in Hotline Navigator
- Each spec documents behavioral requirements (SHALL/MUST) with testable scenarios (WHEN/THEN)
- No code changes — this is a documentation-only change that captures existing behavior as formal specs

## Capabilities

### New Capabilities

- `server-connection`: Connection lifecycle — connect, disconnect, cancel, auto-reconnect, generation-based cancellation, status transitions (Connecting → LoggingIn → LoggedIn / Failed / Disconnected)
- `tls`: TLS connection wrapping — modern TLS (rustls, 1.2+), legacy TLS (OpenSSL, 1.0), auto-detect TLS (port+100 probe), per-bookmark TLS toggle, IP-based SNI workaround, self-signed cert acceptance
- `hope`: HOPE secure login — probe negotiation, MAC-based authentication, RC4 transport encryption, key rotation, per-bookmark opt-in, reconnect-on-probe-failure
- `bookmarks`: Bookmark management — CRUD, drag-and-drop reorder, default bookmarks (servers + trackers), auto-connect flag, TLS/HOPE per-bookmark toggles, persistent storage (bookmarks.json)
- `public-chat`: Public chat — send/receive messages, server broadcasts, user join/leave notifications, mention detection, timestamps, system message formatting
- `private-messaging`: Direct messages — send/receive by user ID, unread count badges, message history within session, mute users, enable/disable toggle
- `private-chat-rooms`: Group chat — create rooms, invite users, accept/reject invites, set subject, member list, leave room, per-room message history
- `user-management`: User list and admin — online user list with icons/status/colors, user info dialog, admin functions (disconnect, broadcast), access privilege enforcement (64-bit bitfield)
- `file-browsing`: File directory navigation — list files at path, folder hierarchy traversal, file info (creator, dates, comments, size), file search across cached paths, MacRoman path encoding
- `file-transfers`: File download/upload — HTXF protocol (separate TCP on port+1), reference number handshake, FILP stream with DATA/INFO/MACR forks, TLS on transfer port, progress tracking, large file support (64-bit via capability negotiation), cancel transfers
- `file-preview`: In-app file preview — preview images (PNG, JPG, GIF, WebP), audio (MP3, WAV, FLAC), and text (TXT, JSON, XML) without full download; MIME detection by magic bytes
- `message-board`: Server message board — fetch posts, post new messages, newline-delimited format
- `news`: News system — category/bundle hierarchy, list articles, read article text, post articles with threading (parent_id), create/delete categories and bundles, recursive deletion
- `tracker`: Tracker server discovery — HTRK protocol, batch server list retrieval, MacRoman decoding, separator filtering, connection/response timeouts
- `mnemosyne-search`: Cross-server search — Mnemosyne API integration (/search, /stats, /health), Rust-side CORS proxy, result type filtering (files/board/news), connect-from-result, bookmark management, rate limit handling
- `server-info`: Server metadata — agreements (display, accept/decline, blocks until accepted), banners (HTXF download, MIME detection, base64 encoding), server name/version/description
- `icon-system`: User icons — 631 bundled classic icons, remote fallback (hlwiki.com), banner icons (wide format), pixelated rendering, per-preference toggles (remote icons, show banners)
- `notifications`: Notification system — toast notifications by type (success, error, warning, info), per-event sound effects (chat, PM, transfer, join, leave, login, error), notification history log, watch words for keyword alerts
- `settings`: User preferences — username, icon selection, download folder, theme (light/dark/system), sound toggles, display options (timestamps, inline images, markdown), auto-reconnect config, chat history management

### Modified Capabilities

_None — `openspec/specs/` is currently empty. All capabilities are new._

## Impact

- **Files created**: ~20 new spec files under `openspec/specs/<capability>/spec.md`
- **Code changes**: None
- **Dependencies**: None
- **Risk**: Low — documentation only, no behavioral changes
