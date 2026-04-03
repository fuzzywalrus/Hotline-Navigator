## Context

Hotline Navigator currently implements only the v1 tracker protocol in `src-tauri/src/protocol/tracker.rs`. The v1 protocol uses a simple flow: send 6-byte magic, receive batch headers + fixed-format server entries (4-byte IPv4, Pascal strings, MacRoman encoding). The [Tracker Protocol v3](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Tracker/Tracker-Protocol-v3.md) adds version negotiation, feature flags, a listing request message, variable-length server records (IPv4/IPv6/hostname), UTF-8 strings, and per-record TLV metadata.

This is a client-only change. Navigator does not register with trackers (that's a server concern), so we only implement the TCP listing path. No new crate dependencies are needed.

## Goals / Non-Goals

**Goals:**
- Implement v3 listing handshake with automatic fallback to v1 when the tracker doesn't support v3
- Parse v3 server records (address types, 2-byte length-prefixed UTF-8 strings, TLV metadata)
- Extend `TrackerServer` struct with optional v3 metadata fields
- Display v3 metadata (TLS/HOPE badges, tags, server software) in the tracker UI
- Support in-tracker search via SEARCH_TEXT TLV in the listing request
- Maintain full backward compatibility with v1 trackers

**Non-Goals:**
- UDP server registration (Navigator is a client, not a server)
- DTLS / HMAC-signed datagrams (registration-side concerns)
- Client authentication to trackers (FEAT_CLIENT_AUTH) — defer to a future change
- TLS on the tracker TCP connection itself — most trackers don't support it yet; defer
- Pagination UI (send PAGE_LIMIT as a sensible default but don't build pagination controls)

## Decisions

### Single function with version branching, not separate client classes

**Rationale:** The v1 and v3 paths share the same TCP connection and handshake prefix. After reading the tracker's version response, we branch: v1 → existing batch loop, v3 → listing request + response parsing. This keeps the code in one place and avoids duplicating connection/timeout logic.

**Alternative considered:** Separate `TrackerClientV1` / `TrackerClientV3` structs. Rejected because the handshake determines the version at runtime, and the two paths share most of the connection setup.

### Extend TrackerServer with Option fields rather than a separate V3 struct

**Rationale:** The frontend already expects `Vec<TrackerServer>` from the `fetch_tracker_servers` command. Adding `Option<bool>` / `Option<String>` fields for v3 metadata is backward-compatible — v1 results just have all v3 fields as `None`. This avoids changing the IPC contract.

**Alternative considered:** A `TrackerServerV3` enum variant. Rejected because it would require the frontend to handle two shapes and complicate the UI code for minimal benefit.

### TLV parser as a standalone utility function

**Rationale:** TLV parsing (read field ID u16, length u16, value bytes, repeat) is reusable and simple. A `parse_tlv_fields(reader, count) -> Vec<TlvField>` function keeps the server record parser clean and could be reused if other parts of the protocol adopt TLV in the future.

### v3-first handshake with v1 reconnect fallback

**Rationale:** The only way to discover a v3 tracker is to send a v3 handshake (version 0x0003 + 2 bytes of feature flags = 8 bytes total). If we send v1, a v3 tracker downgrades to v1 and we never see v3 metadata. So we must try v3 first.

**Backward compatibility analysis:**

When our v3 client (8 bytes) talks to a v1 tracker:

1. The tracker reads 6 bytes from the TCP stream: `HTRK` + version `0x0003`.
2. Our 2-byte feature flags remain unread in the tracker's TCP receive buffer.
3. The tracker either:
   - **Ignores the version field** and proceeds normally — it sends its v1 response (`HTRK` + `0x0001`), then streams batch data. Our client reads 6 bytes, sees version 0x0001, falls back to v1 parsing. The 2 leftover bytes in the tracker's buffer are harmless — the tracker is only sending after the handshake, so they sit there until the connection closes. **This is the happy path.**
   - **Rejects version 0x0003** and closes the connection. Our client gets a connection-reset or EOF error.

4. On rejection (connection closed), the client opens a **fresh TCP connection** and retries with a v1 handshake (6 bytes, version 0x0001). This guarantees compatibility with even the strictest v1 trackers.

**Key insight:** The 2 extra bytes (feature flags) never contaminate our read path. They sit in the *tracker's* receive buffer, not ours. Our receive buffer contains only the tracker's response. The TCP streams are independent.

**Worst case cost:** One extra TCP connection for v1 trackers that reject version 3. Since most trackers today are v1, consider caching the tracker's detected version in the bookmark after the first successful fetch to avoid the retry on subsequent fetches.

**Alternatives considered:**
- *Send v1 first, then upgrade:* Impossible — a v3 tracker responds with v1 format to a v1 client. There's no upgrade path.
- *Per-bookmark version setting:* Works but poor UX (manual config). Similar to HOPE's opt-in model. Rejected because the auto-detect + retry approach is seamless.
- *Probe with a short timeout:* Adds unnecessary complexity. A connection close from a rejecting tracker is fast enough to detect.

### Send FEAT_IPV6 always, FEAT_QUERY only when searching

**Rationale:** Navigator supports IPv6 connections already. Always advertising FEAT_IPV6 ensures v3 trackers include IPv6 servers in results. FEAT_QUERY is only set when the user provides a search string, keeping the default request simple.

### Forward search parameter through the Tauri command

**Rationale:** Add an optional `search: Option<String>` parameter to `fetch_tracker_servers`. When provided and the tracker supports v3, include it as SEARCH_TEXT TLV. When the tracker is v1, ignore it (v1 has no server-side search). The frontend can add a search input to the tracker expansion UI.

## Risks / Trade-offs

- **[No v3 trackers exist yet]** → The v3 spec is new. There may be no trackers to test against initially. Mitigation: v1 fallback is preserved unchanged, so existing functionality is unaffected. Test v3 parsing with synthetic data / unit tests.
- **[v1 trackers may reject version 0x0003]** → Some strict v1 trackers could close the connection when they see an unknown version in the handshake. Mitigation: on connection failure after sending v3 handshake, open a fresh TCP connection and retry with v1 (6 bytes, version 0x0001). This adds one extra round-trip for rejecting v1 trackers but guarantees compatibility. Once a tracker's version is known, it could be cached in the bookmark to skip the retry on subsequent fetches.
- **[TLV field IDs may evolve]** → The spec allocates ranges but individual fields could change. Mitigation: unknown field IDs are silently skipped per spec. Our parser is forward-compatible.
- **[IPv6 display in UI]** → IPv6 addresses are long and may break layout. Mitigation: truncate/abbreviate in narrow contexts, show full address in tooltips/info dialogs.

## Open Questions

- Should we add TLS to the tracker TCP connection itself? The spec says "SHOULD use TLS 1.3" but existing trackers don't support it. Defer for now — can be added as a follow-up change.
- How should the UI handle `SUPPORTS_TLS` + `TLS_PORT` from tracker metadata vs. the existing auto-detect TLS feature? Proposal: when v3 metadata says TLS is supported and provides a port, use that directly instead of auto-detecting. This saves the auto-detect timeout.
