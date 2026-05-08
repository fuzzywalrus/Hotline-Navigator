# Feedback for fogWraith/Hotline Capabilities spec

This document collects feedback on the [Capabilities.md](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities.md) and [Capabilities-Inline-Media.md](https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/Capabilities-Inline-Media.md) specs, gathered while implementing inline-media in Hotline Navigator.

Each section below is self-contained and could be filed as a separate issue or PR comment upstream.

---

## 1. Stale prose: "currently bits 0–1 are defined"

**File:** `Docs/Protocol/Capabilities.md`, "Implementation Notes" section.

The text reads:

> While currently bits 0–1 are defined, implementations should use a width that accommodates future growth. An 8-byte (64-bit) field provides 64 capability slots.

But the "Defined Capability Bits" table now defines bits 0–5. The "0–1" reference is stale.

**Suggested fix:** Update to "While currently bits 0–5 are defined…" or rephrase to avoid the dependency on the latest bit number entirely (e.g., "While only a handful of bits are currently defined…").

---

## 2. Propose: filename field for inline media

**File:** `Docs/Protocol/Capabilities-Inline-Media.md`, "New Data Objects" table.

The 11 defined media fields cover MIME, dimensions, bytes, handle, upload chunking primitives — but no filename. Result: receivers can render `[image: image/jpeg, 234 KB, 1920×1080]` but never know the original filename. Senders display their local filename, receivers see only the MIME. Asymmetric UX.

**Proposed addition:**

| ID (hex) | Name | Type | Notes |
|---|---|---|---|
| `0x020C` | `DATA_CHAT_MEDIA_FILENAME` | String, ≤ 255 bytes | Sender-supplied original filename. Advisory; may be stripped or sanitized by the server. Carried alongside `MEDIA_ID` and `MEDIA_TYPE` in chat transactions. |

**Behaviour notes:**

- Optional in chat transactions and in `TranUploadMedia` (sender-supplied)
- Server SHOULD sanitize (strip path components, normalize Unicode, limit length); MAY discard entirely
- Server MUST NOT use the filename for any access decision
- Filename never appears in `TranDownloadMedia` (the canonical bytes don't have a filename — that's a property of the chat message, not the media)
- Receivers display the filename in placeholders and message bubbles when present

This is one new field, no behavioral changes to validation pipeline or authorization. Adoption is opt-in (clients ignore unknown fields).

---

## 3. Propose: server limit advertisement in login reply

**File:** `Docs/Protocol/Capabilities-Inline-Media.md`, "Resource Limits" section.

The spec recommends server defaults (max payload 256 KB, max dimensions 2048×2048) but says "Servers MUST enforce, and SHOULD expose as configuration" — i.e., these are operator config, not wire-negotiated. There's no mechanism for clients to learn server limits before attempting an upload.

Practical impact: a client offering "send up to 4K" presets has no way to know that a particular server caps at 2048×2048 until the upload is rejected. Either every attempt is optimistic-with-fallback (poor UX) or clients have to default conservatively (underutilises capable servers).

**Proposed addition:** when a server confirms `CAPABILITY_INLINE_MEDIA` (bit 3) in the login reply, it MAY include advisory limit fields:

| ID (hex) | Name | Type | Notes |
|---|---|---|---|
| `0x0210` | `DATA_MEDIA_MAX_BYTES` | u32 | Maximum encoded payload size in bytes the server accepts. |
| `0x0211` | `DATA_MEDIA_MAX_DIMENSION` | u32 | Maximum width or height (whichever is larger) in pixels. |
| `0x0212` | `DATA_MEDIA_MAX_FRAMES` | u32 | Maximum animation frames (animated formats only). |

If absent, clients SHOULD assume the spec's recommended defaults.

**Behaviour notes:**

- Advisory only — the server still enforces its actual limits and may reject anything for any reason
- Clients use these to populate UI controls (preset lists, slider ranges) so users see only achievable choices
- Server MUST NOT report a limit higher than what it actually enforces (clients trust the values for UI but always handle rejection gracefully)
- Optional — servers without limit advertisement work as today (clients fall back to optimistic upload)

This complements rather than replaces the existing spec text; the recommended defaults remain authoritative when fields are absent.

---

## 4. Question: was reuse of HTXF considered for media transport?

**File:** `Docs/Protocol/Capabilities-Inline-Media.md`, no explicit section.

The spec defines an in-band chunked-upload state machine (`TranUploadMedia` with `PART_INDEX` / `PART_COUNT` / `UPLOAD_TOKEN`). Hotline already has a side-channel chunked transfer mechanism (HTXF, on `port + 1`).

It's clear from the spec that HTXF doesn't fit perfectly:

1. HTXF is byte-exact; media MUST re-encode (strip metadata, canonicalize)
2. HTXF authorization is path-based; media uses fixed-set handles captured at relay time
3. Opening a side-channel TCP for a 150 KB chat image is overkill
4. HTXF doesn't carry the `DECLARED_TYPE` hint cleanly

…but it would be useful to have these reasons captured in the spec text under "Implementation Notes" or "Design Goals." Implementers asking "why isn't this just HTXF?" currently have to derive the answer from first principles; a one-paragraph justification would save them the trip.

**Suggested addition** (under "Implementation Notes"):

> **Why not reuse HTXF?** HTXF transfers preserve bytes exactly — media MUST re-encode for canonicalisation and metadata stripping. HTXF references files by path; media uses opaque handles with authorization sets captured at relay time. HTXF opens a separate TCP connection on `port + 1`, which is overkill for the typical chat-image payload size. Inline-media uses in-band chunking specifically to avoid these mismatches.

---

## 5. Clarify: bit 5 (`CAPABILITY_EXTENDED_PRIV`) echo semantics

**File:** `Docs/Protocol/Capabilities.md`, "Defined Capability Bits" table; `Capabilities-Extended-Priv.md` if it exists.

Bit 5 is marked **provisional**. The general capability negotiation rules say servers echo only bits the client advertised. But what about provisional bits?

Specifically: if a client does NOT advertise bit 5 (e.g., because it doesn't implement extended privileges yet), but the server sends extended bits anyway, what is the expected behaviour?

Two readings of the current spec:

1. **Strict echo**: server only echoes bits the client advertised → server MUST send 64-bit `FieldUserAccess` to a client that didn't advertise bit 5, even if the server's account store is widened
2. **Server-driven**: server may echo bit 5 to signal "extended privilege bitmap is in use" regardless of client advertisement → client must defensively parse `FieldUserAccess` width

The provisional status suggests this is unsettled. Could the spec clarify which reading is canonical, particularly:

- Does a server with a 128-bit account store always send 128-bit `FieldUserAccess` to bit-5-aware clients, or does it conditionally truncate based on what bit 5 the client advertised?
- Should clients that don't implement bit 5 defensively treat any echo of bit 5 as a no-op (Navigator's current plan), or as a parse-width signal?

A worked example in the bit-5 spec doc would resolve this.

---

## 6. Minor: link the inline-media spec from the main capabilities doc

**File:** `Docs/Protocol/Capabilities.md`, "Defined Capability Bits" table.

Bit 3's row currently has "See [Inline Media Extension](Capabilities-Inline-Media.md)" which works in the rendered GitHub view but breaks in offline copies (the link resolves relative to the doc's location). Same applies to bits 0, 1, 2, 4, 5.

This isn't a bug per se but if the spec is ever included in implementer documentation outside GitHub, the relative links will need consideration. A small note about the file naming convention would help.

---

## Summary of proposed concrete spec changes

| Item | File | Type | Effort to spec |
|---|---|---|---|
| Fix "bits 0–1 defined" prose | `Capabilities.md` | Text-only | Trivial |
| Add `DATA_CHAT_MEDIA_FILENAME` | `Capabilities-Inline-Media.md` | New optional field | Small |
| Add server limit advertisement | `Capabilities-Inline-Media.md` | New optional fields in login reply | Small |
| Document HTXF-vs-in-band rationale | `Capabilities-Inline-Media.md` | Text-only addition | Trivial |
| Clarify bit 5 echo semantics | `Capabilities.md` + bit-5 doc | Text-only clarification | Trivial |

None of these break existing implementations. All are backward-compatible (advisory fields, new optional companion field, prose).

---

*Prepared by the Hotline Navigator team while implementing inline-media support against this spec. Happy to iterate on any of these — or to file them as separate issues if that's preferable.*
