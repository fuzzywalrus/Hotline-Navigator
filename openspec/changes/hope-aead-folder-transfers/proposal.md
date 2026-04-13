## Why

The HOPE ChaCha20-Poly1305 AEAD implementation encrypts single-file transfers and banner downloads, but folder transfers are not yet covered. Folder transfers use a complex multi-action protocol — each item in the folder requires its own HTXF handshake, FILP stream, and action headers (create folder, next file, etc.). The AEAD wrapping needs to handle this multi-step dance where multiple items flow over a single transfer connection with interspersed control actions.

This was explicitly deferred from the initial AEAD implementation as a non-goal due to the protocol complexity.

## What Changes

- Wrap folder download transfer sockets in AEAD framing after the initial HTXF handshake, using per-transfer derived keys (same derivation as single-file transfers)
- Wrap folder upload transfer sockets in AEAD framing after the initial HTXF handshake
- Handle the multi-action folder protocol (folder headers, per-item FILP streams, action bytes) through the AEAD byte-stream wrappers
- When AEAD is not active, folder transfers remain unencrypted (existing behavior)

## Capabilities

### Modified Capabilities
- `hope-chacha20-poly1305`: Extend AEAD file transfer encryption to cover folder downloads and uploads (previously only single-file and banner transfers)
- `file-transfers`: Folder transfer HTXF connections use AEAD encryption when the control connection is in AEAD mode

## Impact

- **Folder download**: The existing folder download transfer code needs to wrap its read stream in `TransferReader::Aead` after the HTXF handshake, same pattern as single-file downloads
- **Folder upload**: The existing folder upload transfer code needs to wrap its write stream in `TransferWriter::Aead` after the HTXF handshake, same pattern as single-file uploads
- **Backward compatibility**: No changes to non-AEAD behavior. RC4 and plain connections continue to use unencrypted folder transfers
