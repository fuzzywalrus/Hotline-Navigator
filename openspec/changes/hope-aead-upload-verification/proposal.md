## Why

The HOPE AEAD file upload code is implemented but has not been tested against a real server. The upload path wraps the HTXF transfer socket in `TransferWriter::Aead` after the handshake and sends the FILP stream (INFO + DATA forks) through AEAD framing. This needs verification to confirm the server correctly receives and decrypts the uploaded data.

The initial testing against VesperNet could not cover uploads because the server had no upload folder configured.

## What Changes

- Test AEAD-encrypted file upload against a server with upload permissions
- Fix any issues discovered during testing (framing, key derivation, flush timing)
- No new code expected — the upload AEAD wrapping is already implemented

## Capabilities

### Modified Capabilities
- `hope-chacha20-poly1305`: Verify AEAD file upload path works end-to-end (code exists, needs validation)

## Impact

- **Minimal code changes expected** — the upload wrapping follows the same pattern as downloads, which are already confirmed working
- **Depends on**: A test server with upload folder enabled and HOPE AEAD support
