## ADDED Requirements

### Requirement: Modern TLS connection (rustls, TLS 1.2+)

The system SHALL support encrypted connections using modern TLS (version 1.2 and above) via the `rustls` library with the `ring` crypto provider. When a bookmark has `tls: true`, the system SHALL attempt a TLS handshake on the configured port before any protocol-level communication.

Self-signed certificates are standard in the Hotline ecosystem. The system SHALL accept any server certificate without verification using a custom `NoVerifier` implementation of `ServerCertVerifier` that unconditionally accepts all certificates, TLS 1.2 signatures, and TLS 1.3 signatures.

#### Scenario: TLS connection to a modern server

- **WHEN** the user connects to a bookmark with `tls: true` and the server supports TLS 1.2+
- **THEN** the system SHALL establish a TCP connection, perform a TLS handshake using `rustls`, and wrap the stream for encrypted communication; the protocol log SHALL indicate "TLS 1.2+ handshake successful"

#### Scenario: TLS connection with self-signed certificate

- **WHEN** the server presents a self-signed certificate during TLS handshake
- **THEN** the system SHALL accept the certificate without error (NoVerifier returns `ServerCertVerified::assertion()` for all certificates)

#### Scenario: Plain TCP when TLS is disabled

- **WHEN** the user connects to a bookmark with `tls: false`
- **THEN** the system SHALL use a plain TCP connection without any TLS wrapping; the protocol log SHALL indicate "Plain TCP connection established (no TLS)"

---

### Requirement: SNI workaround for IP-address hosts

When connecting by IP address, Go-based TLS servers reject `ServerName::IpAddress` SNI extensions. The system SHALL detect when the host is an IP address and send a dummy DNS name `"hotline"` as the SNI value instead.

Since certificate verification is disabled (NoVerifier), the SNI name only affects the server's certificate selection, not validation.

#### Scenario: Connect by IP address

- **WHEN** the bookmark address is an IP address (e.g., `69.250.126.86`)
- **THEN** the system SHALL use `ServerName::try_from("hotline")` for the TLS SNI extension instead of the IP address

#### Scenario: Connect by hostname

- **WHEN** the bookmark address is a DNS hostname (e.g., `hotline.system7today.com`)
- **THEN** the system SHALL use the actual hostname for the TLS SNI extension

#### Scenario: Hostname parse failure fallback

- **WHEN** the bookmark address is a hostname that fails `ServerName::try_from()`
- **THEN** the system SHALL fall back to using `"hotline"` as the SNI name

---

### Requirement: Legacy TLS (OpenSSL, TLS 1.0)

The system SHALL support legacy TLS connections for older Hotline servers that only support TLS 1.0. Legacy TLS uses vendored OpenSSL (not the system's SecureTransport, which has removed DHE cipher suites on macOS).

Legacy TLS is opt-in via the user preference `allowLegacyTls` (default: `false`).

Legacy TLS configuration:
- Protocol version pinned to TLS 1.0 only (min and max both set to `TLS1`), ensuring the ClientHello is a pure TLS 1.0 record that ancient SecureTransport (Tiger/Leopard era) can parse
- Cipher list: `DHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA:AES256-SHA:AES128-SHA:DES-CBC3-SHA:RC4-SHA:@SECLEVEL=0`
- Certificate verification disabled (`SslVerifyMode::NONE`)
- Unsafe legacy renegotiation enabled (for servers that lack RFC 5746 support)
- SNI disabled for maximum compatibility (Tiger SecureTransport predates SNI)

#### Scenario: Modern TLS fails, legacy retry succeeds

- **WHEN** a bookmark has `tls: true`, the modern TLS handshake fails, and `allowLegacyTls` is `true`
- **THEN** the system SHALL log a warning ("TLS 1.2+ failed, retrying with legacy TLS 1.0..."), open a new TCP connection to the same address:port, perform a legacy TLS handshake using OpenSSL, and proceed with the connection

#### Scenario: Modern TLS fails, legacy not enabled

- **WHEN** a bookmark has `tls: true`, the modern TLS handshake fails, and `allowLegacyTls` is `false`
- **THEN** the system SHALL return an error that includes: "TLS handshake failed: {reason}. This server may only support older TLS versions (1.0/1.1). Try enabling \"Allow Legacy TLS\" in Settings."

#### Scenario: Legacy TLS also fails

- **WHEN** both modern TLS and legacy TLS handshakes fail
- **THEN** the system SHALL return an error: "Legacy TLS handshake also failed: {reason}"

#### Scenario: Legacy TLS SNI handling for IP addresses

- **WHEN** legacy TLS connects to an IP address host
- **THEN** the system SHALL use the dummy SNI hostname `"hotline"` (same workaround as modern TLS, via `legacy_tls_sni_host()`)

---

### Requirement: Auto-detect TLS

When the user preference `autoDetectTls` is enabled and the bookmark does not already have `tls: true`, the system SHALL attempt a TLS connection on port+100 (the Mobius TLS port convention) before falling back to a plain connection on the original port.

The system MUST NOT use a separate probe step. The TLS attempt SHALL be a real connection attempt with a 5-second timeout. This design was chosen because probing consumed a server connection slot and caused the subsequent real connection to be rejected.

#### Scenario: Auto-detect TLS succeeds

- **WHEN** `autoDetectTls` is `true`, the bookmark has `tls: false` and port `5500`
- **THEN** the system SHALL create a new bookmark copy with `tls: true` and port `5600`, attempt a full connection (TCP + TLS handshake + protocol handshake + login) with a 5-second timeout; if successful, return `ConnectResult` with `tls: true` and `port: 5600`

#### Scenario: Auto-detect TLS fails, fallback to plain

- **WHEN** `autoDetectTls` is `true`, and the TLS attempt on port+100 fails or times out
- **THEN** the system SHALL fall back to connecting on the original port with `tls: false`; the protocol log SHALL indicate the fallback reason

#### Scenario: Auto-detect TLS respects generation cancellation

- **WHEN** `autoDetectTls` is `true` and during the TLS attempt, a new connection is started (generation changes)
- **THEN** the system SHALL check the generation counter after the TLS attempt (success or failure) and abort with "Connection cancelled" if superseded

#### Scenario: Auto-detect skipped when bookmark already uses TLS

- **WHEN** `autoDetectTls` is `true` but the bookmark already has `tls: true`
- **THEN** the system SHALL connect directly using TLS on the bookmark's configured port without attempting auto-detection

---

### Requirement: Per-bookmark TLS toggle

Each bookmark has a `tls` boolean field (serde default: `false` for backward compatibility). The user can toggle this field when creating or editing a bookmark.

#### Scenario: Toggle TLS on in bookmark editor

- **WHEN** the user enables TLS on a bookmark that has port `5500`
- **THEN** the UI SHALL automatically change the port to `5600`

#### Scenario: Toggle TLS off in bookmark editor

- **WHEN** the user disables TLS on a bookmark that has port `5600`
- **THEN** the UI SHALL automatically change the port to `5500`

#### Scenario: Toggle TLS with non-standard port

- **WHEN** the user toggles TLS on a bookmark with a non-standard port (e.g., `6000`)
- **THEN** the UI SHALL keep the port unchanged (only `5500` <-> `5600` auto-switching applies)

---

### Requirement: TLS port convention

The system SHALL use port 5500 as the default plain Hotline port and port 5600 (port + 100) as the default TLS port. The tracker default port is 5498.

These constants are defined as:
- `DEFAULT_SERVER_PORT = 5500`
- `DEFAULT_TLS_PORT = 5600`
- `DEFAULT_TRACKER_PORT = 5498`

#### Scenario: URL parsing infers TLS from port

- **WHEN** the user enters a hotline URL with port 5600 (e.g., `hotline://server.example.com:5600`)
- **THEN** the system SHALL infer `tls: true` from the port number

#### Scenario: URL parsing defaults to port 5500

- **WHEN** the user enters a hotline URL without a port (e.g., `hotline://server.example.com`)
- **THEN** the system SHALL default to port 5500 with `tls: false`

---

### Requirement: File transfers use same TLS settings

File transfers (HTXF protocol) use separate TCP connections on port+1 relative to the main connection port. The transfer connection MUST match the main connection's TLS settings.

#### Scenario: File transfer on TLS connection

- **WHEN** the main connection to a server uses TLS on port 5600
- **THEN** file transfer connections SHALL use TLS on port 5601 (5600 + 1), using the same TLS wrapping logic (modern first, legacy fallback if enabled)

#### Scenario: File transfer on plain connection

- **WHEN** the main connection uses plain TCP on port 5500
- **THEN** file transfer connections SHALL use plain TCP on port 5501

#### Scenario: File transfer legacy TLS fallback

- **WHEN** a file transfer TLS handshake fails on the transfer port and `allowLegacyTls` is enabled
- **THEN** the system SHALL reconnect to the transfer port and retry with legacy TLS, matching the main connection's fallback behavior

---

### Requirement: TLS handshake timeout

All TLS handshake attempts (both modern and legacy) SHALL have a 10-second timeout. If the handshake does not complete within 10 seconds, it is treated as a failure.

#### Scenario: Modern TLS handshake timeout

- **WHEN** the modern TLS handshake does not complete within 10 seconds
- **THEN** the system SHALL treat it as a failure; if legacy TLS is enabled, retry; otherwise return a timeout error

#### Scenario: Legacy TLS handshake timeout

- **WHEN** the legacy TLS handshake does not complete within 10 seconds
- **THEN** the system SHALL return an error: "Legacy TLS handshake timed out"

#### Scenario: Auto-detect TLS timeout

- **WHEN** the auto-detect TLS attempt (full connection on port+100) does not complete within 5 seconds
- **THEN** the system SHALL fall back to plain connection on the original port
