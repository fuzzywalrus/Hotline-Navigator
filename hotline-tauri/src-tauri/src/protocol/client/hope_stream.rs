// HOPE transport encryption — HopeReader / HopeWriter
//
// Packet-aware wrappers over the raw read/write halves that handle:
// - Transaction encoding/decoding
// - RC4 stream encryption/decryption
// - Key rotation (forward secrecy)
// - Optional zlib compression (future)
//
// File transfers (HTXF on port+1) are NOT encrypted by HOPE.

use super::hope::{compute_mac, MacAlgorithm};
use super::BoxedRead;
use super::BoxedWrite;
use crate::protocol::constants::TRANSACTION_HEADER_SIZE;
use crate::protocol::transaction::Transaction;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// RC4 stream cipher state (ARC4).
struct Rc4 {
    s: [u8; 256],
    i: u8,
    j: u8,
}

impl Rc4 {
    fn new(key: &[u8]) -> Self {
        let mut s = [0u8; 256];
        for i in 0..256 {
            s[i] = i as u8;
        }
        let mut j: u8 = 0;
        for i in 0..256 {
            j = j.wrapping_add(s[i]).wrapping_add(key[i % key.len()]);
            s.swap(i, j as usize);
        }
        Rc4 { s, i: 0, j: 0 }
    }

    fn process(&mut self, data: &mut [u8]) {
        for byte in data.iter_mut() {
            self.i = self.i.wrapping_add(1);
            self.j = self.j.wrapping_add(self.s[self.i as usize]);
            self.s.swap(self.i as usize, self.j as usize);
            let k = self.s[(self.s[self.i as usize].wrapping_add(self.s[self.j as usize])) as usize];
            *byte ^= k;
        }
    }
}

/// Cipher state for one direction of a HOPE-encrypted connection.
struct HopeCipherState {
    rc4: Rc4,
    current_key: Vec<u8>,
    session_key: [u8; 64],
    mac_algorithm: MacAlgorithm,
}

impl HopeCipherState {
    fn new(key: Vec<u8>, session_key: [u8; 64], mac_algorithm: MacAlgorithm) -> Self {
        let rc4 = Rc4::new(&key);
        Self {
            rc4,
            current_key: key,
            session_key,
            mac_algorithm,
        }
    }

    /// XOR data with the RC4 keystream.
    fn process(&mut self, data: &mut [u8]) {
        self.rc4.process(data);
    }

    /// Rotate the cipher key: new_key = MAC(current_key, session_key), then re-init RC4.
    fn rotate_key(&mut self) {
        self.current_key = compute_mac(self.mac_algorithm, &self.current_key, &self.session_key);
        self.rc4 = Rc4::new(&self.current_key);
    }
}

/// HOPE-aware writer that wraps the raw write half.
///
/// Before encryption is active, `write_raw` passes bytes through unchanged.
/// After `activate_encryption`, `write_transaction` encrypts outbound packets.
pub struct HopeWriter {
    inner: BoxedWrite,
    cipher: Option<HopeCipherState>,
}

impl HopeWriter {
    pub fn new(inner: BoxedWrite) -> Self {
        Self { inner, cipher: None }
    }

    /// Activate transport encryption with the given key material.
    pub fn activate_encryption(
        &mut self,
        key: Vec<u8>,
        session_key: [u8; 64],
        mac_algorithm: MacAlgorithm,
    ) {
        self.cipher = Some(HopeCipherState::new(key, session_key, mac_algorithm));
    }

    /// Write raw bytes (no encryption). Used for handshake and HOPE negotiation.
    pub async fn write_raw(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        self.inner.write_all(data).await?;
        self.inner.flush().await?;
        Ok(())
    }

    /// Encode and send a transaction, encrypting if active.
    pub async fn write_transaction(&mut self, transaction: &Transaction) -> Result<(), std::io::Error> {
        let mut encoded = transaction.encode();

        if let Some(cipher) = &mut self.cipher {
            // No rotation on outbound for now (rotation_count = 0).
            // Encrypt entire packet (header + body) as a contiguous stream.
            // The rotation count is embedded in the top byte of the type field;
            // with count=0 the type field is unchanged.

            // Encrypt header (20 bytes)
            cipher.process(&mut encoded[..TRANSACTION_HEADER_SIZE]);

            if encoded.len() > TRANSACTION_HEADER_SIZE {
                // Encrypt first 2 bytes of body
                let body_start = TRANSACTION_HEADER_SIZE;
                let body_len = encoded.len() - body_start;
                let first_chunk = 2.min(body_len);
                cipher.process(&mut encoded[body_start..body_start + first_chunk]);
                // No rotation (count=0), so encrypt rest directly
                if body_len > 2 {
                    cipher.process(&mut encoded[body_start + 2..]);
                }
            }
        }

        self.inner.write_all(&encoded).await?;
        self.inner.flush().await?;
        Ok(())
    }
}

/// HOPE-aware reader that wraps the raw read half.
///
/// Before encryption is active, `read_raw` passes bytes through unchanged.
/// After `activate_encryption`, `read_transaction` decrypts inbound packets.
pub struct HopeReader {
    inner: BoxedRead,
    cipher: Option<HopeCipherState>,
}

impl HopeReader {
    pub fn new(inner: BoxedRead) -> Self {
        Self { inner, cipher: None }
    }

    /// Activate transport encryption with the given key material.
    pub fn activate_encryption(
        &mut self,
        key: Vec<u8>,
        session_key: [u8; 64],
        mac_algorithm: MacAlgorithm,
    ) {
        self.cipher = Some(HopeCipherState::new(key, session_key, mac_algorithm));
    }

    /// Read exactly `buf.len()` raw bytes (no decryption). Used for handshake.
    pub async fn read_raw(&mut self, buf: &mut [u8]) -> Result<(), std::io::Error> {
        self.inner.read_exact(buf).await?;
        Ok(())
    }

    /// Read and decode one transaction, decrypting if active.
    pub async fn read_transaction(&mut self) -> Result<Transaction, String> {
        // Read 20-byte header
        let mut header = [0u8; TRANSACTION_HEADER_SIZE];
        self.inner
            .read_exact(&mut header)
            .await
            .map_err(|e| format!("Failed to read transaction header: {}", e))?;

        let mut rotation_count: u8 = 0;

        if let Some(cipher) = &mut self.cipher {
            // Decrypt header
            cipher.process(&mut header);

            // Extract rotation count from top byte of type field (bytes 2-3)
            rotation_count = header[2];
            header[2] = 0; // Clear rotation bits to get real type
        }

        // Parse data_size from decrypted header
        let data_size =
            u32::from_be_bytes([header[16], header[17], header[18], header[19]]) as usize;

        if data_size > crate::protocol::constants::MAX_TRANSACTION_BODY_SIZE as usize {
            return Err(format!(
                "Transaction body too large: {} bytes (max {})",
                data_size, crate::protocol::constants::MAX_TRANSACTION_BODY_SIZE
            ));
        }

        let mut full_data = header.to_vec();

        if data_size > 0 {
            let mut body = vec![0u8; data_size];
            self.inner
                .read_exact(&mut body)
                .await
                .map_err(|e| format!("Failed to read transaction body: {}", e))?;

            if let Some(cipher) = &mut self.cipher {
                // Decrypt first 2 bytes of body
                let first_chunk = 2.min(body.len());
                cipher.process(&mut body[..first_chunk]);

                // Apply key rotation if signalled
                for _ in 0..rotation_count {
                    cipher.rotate_key();
                }

                // Decrypt remaining body
                if body.len() > 2 {
                    cipher.process(&mut body[2..]);
                }
            }

            full_data.extend(body);
        } else if let Some(cipher) = &mut self.cipher {
            // Even with no body, apply rotation if signalled
            for _ in 0..rotation_count {
                cipher.rotate_key();
            }
        }

        Transaction::decode(&full_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rc4_known_vector() {
        // RC4("Key", "Plaintext") — well-known test vector
        let mut cipher = Rc4::new(b"Key");
        let mut data = b"Plaintext".to_vec();
        cipher.process(&mut data);
        // RC4("Key","Plaintext") = BBF316E8D940AF0AD3
        assert_eq!(
            data,
            vec![0xBB, 0xF3, 0x16, 0xE8, 0xD9, 0x40, 0xAF, 0x0A, 0xD3]
        );
    }

    #[test]
    fn rc4_encrypt_decrypt_roundtrip() {
        let key = b"test_key_123";
        let original = b"Hello, HOPE transport encryption!".to_vec();

        let mut encrypted = original.clone();
        Rc4::new(key).process(&mut encrypted);

        // Decrypt with fresh RC4 state (same key)
        let mut decrypted = encrypted.clone();
        Rc4::new(key).process(&mut decrypted);

        assert_eq!(decrypted, original);
    }

    #[test]
    fn cipher_state_rotation() {
        let key = vec![1, 2, 3, 4];
        let session_key = [0u8; 64];
        let mut state = HopeCipherState::new(key.clone(), session_key, MacAlgorithm::HmacSha1);

        // After rotation, key should differ from original
        state.rotate_key();
        assert_ne!(state.current_key, key);
        assert_eq!(state.current_key.len(), 20); // SHA1 output
    }
}
