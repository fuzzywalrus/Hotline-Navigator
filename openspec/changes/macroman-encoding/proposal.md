## Why

Hotline's wire protocol uses Mac OS Roman encoding, but the client has inconsistent handling: some receive paths decode as MacRoman, some use `from_utf8_lossy` (garbling accented characters from classic clients), and the "try UTF-8 first, fall back to MacRoman" strategy in `TransactionField::to_string()` is fragile. Scandinavian users report that typing `åäö` produces junk on classic clients (GitHub #44), and Japanese users see garbled text (#29).

The send path was fixed in v0.2.7 to encode outbound text as MacRoman, but the receive path and several byte-level parsers still assume UTF-8. Meanwhile, modern HOPE-capable servers expect UTF-8. A single hardcoded encoding can't serve both worlds.

## What Changes

### 1. Per-bookmark encoding preference

Add a `TextEncoding` enum (`Macintosh` | `Utf8`) and an `encoding` field on `Bookmark`, defaulting to `Macintosh` via serde for backward compatibility.

```
Bookmark
  ├── name, address, port, login, ...
  ├── tls: bool
  ├── hope: bool
  ├── autoConnect: bool
  └── encoding: TextEncoding        ← NEW (default: Macintosh)
```

### 2. Effective encoding resolution

At connect time, after HOPE negotiation, resolve the encoding once:

```
effective_encoding =
    HOPE transport active? → Utf8 (always, overrides bookmark)
    else                   → bookmark.encoding
```

Store the resolved encoding on the client for the lifetime of the connection.

### 3. Encoding-aware encode/decode

Add explicit-encoding methods on `TransactionField`:

- `to_string_with(encoding)` — decode bytes using the specified encoding
- `from_string_with(field_type, value, encoding)` — encode string to bytes using the specified encoding

The existing `to_string()` and `from_string()` remain as MacRoman-default wrappers so unchanged call sites keep working.

Add a shared helper for raw byte buffers (used by parsers that don't go through `TransactionField`):

```rust
pub fn decode_bytes(data: &[u8], encoding: TextEncoding) -> String
```

### 4. Fix all decode call sites

Thread the encoding through all text decode paths:

| File | What | Current (broken) | Fix |
|------|------|-------------------|-----|
| `client/mod.rs` | `handle_server_event` (chat, PMs, broadcasts) | `field.to_string()` | `field.to_string_with(encoding)` — pass encoding as param to the static method |
| `client/users.rs:44` | Username in user list | `from_utf8_lossy` | `decode_bytes(data, encoding)` |
| `client/users.rs:201,207` | Login/name in admin user list | `from_utf8_lossy` | `decode_bytes(data, encoding)` |
| `client/files.rs:576` | File name in directory listings | `from_utf8_lossy` | `decode_bytes(data, encoding)` |
| `history.rs:78` | Chat history text | `from_utf8_lossy` | `decode_bytes(data, encoding)` |
| `news.rs:451` | One category name path | `from_utf8_lossy` | `MACINTOSH.decode` (match rest of news.rs) |

For `&self` methods on `HotlineClient` (users, files, news, chat), the encoding is read from the client's stored effective encoding. For the static `handle_server_event` in the receive loop, encoding is passed as a captured parameter.

Tracker decoding stays MacRoman-only — tracker protocol v3 will likely be UTF-8, but current trackers are all classic.

### 5. UI: encoding dropdown on Edit Bookmark

Add an encoding dropdown in the Edit Bookmark dialog, in the same section as the TLS and HOPE toggles:

```
Encoding:  [ Mac OS Roman (Classic) v ]
             ├── Mac OS Roman (Classic)
             └── UTF-8 (Modern)
```

When a bookmark has HOPE enabled, the dropdown is disabled and shows "(auto: UTF-8 via HOPE)" since HOPE always forces UTF-8 regardless of the bookmark setting.

No encoding field on the quick-connect dialog — it defaults to MacRoman, and HOPE auto-upgrades to UTF-8. Users who need UTF-8 on a non-HOPE server save a bookmark and set it there.

## What Doesn't Change

- **Outbound encoding in `from_string()`** — already correctly encodes to MacRoman, no regression
- **Tracker decoding** — stays hardcoded to MacRoman
- **HOPE protocol messages** — HOPE's own handshake/negotiation fields are already handled correctly
- **File transfer encoding** (`files.rs` fork types, creator codes) — these are 4-byte ASCII identifiers, not user text
- **Password XOR encoding** (`from_encoded_string`) — passwords are typically ASCII; the XOR obfuscation operates on raw bytes

## Risks

- **Encoding mismatch**: If a user sets UTF-8 on a classic server (or vice versa), text will garble. Mitigation: MacRoman default is safe for the majority of servers; HOPE auto-detection handles modern servers; the setting is per-bookmark so one wrong choice doesn't affect other connections.
- **Mixed-encoding chat rooms**: A chat room with both classic and modern clients will inherently have encoding conflicts regardless of what we do — this is a protocol limitation, not something we can solve client-side.
- **Backward compat**: The `encoding` field defaults via serde, so existing bookmarks on disk are unaffected.

## References

- GitHub #44: MacRoman sending encoding is not correct
- GitHub #29: Japanese hiragana/kanji garbled characters (future: add `x-mac-japanese` to the encoding enum)
- Community fix: https://git.sr.ht/~rbdr/hotline/commit/a1ab15155846932af41907c4c3a66ef489a29c2c
