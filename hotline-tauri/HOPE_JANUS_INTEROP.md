# HOPE Janus Interop Guide

This document describes the HOPE behavior that currently interoperates with Janus-family servers such as Janus/VesperNET. It is written for both client and server implementers.

It complements [HOPE_IMPLEMENTATION.md](HOPE_IMPLEMENTATION.md), which is a code map. This file is the wire-level sequence and interoperability guide.

## Scope

This guide covers:

- the 3-step HOPE login flow
- when encryption starts
- how RC4 transport keys are derived
- how packet rotation is handled
- what Janus currently appears to expect from a client

This guide does not cover:

- TLS
- HTXF file-transfer sockets on `port + 1`
- Blowfish transport mode
- compression beyond noting where it fits

## Working Interop Profile

The current client interoperates with Janus-family servers using this profile:

- HOPE is attempted only when the bookmark explicitly enables it
- MAC negotiation prefers `HMAC-SHA1`, then `SHA1`, `HMAC-MD5`, `MD5`, `INVERSE`
- transport cipher negotiation requests `RC4`
- HOPE step 3 is sent in plaintext
- the encrypted login reply is read only after transport keys are activated locally
- subsequent Hotline transactions are encrypted on the main control connection
- file transfers remain outside HOPE on the separate HTXF connection

## High-Level Sequence

1. Client connects and completes the normal Hotline `TRTP/HOTL` handshake.
2. Client sends a HOPE identification login packet with `UserLogin = 0x00`.
3. Server replies with a HOPE identification reply containing a 64-byte session key and its chosen MAC/cipher settings.
4. Client sends the real authenticated login packet in plaintext.
5. If transport encryption was negotiated, both sides derive RC4 keys from the password MAC.
6. Server validates the login, activates HOPE transport, and sends the login reply encrypted.
7. All later control-plane transactions on the main socket are encrypted.

## Step 1: Client Identification

The client sends a normal Hotline `Login` transaction (`107`) with HOPE-specific fields.

Required fields:

- `UserLogin (105)` = single null byte `0x00`
- `HopeMacAlgorithm (0x0E04)` = algorithm list

Common fields used by this client:

- `HopeAppId (0x0E01)` = `"HTLN"`
- `HopeAppString (0x0E02)` = client name/version string
- `HopeClientCipher (0x0EC2)` = `RC4`
- `HopeServerCipher (0x0EC1)` = `RC4`

Important rule:

- This packet is plaintext. Do not encrypt it.

## Step 2: Server Identification Reply

The server replies with a `Task`/reply transaction containing the HOPE negotiation result.

Expected fields:

- `HopeSessionKey (0x0E03)` = 64 bytes
- `HopeMacAlgorithm (0x0E04)` = exactly one chosen algorithm
- `UserLogin (105)` = empty or non-empty
- `HopeServerCipher (0x0EC1)` = chosen server-to-client cipher
- `HopeClientCipher (0x0EC2)` = chosen client-to-server cipher

`UserLogin (105)` controls how the final login field is encoded:

- empty = client inverts the login bytes
- non-empty = client MACs the login bytes with the session key

Important rule:

- This reply is still plaintext.

## Step 3: Authenticated Login

The client sends a second `Login (107)` with real credentials.

Fields used:

- `UserLogin (105)` = `inverse(login)` or `MAC(login, session_key)`
- `UserPassword (106)` = `MAC(password, session_key)`
- `UserIconId (104)` = icon id
- `UserName (102)` = nickname
- `VersionNumber (160)` = client version
- `Capabilities (357)` = capability bits

Important rule:

- This packet is still plaintext.
- Janus interop depends on not encrypting this packet.

## Transport Activation Timing

This is the part that is easy to get wrong.

Correct sequence:

1. Client sends authenticated login in plaintext.
2. Client derives transport keys immediately after sending that packet.
3. Client activates its inbound and outbound HOPE ciphers locally.
4. Client reads the login reply through the HOPE reader.

Server-side expectation:

1. Server receives plaintext authenticated login.
2. Server validates login/password MACs.
3. Server derives the same transport keys.
4. Server sends the login reply encrypted if a transport cipher was negotiated.

If a client waits to activate transport until after reading the login reply, Janus-family servers desync.

## RC4 Key Derivation

First compute:

```text
password_mac = MAC(password_bytes, session_key)
```

Then derive transport keys:

```text
encode_key = MAC(password_bytes, password_mac)
decode_key = MAC(password_bytes, encode_key)
```

Server perspective:

- `encode_key` is used for server outbound
- `decode_key` is used for server inbound

Client perspective:

- reader uses `encode_key`
- writer uses `decode_key`

## Packet Encryption

Once transport is active, Hotline control packets are encrypted packet-by-packet.

For each packet:

1. split into 20-byte Hotline header and body
2. encrypt header
3. encrypt first 2 bytes of body
4. apply any key rotation
5. encrypt remaining body

The client currently leaves rotation at zero for normal outbound traffic.

## Packet Rotation

HOPE rotation is the other easy place to desync.

Interop behavior used here:

- the rotation counter is carried in the first header byte for the encrypted packet representation
- after decrypting the header, the receiver extracts that byte as the rotation count
- the receiver clears the byte back to `0` before normal Hotline transaction decoding
- the receiver decrypts the first 2 bytes of body
- the receiver applies `rotate_key()` `rotation_count` times
- the receiver decrypts the rest of the body

Rotation function:

```text
new_key = MAC(current_key, session_key)
```

Normal application traffic generally uses a rotation count of `0`.

## What Janus Appears To Require

Based on live interop testing and current code behavior:

- HOPE step 3 must be plaintext
- the login reply must be read as encrypted when RC4 was negotiated
- transport keys must be derived exactly from `password -> password_mac -> encode_key -> decode_key`
- the full 16-bit Hotline transaction type must survive decryption unchanged
- rotation handling must not steal the high byte of the 16-bit transaction type

If any of those are wrong, the usual failure mode is:

- login appears to begin correctly
- next encrypted packet header decrypts to a bogus body size
- client reports `Transaction body too large`

## Failure Modes And Debugging

Common failures:

- sending HOPE step 3 encrypted instead of plaintext
- activating HOPE transport too late
- swapping reader and writer transport keys
- treating the high byte of the 16-bit Hotline transaction type as the rotation counter
- applying rotation before decrypting the first 2 bytes of body

Useful signs of success:

- login stays connected
- `ShowAgreement` arrives
- `GetUserNameList` works
- banner, board, or file-list traffic continues without decode errors

Useful signs of failure:

- `HOPE/protocol decode failure`
- `Transaction body too large`
- agreement succeeds but board/files/chat immediately stall

## Compatibility Notes For Other Servers

If you are implementing a different HOPE server and want to interoperate with this client:

- accept the HOPE probe only when `UserLogin` is exactly one null byte
- send a 64-byte session key
- send a single selected MAC algorithm in `HopeMacAlgorithm`
- choose whether login should be inverted or MACed via the `UserLogin` field in the step-2 reply
- treat authenticated login as plaintext
- only encrypt traffic after validating the authenticated login
- if RC4 is negotiated, encrypt the login reply
- keep Hotline transaction framing unchanged after decryption

## Code Pointers

- negotiation helpers: `src-tauri/src/protocol/client/hope.rs`
- transport reader/writer: `src-tauri/src/protocol/client/hope_stream.rs`
- login flow and activation timing: `src-tauri/src/protocol/client/mod.rs`

