// HOPE AEAD transport — ChaCha20-Poly1305 authenticated encryption
//
// Length-prefixed AEAD frames for HOPE connections that negotiate
// ChaCha20-Poly1305. Each Hotline transaction is sealed as a single frame:
//
//   +-------------------+-------------------------------+
//   | Length (4 bytes)   | Ciphertext + Tag             |
//   | big-endian uint32  | (variable + 16 bytes)        |
//   +-------------------+-------------------------------+
//
// The length field covers the ciphertext + 16-byte Poly1305 tag.
// Nonces are deterministic: direction byte + 3 zero bytes + BE u64 counter.

use super::BoxedRead;
use super::BoxedWrite;
use crate::protocol::transaction::Transaction;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Maximum AEAD frame size (16 MiB). Frames larger than this are rejected.
const MAX_AEAD_FRAME_SIZE: u32 = 16 * 1024 * 1024;

/// Direction byte for nonce construction.
const DIRECTION_SERVER_TO_CLIENT: u8 = 0x00;
const DIRECTION_CLIENT_TO_SERVER: u8 = 0x01;

/// Build a 12-byte nonce from direction byte and counter.
///
/// Layout: [dir, 0x00, 0x00, 0x00, counter_bytes(8)]
fn build_nonce(direction: u8, counter: u64) -> Nonce {
    let mut nonce = [0u8; 12];
    nonce[0] = direction;
    // bytes 1-3 are zero padding
    nonce[4..12].copy_from_slice(&counter.to_be_bytes());
    *Nonce::from_slice(&nonce)
}

/// AEAD writer for outbound ChaCha20-Poly1305 encrypted transactions.
pub struct HopeAeadWriter {
    inner: BoxedWrite,
    cipher: ChaCha20Poly1305,
    send_counter: u64,
}

impl HopeAeadWriter {
    pub fn new(inner: BoxedWrite, key: &[u8; 32]) -> Self {
        println!("[HOPE-AEAD-W] Writer created, key[0..4]={:02X?}", &key[..4]);
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .expect("32-byte key is valid for ChaCha20-Poly1305");
        Self {
            inner,
            cipher,
            send_counter: 0,
        }
    }

    /// Write raw bytes (no encryption). Used for handshake before AEAD is active.
    pub async fn write_raw(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        self.inner.write_all(data).await?;
        self.inner.flush().await?;
        Ok(())
    }

    /// Encode, seal, and send a transaction as an AEAD frame.
    pub async fn write_transaction(&mut self, transaction: &Transaction) -> Result<(), std::io::Error> {
        let plaintext = transaction.encode();

        let nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, self.send_counter);
        let ciphertext = self.cipher.encrypt(&nonce, plaintext.as_ref())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("AEAD seal failed: {}", e)))?;

        self.send_counter += 1;

        // Write 4-byte BE length prefix (ciphertext includes the 16-byte tag)
        let len = ciphertext.len() as u32;
        self.inner.write_all(&len.to_be_bytes()).await?;
        self.inner.write_all(&ciphertext).await?;
        self.inner.flush().await?;

        println!("[HOPE-AEAD-W] Sealed frame: {} bytes plaintext -> {} bytes ciphertext (counter={})",
            plaintext.len(), ciphertext.len(), self.send_counter - 1);

        Ok(())
    }
}

/// AEAD reader for inbound ChaCha20-Poly1305 encrypted transactions.
pub struct HopeAeadReader {
    inner: BoxedRead,
    cipher: ChaCha20Poly1305,
    recv_counter: u64,
}

impl HopeAeadReader {
    pub fn new(inner: BoxedRead, key: &[u8; 32]) -> Self {
        println!("[HOPE-AEAD-R] Reader created, key[0..4]={:02X?}", &key[..4]);
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .expect("32-byte key is valid for ChaCha20-Poly1305");
        Self {
            inner,
            cipher,
            recv_counter: 0,
        }
    }

    /// Read exactly `buf.len()` raw bytes (no decryption). Used for handshake.
    pub async fn read_raw(&mut self, buf: &mut [u8]) -> Result<(), std::io::Error> {
        self.inner.read_exact(buf).await?;
        Ok(())
    }

    /// Read one AEAD frame, decrypt, verify tag, and parse as a transaction.
    pub async fn read_transaction(&mut self) -> Result<Transaction, String> {
        // Read 4-byte BE length prefix
        let mut len_buf = [0u8; 4];
        self.inner.read_exact(&mut len_buf).await
            .map_err(|e| format!("Failed to read AEAD frame length: {}", e))?;

        let frame_len = u32::from_be_bytes(len_buf);

        println!("[HOPE-AEAD-R] Frame length prefix: {} bytes (raw: {:02X?}), recv_counter={}",
            frame_len, len_buf, self.recv_counter);

        if frame_len > MAX_AEAD_FRAME_SIZE {
            println!("[HOPE-AEAD-R] ERROR: frame too large: {} bytes (max {})", frame_len, MAX_AEAD_FRAME_SIZE);
            return Err(format!(
                "AEAD frame too large: {} bytes (max {})",
                frame_len, MAX_AEAD_FRAME_SIZE
            ));
        }

        if frame_len < 16 {
            println!("[HOPE-AEAD-R] ERROR: frame too small: {} bytes (min 16)", frame_len);
            return Err(format!(
                "AEAD frame too small: {} bytes (minimum 16 for auth tag)",
                frame_len
            ));
        }

        // Read ciphertext + tag
        let mut ciphertext = vec![0u8; frame_len as usize];
        self.inner.read_exact(&mut ciphertext).await
            .map_err(|e| format!("Failed to read AEAD frame data: {}", e))?;

        let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, self.recv_counter);
        let plaintext = self.cipher.decrypt(&nonce, ciphertext.as_ref())
            .map_err(|_| {
                println!("[HOPE-AEAD-R] ERROR: tag verification failed! frame_len={}, counter={}, nonce={:02X?}, ciphertext[0..16]={:02X?}",
                    frame_len, self.recv_counter, nonce.as_slice(),
                    &ciphertext[..16.min(ciphertext.len())]);
                "AEAD decryption failed: authentication tag verification failed".to_string()
            })?;

        self.recv_counter += 1;

        println!("[HOPE-AEAD-R] Opened frame: {} bytes ciphertext -> {} bytes plaintext (counter={})",
            ciphertext.len(), plaintext.len(), self.recv_counter - 1);

        Transaction::decode(&plaintext)
    }
}

// ─── Byte-level AEAD wrappers for file transfers ───
//
// File transfers use raw byte I/O (FILP headers, fork data), not transactions.
// These wrappers buffer decrypted AEAD frames so callers can read/write bytes
// as if they were using a plain stream.

/// AEAD stream reader for file transfers.
/// Reads AEAD frames from the inner stream, decrypts them, and buffers the
/// plaintext so callers can read arbitrary byte ranges.
pub struct HopeAeadStreamReader {
    inner: BoxedRead,
    cipher: ChaCha20Poly1305,
    recv_counter: u64,
    buffer: Vec<u8>,
    buffer_offset: usize,
}

impl HopeAeadStreamReader {
    pub fn new(inner: BoxedRead, key: &[u8; 32]) -> Self {
        println!("[HOPE-AEAD-FT-R] File transfer reader created, key[0..4]={:02X?}", &key[..4]);
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .expect("32-byte key is valid for ChaCha20-Poly1305");
        Self {
            inner,
            cipher,
            recv_counter: 0,
            buffer: Vec::new(),
            buffer_offset: 0,
        }
    }

    /// Read the next AEAD frame and buffer the decrypted plaintext.
    async fn read_next_frame(&mut self) -> Result<(), std::io::Error> {
        let mut len_buf = [0u8; 4];
        self.inner.read_exact(&mut len_buf).await?;
        let frame_len = u32::from_be_bytes(len_buf);

        if frame_len > MAX_AEAD_FRAME_SIZE {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("AEAD frame too large: {} bytes", frame_len),
            ));
        }

        if frame_len < 16 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("AEAD frame too small: {} bytes", frame_len),
            ));
        }

        let mut ciphertext = vec![0u8; frame_len as usize];
        self.inner.read_exact(&mut ciphertext).await?;

        let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, self.recv_counter);
        self.buffer = self.cipher.decrypt(&nonce, ciphertext.as_ref())
            .map_err(|_| {
                println!("[HOPE-AEAD-FT-R] ERROR: tag verification failed! frame_len={}, counter={}", frame_len, self.recv_counter);
                std::io::Error::new(std::io::ErrorKind::Other, "AEAD file transfer decryption failed")
            })?;
        self.buffer_offset = 0;
        self.recv_counter += 1;

        println!("[HOPE-AEAD-FT-R] Decrypted frame: {} bytes (counter={})", self.buffer.len(), self.recv_counter - 1);

        Ok(())
    }

    /// Read exactly `buf.len()` bytes, reading and decrypting AEAD frames as needed.
    pub async fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), std::io::Error> {
        let mut filled = 0;
        while filled < buf.len() {
            let available = self.buffer.len() - self.buffer_offset;
            if available > 0 {
                let to_copy = std::cmp::min(available, buf.len() - filled);
                buf[filled..filled + to_copy].copy_from_slice(
                    &self.buffer[self.buffer_offset..self.buffer_offset + to_copy],
                );
                self.buffer_offset += to_copy;
                filled += to_copy;
            } else {
                self.read_next_frame().await?;
            }
        }
        Ok(())
    }

    /// Read up to `buf.len()` bytes, returning the number of bytes read.
    /// Returns 0 if the underlying stream is closed.
    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        // If buffer is empty, try to read next frame
        let available = self.buffer.len() - self.buffer_offset;
        if available == 0 {
            match self.read_next_frame().await {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(0),
                Err(e) => return Err(e),
            }
        }

        let available = self.buffer.len() - self.buffer_offset;
        let to_copy = std::cmp::min(available, buf.len());
        buf[..to_copy].copy_from_slice(
            &self.buffer[self.buffer_offset..self.buffer_offset + to_copy],
        );
        self.buffer_offset += to_copy;
        Ok(to_copy)
    }
}

/// AEAD stream writer for file transfers.
/// Seals data into AEAD frames before writing to the inner stream.
pub struct HopeAeadStreamWriter {
    inner: BoxedWrite,
    cipher: ChaCha20Poly1305,
    send_counter: u64,
}

impl HopeAeadStreamWriter {
    pub fn new(inner: BoxedWrite, key: &[u8; 32]) -> Self {
        println!("[HOPE-AEAD-FT-W] File transfer writer created, key[0..4]={:02X?}", &key[..4]);
        let cipher = ChaCha20Poly1305::new_from_slice(key)
            .expect("32-byte key is valid for ChaCha20-Poly1305");
        Self {
            inner,
            cipher,
            send_counter: 0,
        }
    }

    /// Seal data as an AEAD frame and write it.
    pub async fn write_all(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        let nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, self.send_counter);
        let ciphertext = self.cipher.encrypt(&nonce, data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("AEAD seal failed: {}", e)))?;
        self.send_counter += 1;

        let len = ciphertext.len() as u32;
        self.inner.write_all(&len.to_be_bytes()).await?;
        self.inner.write_all(&ciphertext).await?;

        println!("[HOPE-AEAD-FT-W] Sealed frame: {} bytes -> {} bytes (counter={})",
            data.len(), ciphertext.len(), self.send_counter - 1);

        Ok(())
    }

    pub async fn flush(&mut self) -> Result<(), std::io::Error> {
        self.inner.flush().await
    }
}

/// Transfer reader: either plain or AEAD-wrapped.
/// Used by file transfer code to transparently handle encrypted transfers.
pub enum TransferReader {
    Plain(BoxedRead),
    Aead(HopeAeadStreamReader),
}

impl TransferReader {
    pub async fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), std::io::Error> {
        match self {
            Self::Plain(r) => r.read_exact(buf).await.map(|_| ()),
            Self::Aead(r) => r.read_exact(buf).await,
        }
    }

    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize, std::io::Error> {
        match self {
            Self::Plain(r) => r.read(buf).await,
            Self::Aead(r) => r.read(buf).await,
        }
    }
}

/// Transfer writer: either plain or AEAD-wrapped.
pub enum TransferWriter {
    Plain(BoxedWrite),
    Aead(HopeAeadStreamWriter),
}

impl TransferWriter {
    pub async fn write_all(&mut self, data: &[u8]) -> Result<(), std::io::Error> {
        match self {
            Self::Plain(w) => w.write_all(data).await,
            Self::Aead(w) => w.write_all(data).await,
        }
    }

    pub async fn flush(&mut self) -> Result<(), std::io::Error> {
        match self {
            Self::Plain(w) => w.flush().await,
            Self::Aead(w) => w.flush().await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::constants::{FieldType, TransactionType};
    use crate::protocol::transaction::{Transaction, TransactionField};
    use tokio::io::duplex;

    #[tokio::test]
    async fn aead_encrypt_decrypt_roundtrip() {
        let (write_stream, read_stream) = duplex(4096);

        // Server encrypts with encode_key, client decrypts with encode_key
        // Client encrypts with decode_key, server decrypts with decode_key
        // For this test, we use the same key for both directions since
        // the nonce direction byte prevents nonce reuse.
        let key = [0x42u8; 32];

        let mut writer = HopeAeadWriter::new(Box::new(write_stream), &key);
        // Writer uses client->server direction (0x01)
        // Reader uses server->client direction (0x00)
        // So we need writer to be the "server" side for this test
        // Actually: writer always uses CLIENT_TO_SERVER, reader always uses SERVER_TO_CLIENT
        // For a proper roundtrip, we need to swap: use the reader key for writer and vice versa

        // Simpler: test with server-side writer and client-side reader
        // The writer here acts as client (direction 0x01)
        // The reader acts as server receiving (expects direction 0x01)
        // But our reader uses direction 0x00 (SERVER_TO_CLIENT)...
        //
        // In practice: server's writer sends with direction 0x00 (server->client)
        // and client's reader receives with direction 0x00.
        // Client's writer sends with direction 0x01 (client->server)
        // and server's reader receives with direction 0x01.
        //
        // For this roundtrip test, we need the writer to use the same
        // direction as the reader. Let's test by creating a matched pair:
        // A "server writer" that uses direction 0x00, paired with
        // a "client reader" that uses direction 0x00.
        //
        // Our HopeAeadWriter always uses CLIENT_TO_SERVER (0x01)
        // and HopeAeadReader always uses SERVER_TO_CLIENT (0x00).
        // So this represents a real client-server pair:
        //   - Client writes (direction 0x01) -> would need server reader (direction 0x01)
        //   - Server writes (direction 0x00) -> client reader (direction 0x00)
        //
        // For a working roundtrip test, we need to simulate the server side.
        // The simplest approach: just test that the data flows correctly by
        // having the writer encrypt and the reader decrypt at the correct offsets.
        //
        // Actually, re-reading the code: our writer sends with direction 0x01
        // and our reader expects direction 0x00. These won't match in a loopback.
        // We need to create a test helper. Instead, let's just test the
        // server->client direction: manually build AEAD frames.
        drop(writer);
        drop(read_stream);

        // Test server->client: manually seal a frame and verify the reader opens it
        let (mut write_half, read_half) = duplex(4096);

        let mut reader = HopeAeadReader::new(Box::new(read_half), &key);

        // Create a transaction and seal it as the server would (direction 0x00)
        let mut tx = Transaction::new(42, TransactionType::GetUserNameList);
        tx.add_field(TransactionField::from_string(FieldType::Data, "hello AEAD"));
        let plaintext = tx.encode();

        let cipher = ChaCha20Poly1305::new_from_slice(&key).unwrap();
        let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, 0);
        let ciphertext = cipher.encrypt(&nonce, plaintext.as_ref()).unwrap();

        // Write frame: length + ciphertext
        let len = ciphertext.len() as u32;
        write_half.write_all(&len.to_be_bytes()).await.unwrap();
        write_half.write_all(&ciphertext).await.unwrap();
        write_half.flush().await.unwrap();
        drop(write_half);

        let result = reader.read_transaction().await.unwrap();
        assert_eq!(result.transaction_type, TransactionType::GetUserNameList);
        assert_eq!(result.id, 42);
        assert_eq!(
            result.get_field(FieldType::Data).map(|f| f.data.as_slice()),
            Some(b"hello AEAD".as_slice())
        );
    }

    #[tokio::test]
    async fn aead_nonce_counter_increments() {
        let key = [0x42u8; 32];
        let (mut write_half, read_half) = duplex(8192);

        let mut reader = HopeAeadReader::new(Box::new(read_half), &key);

        let cipher = ChaCha20Poly1305::new_from_slice(&key).unwrap();

        // Send two frames with incrementing nonces
        for counter in 0..2u64 {
            let tx = Transaction::new(counter as u32 + 1, TransactionType::SendChat);
            let plaintext = tx.encode();
            let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, counter);
            let ciphertext = cipher.encrypt(&nonce, plaintext.as_ref()).unwrap();
            let len = ciphertext.len() as u32;
            write_half.write_all(&len.to_be_bytes()).await.unwrap();
            write_half.write_all(&ciphertext).await.unwrap();
        }
        write_half.flush().await.unwrap();
        drop(write_half);

        let r1 = reader.read_transaction().await.unwrap();
        assert_eq!(r1.id, 1);
        let r2 = reader.read_transaction().await.unwrap();
        assert_eq!(r2.id, 2);
    }

    #[tokio::test]
    async fn aead_tag_verification_failure() {
        let key = [0x42u8; 32];
        let (mut write_half, read_half) = duplex(4096);

        let mut reader = HopeAeadReader::new(Box::new(read_half), &key);

        // Build a valid frame but corrupt the ciphertext
        let cipher = ChaCha20Poly1305::new_from_slice(&key).unwrap();
        let tx = Transaction::new(1, TransactionType::SendChat);
        let plaintext = tx.encode();
        let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, 0);
        let mut ciphertext = cipher.encrypt(&nonce, plaintext.as_ref()).unwrap();

        // Corrupt a byte
        ciphertext[0] ^= 0xFF;

        let len = ciphertext.len() as u32;
        write_half.write_all(&len.to_be_bytes()).await.unwrap();
        write_half.write_all(&ciphertext).await.unwrap();
        write_half.flush().await.unwrap();
        drop(write_half);

        let result = reader.read_transaction().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("authentication tag verification failed"));
    }

    #[tokio::test]
    async fn aead_oversized_frame_rejected() {
        let key = [0x42u8; 32];
        let (mut write_half, read_half) = duplex(4096);

        let mut reader = HopeAeadReader::new(Box::new(read_half), &key);

        // Send a length that exceeds the maximum
        let oversized_len: u32 = MAX_AEAD_FRAME_SIZE + 1;
        write_half.write_all(&oversized_len.to_be_bytes()).await.unwrap();
        write_half.flush().await.unwrap();
        drop(write_half);

        let result = reader.read_transaction().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("AEAD frame too large"));
    }

    #[test]
    fn nonce_construction_first_client_frame() {
        let nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, 0);
        assert_eq!(
            nonce.as_slice(),
            &[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn nonce_construction_second_client_frame() {
        let nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, 1);
        assert_eq!(
            nonce.as_slice(),
            &[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01]
        );
    }

    #[test]
    fn nonce_construction_server_direction() {
        let nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, 0);
        assert_eq!(
            nonce.as_slice(),
            &[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        );
    }

    #[test]
    fn nonce_directions_differ() {
        let client_nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, 5);
        let server_nonce = build_nonce(DIRECTION_SERVER_TO_CLIENT, 5);
        assert_ne!(client_nonce, server_nonce);
    }

    #[tokio::test]
    async fn aead_writer_sends_valid_frames() {
        let key = [0x42u8; 32];
        let (write_half, mut read_half) = duplex(4096);

        let mut writer = HopeAeadWriter::new(Box::new(write_half), &key);

        let mut tx = Transaction::new(7, TransactionType::SendChat);
        tx.add_field(TransactionField::from_string(FieldType::Data, "test"));
        writer.write_transaction(&tx).await.unwrap();
        drop(writer);

        // Read the frame manually and verify we can decrypt it
        let mut len_buf = [0u8; 4];
        read_half.read_exact(&mut len_buf).await.unwrap();
        let frame_len = u32::from_be_bytes(len_buf);

        let mut ciphertext = vec![0u8; frame_len as usize];
        read_half.read_exact(&mut ciphertext).await.unwrap();

        // Decrypt with client->server direction, counter 0
        let cipher = ChaCha20Poly1305::new_from_slice(&key).unwrap();
        let nonce = build_nonce(DIRECTION_CLIENT_TO_SERVER, 0);
        let plaintext = cipher.decrypt(&nonce, ciphertext.as_ref()).unwrap();

        let decoded = Transaction::decode(&plaintext).unwrap();
        assert_eq!(decoded.id, 7);
        assert_eq!(decoded.transaction_type, TransactionType::SendChat);
    }
}
