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
        let is_encrypted = self.cipher.is_some();
        let rotation_count = transaction.flags & 0x3F;

        if let Some(cipher) = &mut self.cipher {
            println!("[HOPE-W] Encrypting outbound: type={:?}, id={}, body={} bytes",
                transaction.transaction_type, transaction.id, encoded.len() - TRANSACTION_HEADER_SIZE);

            // Encrypt header (20 bytes)
            cipher.process(&mut encoded[..TRANSACTION_HEADER_SIZE]);

            if encoded.len() > TRANSACTION_HEADER_SIZE {
                // Encrypt first 2 bytes of body
                let body_start = TRANSACTION_HEADER_SIZE;
                let body_len = encoded.len() - body_start;
                let first_chunk = 2.min(body_len);
                cipher.process(&mut encoded[body_start..body_start + first_chunk]);

                for _ in 0..rotation_count {
                    cipher.rotate_key();
                }

                if body_len > 2 {
                    cipher.process(&mut encoded[body_start + 2..]);
                }
            }
        } else {
            println!("[HOPE-W] Plaintext outbound: type={:?}, id={}, body={} bytes",
                transaction.transaction_type, transaction.id, encoded.len() - TRANSACTION_HEADER_SIZE);
        }

        self.inner.write_all(&encoded).await?;
        self.inner.flush().await?;

        if is_encrypted {
            println!("[HOPE-W] Encrypted packet sent ({} bytes total)", encoded.len());
        }

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
        let is_encrypted = self.cipher.is_some();

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

            // HOPE rotation count is carried in the top 8 bits of the packet type.
            // In this implementation, that maps to the first header byte. Clear it
            // before normal Hotline decoding so transaction flags remain reserved/zero.
            rotation_count = header[0];
            header[0] = 0;
        }

        // Parse transaction type and data_size from decrypted header
        let tx_type = u16::from_be_bytes([header[2], header[3]]);
        let tx_id = u32::from_be_bytes([header[4], header[5], header[6], header[7]]);
        let error_code = u32::from_be_bytes([header[8], header[9], header[10], header[11]]);
        let data_size =
            u32::from_be_bytes([header[16], header[17], header[18], header[19]]) as usize;

        if is_encrypted {
            println!("[HOPE-R] Decrypted header: type={}, id={}, error={}, body={} bytes",
                tx_type, tx_id, error_code, data_size);
        }

        if data_size > crate::protocol::constants::MAX_TRANSACTION_BODY_SIZE as usize {
            println!("[HOPE-R] ERROR: body too large ({} bytes), encrypted={}", data_size, is_encrypted);
            println!("[HOPE-R] Raw decrypted header: {:02X?}", &header);
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

                for _ in 0..rotation_count {
                    cipher.rotate_key();
                }

                // Decrypt remaining body
                if body.len() > 2 {
                    cipher.process(&mut body[2..]);
                }
            }

            full_data.extend(body);
        }

        let result = Transaction::decode(&full_data);
        if let Ok(ref tx) = result {
            if is_encrypted {
                println!("[HOPE-R] Decrypted inbound: type={:?}, id={}, error={}, fields={}",
                    tx.transaction_type, tx.id, tx.error_code, tx.fields.len());
            }
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::constants::{FieldType, TransactionType};
    use crate::protocol::transaction::{Transaction, TransactionField};
    use tokio::io::duplex;

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

    #[tokio::test]
    async fn encrypted_transaction_preserves_full_type_field() {
        let (write_stream, read_stream) = duplex(1024);
        let key = vec![0x10, 0x20, 0x30, 0x40];
        let session_key = [0u8; 64];

        let mut writer = HopeWriter::new(Box::new(write_stream));
        writer.activate_encryption(key.clone(), session_key, MacAlgorithm::HmacSha1);

        let mut reader = HopeReader::new(Box::new(read_stream));
        reader.activate_encryption(key, session_key, MacAlgorithm::HmacSha1);

        let mut outbound = Transaction::new(42, TransactionType::GetUserNameList);
        outbound.add_field(TransactionField::from_string(FieldType::Data, "hello"));

        writer.write_transaction(&outbound).await.unwrap();
        let inbound = reader.read_transaction().await.unwrap();

        assert_eq!(inbound.transaction_type, TransactionType::GetUserNameList);
        assert_eq!(inbound.id, 42);
        assert_eq!(
            inbound
                .get_field(FieldType::Data)
                .map(|field| field.data.as_slice()),
            Some(b"hello".as_slice())
        );
    }

    #[tokio::test]
    async fn encrypted_transaction_applies_rotation_from_flags_byte() {
        let (write_stream, read_stream) = duplex(1024);
        let key = vec![0x10, 0x20, 0x30, 0x40];
        let session_key = [0u8; 64];

        let mut writer = HopeWriter::new(Box::new(write_stream));
        writer.activate_encryption(key.clone(), session_key, MacAlgorithm::HmacSha1);

        let mut reader = HopeReader::new(Box::new(read_stream));
        reader.activate_encryption(key, session_key, MacAlgorithm::HmacSha1);

        let mut outbound = Transaction::new(7, TransactionType::ShowAgreement);
        outbound.flags = 1;
        outbound.add_field(TransactionField::from_string(
            FieldType::Data,
            "rotation-test-payload",
        ));

        writer.write_transaction(&outbound).await.unwrap();
        let inbound = reader.read_transaction().await.unwrap();

        assert_eq!(inbound.flags, 0);
        assert_eq!(inbound.transaction_type, TransactionType::ShowAgreement);
        assert_eq!(inbound.id, 7);
        assert_eq!(
            inbound
                .get_field(FieldType::Data)
                .map(|field| field.data.as_slice()),
            Some(b"rotation-test-payload".as_slice())
        );
    }
}
