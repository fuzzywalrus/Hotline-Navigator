// HOPE (Hotline One-time Password Extension) crypto module
//
// Implements MAC algorithms and negotiation helpers for the HOPE secure login
// protocol. See: https://github.com/fogWraith/Hotline/blob/main/Docs/Protocol/HOPE-Secure-Login.md

use hmac::{Hmac, Mac};
use md5::Md5;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use hkdf::Hkdf;

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacMd5 = Hmac<Md5>;

/// MAC algorithms supported by HOPE, listed strongest to weakest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacAlgorithm {
    HmacSha256,
    HmacSha1,
    Sha1,
    HmacMd5,
    Md5,
    Inverse,
}

impl MacAlgorithm {
    /// The wire name used in HOPE negotiation.
    pub fn name(&self) -> &'static str {
        match self {
            Self::HmacSha256 => "HMAC-SHA256",
            Self::HmacSha1 => "HMAC-SHA1",
            Self::Sha1 => "SHA1",
            Self::HmacMd5 => "HMAC-MD5",
            Self::Md5 => "MD5",
            Self::Inverse => "INVERSE",
        }
    }

    /// Parse an algorithm name from wire bytes (case-insensitive).
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_ascii_uppercase().as_str() {
            "HMAC-SHA256" => Some(Self::HmacSha256),
            "HMAC-SHA1" => Some(Self::HmacSha1),
            "SHA1" => Some(Self::Sha1),
            "HMAC-MD5" => Some(Self::HmacMd5),
            "MD5" => Some(Self::Md5),
            "INVERSE" => Some(Self::Inverse),
            _ => None,
        }
    }

    /// Whether this algorithm can be used for transport key derivation.
    /// INVERSE cannot derive keys — it's authentication-only.
    pub fn supports_transport(&self) -> bool {
        !matches!(self, Self::Inverse)
    }
}

/// Compute a MAC using the given algorithm.
///
/// - For HMAC variants: `key` is the HMAC key, `message` is the data to authenticate.
/// - For bare hash variants: computes `hash(key + message)` (concatenation).
/// - For INVERSE: returns `key` with each byte bitwise-NOT'd.
pub fn compute_mac(algorithm: MacAlgorithm, key: &[u8], message: &[u8]) -> Vec<u8> {
    match algorithm {
        MacAlgorithm::HmacSha256 => {
            let mut mac = HmacSha256::new_from_slice(key)
                .expect("HMAC-SHA256 accepts any key length");
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        MacAlgorithm::HmacSha1 => {
            let mut mac = HmacSha1::new_from_slice(key)
                .expect("HMAC-SHA1 accepts any key length");
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        MacAlgorithm::Sha1 => {
            let mut hasher = Sha1::new();
            hasher.update(key);
            hasher.update(message);
            hasher.finalize().to_vec()
        }
        MacAlgorithm::HmacMd5 => {
            let mut mac = HmacMd5::new_from_slice(key)
                .expect("HMAC-MD5 accepts any key length");
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        MacAlgorithm::Md5 => {
            let mut hasher = Md5::new();
            hasher.update(key);
            hasher.update(message);
            hasher.finalize().to_vec()
        }
        MacAlgorithm::Inverse => {
            key.iter().map(|b| !b).collect()
        }
    }
}

/// Encode a list of MAC algorithm names into the HOPE wire format.
///
/// Format: `<u16:count> [<u8:len> <str:name>]+`
pub fn encode_algorithm_list(algorithms: &[MacAlgorithm]) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&(algorithms.len() as u16).to_be_bytes());
    for alg in algorithms {
        let name = alg.name().as_bytes();
        buf.push(name.len() as u8);
        buf.extend_from_slice(name);
    }
    buf
}

/// Encode a list of cipher name strings into the HOPE wire format.
///
/// Same format as algorithm lists: `<u16:count> [<u8:len> <str:name>]+`
pub fn encode_cipher_list(names: &[&str]) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&(names.len() as u16).to_be_bytes());
    for name in names {
        let name_bytes = name.as_bytes();
        buf.push(name_bytes.len() as u8);
        buf.extend_from_slice(name_bytes);
    }
    buf
}

/// Decode a single algorithm selection from the server's reply.
///
/// Format: `0x0001 <u8:len> <str:name>`
pub fn decode_algorithm_selection(data: &[u8]) -> Result<MacAlgorithm, String> {
    if data.len() < 3 {
        return Err("Algorithm selection data too short".to_string());
    }
    let count = u16::from_be_bytes([data[0], data[1]]);
    if count != 1 {
        return Err(format!("Expected 1 algorithm in selection, got {}", count));
    }
    let name_len = data[2] as usize;
    if data.len() < 3 + name_len {
        return Err("Algorithm name truncated".to_string());
    }
    let name = std::str::from_utf8(&data[3..3 + name_len])
        .map_err(|_| "Algorithm name is not valid UTF-8".to_string())?;
    MacAlgorithm::from_name(name)
        .ok_or_else(|| format!("Unknown MAC algorithm: {}", name))
}

/// Decode a single cipher selection from the server's reply.
///
/// Same format as algorithm selection.
pub fn decode_cipher_selection(data: &[u8]) -> Result<String, String> {
    if data.len() < 3 {
        return Err("Cipher selection data too short".to_string());
    }
    let count = u16::from_be_bytes([data[0], data[1]]);
    if count < 1 {
        return Ok("NONE".to_string());
    }
    let name_len = data[2] as usize;
    if data.len() < 3 + name_len {
        return Err("Cipher name truncated".to_string());
    }
    let name = std::str::from_utf8(&data[3..3 + name_len])
        .map_err(|_| "Cipher name is not valid UTF-8".to_string())?;
    Ok(normalize_cipher_name(name))
}

/// Result of HOPE negotiation (steps 1+2), used to drive step 3 and key derivation.
pub struct HopeNegotiation {
    pub session_key: [u8; 64],
    pub mac_algorithm: MacAlgorithm,
    pub mac_login: bool, // true if login should be MAC'd (server's login field was non-empty)
    pub server_cipher: String,  // "NONE", "RC4", "CHACHA20-POLY1305"
    pub client_cipher: String,
    pub server_cipher_mode: String, // "AEAD" or "STREAM" (from server reply)
    pub client_cipher_mode: String,
    pub server_compression: String,
    pub client_compression: String,
}

/// The preferred algorithm list we send to servers.
/// Ordered strongest → weakest. INVERSE is always last (required fallback).
pub const PREFERRED_MAC_ALGORITHMS: &[MacAlgorithm] = &[
    MacAlgorithm::HmacSha256,
    MacAlgorithm::HmacSha1,
    MacAlgorithm::Sha1,
    MacAlgorithm::HmacMd5,
    MacAlgorithm::Md5,
    MacAlgorithm::Inverse,
];

/// Ciphers we support for transport encryption.
pub const SUPPORTED_CIPHERS: &[&str] = &["CHACHA20-POLY1305", "RC4"];

/// Normalize a cipher name from the server to a canonical form.
pub fn normalize_cipher_name(name: &str) -> String {
    match name.to_ascii_uppercase().as_str() {
        "RC4" | "RC4-128" | "ARCFOUR" => "RC4".to_string(),
        "CHACHA20-POLY1305" | "CHACHA20POLY1305" | "CHACHA20" => "CHACHA20-POLY1305".to_string(),
        other => other.to_string(),
    }
}

/// Expand key material to 256-bit (32 bytes) using HKDF-SHA256.
///
/// Used to derive ChaCha20-Poly1305 keys from MAC outputs that may be
/// shorter than 32 bytes (e.g., 20-byte HMAC-SHA1 or 16-byte HMAC-MD5).
pub fn expand_key_for_aead(ikm: &[u8], salt: &[u8], info: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm)
        .expect("32-byte output is a valid HKDF-SHA256 expansion length");
    okm
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inverse_mac() {
        let result = compute_mac(MacAlgorithm::Inverse, b"abc", b"ignored");
        assert_eq!(result, vec![!b'a', !b'b', !b'c']);
    }

    #[test]
    fn test_hmac_sha256() {
        let result = compute_mac(MacAlgorithm::HmacSha256, b"key", b"message");
        assert_eq!(result.len(), 32); // SHA256 output
    }

    #[test]
    fn test_hmac_sha1() {
        let result = compute_mac(MacAlgorithm::HmacSha1, b"key", b"message");
        assert_eq!(result.len(), 20); // SHA1 output
    }

    #[test]
    fn test_hmac_md5() {
        let result = compute_mac(MacAlgorithm::HmacMd5, b"key", b"message");
        assert_eq!(result.len(), 16); // MD5 output
    }

    #[test]
    fn test_sha1_concat() {
        let result = compute_mac(MacAlgorithm::Sha1, b"key", b"message");
        assert_eq!(result.len(), 20);
    }

    #[test]
    fn test_md5_concat() {
        let result = compute_mac(MacAlgorithm::Md5, b"key", b"message");
        assert_eq!(result.len(), 16);
    }

    #[test]
    fn test_encode_algorithm_list() {
        let list = encode_algorithm_list(&[MacAlgorithm::HmacSha1, MacAlgorithm::HmacMd5]);
        // count=2, then "HMAC-SHA1" (len=9), then "HMAC-MD5" (len=8)
        assert_eq!(&list[0..2], &[0x00, 0x02]);
        assert_eq!(list[2], 9);
        assert_eq!(&list[3..12], b"HMAC-SHA1");
        assert_eq!(list[12], 8);
        assert_eq!(&list[13..21], b"HMAC-MD5");
    }

    #[test]
    fn test_decode_algorithm_selection() {
        // Encode a selection of HMAC-SHA1
        let data = encode_algorithm_list(&[MacAlgorithm::HmacSha1]);
        let alg = decode_algorithm_selection(&data).unwrap();
        assert_eq!(alg, MacAlgorithm::HmacSha1);
    }

    #[test]
    fn test_algorithm_name_roundtrip() {
        for alg in PREFERRED_MAC_ALGORITHMS {
            let parsed = MacAlgorithm::from_name(alg.name()).unwrap();
            assert_eq!(*alg, parsed);
        }
    }

    #[test]
    fn test_hkdf_expand_key_for_aead() {
        let key = expand_key_for_aead(b"test_ikm", b"test_salt", "hope-chacha-encode");
        assert_eq!(key.len(), 32);
        // Different info strings must produce different keys
        let key2 = expand_key_for_aead(b"test_ikm", b"test_salt", "hope-chacha-decode");
        assert_ne!(key, key2);
    }

    #[test]
    fn test_hkdf_deterministic() {
        let key1 = expand_key_for_aead(b"ikm", b"salt", "info");
        let key2 = expand_key_for_aead(b"ikm", b"salt", "info");
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_normalize_cipher_name() {
        assert_eq!(normalize_cipher_name("RC4"), "RC4");
        assert_eq!(normalize_cipher_name("RC4-128"), "RC4");
        assert_eq!(normalize_cipher_name("ARCFOUR"), "RC4");
        assert_eq!(normalize_cipher_name("CHACHA20-POLY1305"), "CHACHA20-POLY1305");
        assert_eq!(normalize_cipher_name("CHACHA20POLY1305"), "CHACHA20-POLY1305");
        assert_eq!(normalize_cipher_name("CHACHA20"), "CHACHA20-POLY1305");
        assert_eq!(normalize_cipher_name("chacha20-poly1305"), "CHACHA20-POLY1305");
        assert_eq!(normalize_cipher_name("NONE"), "NONE");
    }
}
