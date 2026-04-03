## 1. Backend: Extend TrackerServer type

- [x] 1.1 Add optional v3 metadata fields to `TrackerServer` in `src-tauri/src/protocol/types.rs`: `supports_tls: Option<bool>`, `supports_hope: Option<bool>`, `tls_port: Option<u16>`, `server_software: Option<String>`, `tags: Option<String>`, `max_users: Option<u16>`, `country_code: Option<String>`, `banner_url: Option<String>`, `icon_url: Option<String>`, `address_type: Option<String>` (to distinguish ipv4/ipv6/hostname)
- [x] 1.2 Add `#[serde(skip_serializing_if = "Option::is_none")]` to all new optional fields so v1 results serialize cleanly

## 2. Backend: TLV parser utility

- [x] 2.1 Create a `TlvField` struct (field_id: u16, value: Vec<u8>) and a `parse_tlv_fields(reader, count) -> Result<Vec<TlvField>, String>` function in `tracker.rs`
- [x] 2.2 Add helper methods on `Vec<TlvField>` or standalone functions to extract typed values: `get_string(id)`, `get_u16(id)`, `get_u32(id)`, `get_bool(id)`, `get_bytes(id)`

## 3. Backend: v3 handshake and version negotiation

- [x] 3.1 Refactor `fetch_servers` to send 8-byte v3 handshake (HTRK + 0x0003 + feature_flags u16)
- [x] 3.2 Read 6 bytes from tracker response; check version field (bytes 4-5)
- [x] 3.3 If version is 0x0003, read 2 more bytes for tracker feature flags; compute negotiated = client_flags & tracker_flags
- [x] 3.4 If version is 0x0001 or 0x0002, fall back to existing v1 batch parsing (no change to v1 path)

## 4. Backend: v3 listing request

- [x] 4.1 After v3 handshake, send listing request: request_type (u16 = 0x0001) + field_count (u16) + optional TLV fields
- [x] 4.2 When search text is provided and FEAT_QUERY is negotiated, include SEARCH_TEXT TLV (ID 0x1001)
- [x] 4.3 Include a default PAGE_LIMIT TLV (ID 0x1011, value 500) to avoid unbounded responses

## 5. Backend: v3 listing response and server record parsing

- [x] 5.1 Parse v3 response header: response_type (u16), total_size (u32), total_servers (u16), record_count (u16)
- [x] 5.2 Parse each server record: address_type (u8), address data (variable), port (u16), user_count (u16), name (2-byte length + UTF-8), description (2-byte length + UTF-8), tlv_count (u16), TLV fields
- [x] 5.3 Handle address types: 0x04 = 4 bytes IPv4, 0x06 = 16 bytes IPv6, 0x48 = 2-byte length + hostname string
- [x] 5.4 Extract v3 TLV metadata into TrackerServer optional fields using the TLV helpers
- [x] 5.5 Apply separator filtering to v3 results (same dash-name filter as v1)

## 6. Backend: Update Tauri command

- [x] 6.1 Add optional `search: Option<String>` parameter to `fetch_tracker_servers` command
- [x] 6.2 Pass search through to `TrackerClient::fetch_servers`

## 7. Backend: Tests

- [x] 7.1 Add unit test for TLV parsing (multiple fields, unknown field IDs skipped, empty TLV block)
- [x] 7.2 Add unit test for v3 server record parsing (IPv4, IPv6, hostname address types)
- [x] 7.3 Add unit test for v3 handshake version detection and fallback (mock v1 response → v1 parsing, mock v3 response → v3 parsing)
- [x] 7.4 Add unit test for v3 listing response header parsing

## 8. Frontend: Extend types

- [x] 8.1 Add optional v3 metadata fields to TypeScript `TrackerServer` / `ServerBookmark` types in `src/types/index.ts`: `supportsTls?: boolean`, `supportsHope?: boolean`, `tlsPort?: number`, `serverSoftware?: string`, `tags?: string`, `maxUsers?: number`, `countryCode?: string`

## 9. Frontend: Display v3 metadata in tracker server rows

- [x] 9.1 Show TLS badge/icon on server rows where `supportsTls` is true
- [x] 9.2 Show HOPE badge/icon on server rows where `supportsHope` is true
- [x] 9.3 Show tags as pill badges on server rows where `tags` is present
- [x] 9.4 Show server software in tooltip or secondary text where `serverSoftware` is present
- [x] 9.5 When connecting to a server with `supportsTls` and `tlsPort`, auto-set TLS and use the provided port instead of auto-detecting

## 10. Frontend: Tracker search (optional enhancement)

- [x] 10.1 Add a search input to the tracker expansion UI that sends the search term through `fetch_tracker_servers`
- [x] 10.2 Pass the search term only when connected to a v3 tracker; for v1 trackers, filter client-side (existing behavior)
