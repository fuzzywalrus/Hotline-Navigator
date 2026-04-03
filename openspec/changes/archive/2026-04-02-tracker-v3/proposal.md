## Why

Hotline Navigator currently speaks only the v1 tracker protocol — 4-byte IPv4 addresses, 1-byte Pascal strings (MacRoman), no metadata, no IPv6. The [Tracker Protocol v3 spec](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Tracker/Tracker-Protocol-v3.md) adds IPv6/hostname addressing, UTF-8 strings, TLV-encoded metadata (TLS support, HOPE, tags, user capacity, server software), search/pagination, and version negotiation — all backward-compatible with v1 trackers.

As a client, Navigator only needs the **listing** side (TCP). Server registration (UDP) is not applicable since Navigator is not a server. Implementing v3 listing support gives users richer tracker data (TLS indicators, tags, server software), IPv6 server discovery, and in-tracker search when connected to a v3-capable tracker.

## What Changes

- **v3 handshake**: Send 8-byte handshake (HTRK + version 0x0003 + feature flags). Read 6 bytes, check version; if v3, read 2 more bytes for tracker's feature flags. Fall back to v1 parsing if tracker responds with v1/v2 version.
- **v3 listing request**: After v3 handshake, send a listing request (request type u16 + TLV field count + optional search/pagination TLV fields). In v1, the tracker streams data immediately after handshake — no request needed.
- **v3 server record parsing**: Parse address type byte (IPv4/IPv6/hostname), 2-byte length-prefixed UTF-8 strings (name, description), and per-record TLV metadata blocks.
- **v3 TLV metadata**: Parse and surface relevant TLV fields from server records: `SUPPORTS_TLS`, `SUPPORTS_HOPE`, `TLS_PORT`, `SERVER_SOFTWARE`, `TAGS`, `MAX_USERS`, `COUNTRY_CODE`, `BANNER_URL`, `ICON_URL`.
- **Extended TrackerServer type**: Add optional fields for IPv6 address, hostname, TLS/HOPE flags, TLS port, tags, server software, max users, country code, and other metadata.
- **Frontend display**: Show TLS/HOPE badges, tags, server software, and other v3 metadata in tracker server list rows. Support IPv6 and hostname addresses in connect flow.
- **Optional: in-tracker search**: When connected to a v3 tracker, allow sending SEARCH_TEXT in the listing request for server-side filtering.

## Capabilities

### Modified Capabilities

- `tracker`: The tracker capability gains v3 protocol support — version-negotiated handshake, v3 listing request, v3 server record parsing with address types and TLV metadata, backward-compatible fallback to v1.

## Impact

- **Backend**: `src-tauri/src/protocol/tracker.rs` — major rewrite to support v3 handshake, listing request, record format, TLV parsing, with v1 fallback.
- **Backend**: `src-tauri/src/protocol/types.rs` — extend `TrackerServer` struct with optional v3 metadata fields.
- **Backend**: `src-tauri/src/commands/mod.rs` — `fetch_tracker_servers` may gain optional search parameter.
- **Frontend**: `src/components/tracker/BookmarkList.tsx` — display v3 metadata (TLS badge, HOPE badge, tags, software) in tracker server rows.
- **Frontend**: `src/types/index.ts` — extend TypeScript `TrackerServer` / `ServerBookmark` types.
- **Dependencies**: No new crates needed — TLV parsing is straightforward with existing byte reading utilities.
