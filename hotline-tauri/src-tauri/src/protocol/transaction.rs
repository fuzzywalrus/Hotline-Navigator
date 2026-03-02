// Hotline transaction structures

use super::constants::{FieldType, TransactionType, TRANSACTION_HEADER_SIZE};

#[derive(Debug, Clone)]
pub struct TransactionField {
    pub field_type: FieldType,
    pub data: Vec<u8>,
}

impl TransactionField {
    pub fn new(field_type: FieldType, data: Vec<u8>) -> Self {
        Self { field_type, data }
    }

    pub fn from_string(field_type: FieldType, value: &str) -> Self {
        Self {
            field_type,
            data: value.as_bytes().to_vec(),
        }
    }

    pub fn from_encoded_string(field_type: FieldType, value: &str) -> Self {
        // Simple obfuscation (XOR with 0xFF) - Hotline's encoding
        let encoded: Vec<u8> = value.bytes().map(|b| b ^ 0xFF).collect();
        Self {
            field_type,
            data: encoded,
        }
    }

    pub fn from_u16(field_type: FieldType, value: u16) -> Self {
        Self {
            field_type,
            data: value.to_be_bytes().to_vec(),
        }
    }

    pub fn from_u32(field_type: FieldType, value: u32) -> Self {
        Self {
            field_type,
            data: value.to_be_bytes().to_vec(),
        }
    }

    pub fn from_u64(field_type: FieldType, value: u64) -> Self {
        Self {
            field_type,
            data: value.to_be_bytes().to_vec(),
        }
    }

    pub fn from_path(field_type: FieldType, path: &[String]) -> Self {
        let mut data = Vec::new();

        // Write count of path components
        data.extend_from_slice(&(path.len() as u16).to_be_bytes());

        // Write each path component with MacRoman encoding
        for component in path {
            // Try MacRoman first (native Hotline encoding), fall back to UTF-8
            let (encoded, _, had_unmappable) = encoding_rs::MACINTOSH.encode(component);
            let component_bytes = if had_unmappable {
                component.as_bytes()
            } else {
                &encoded
            };

            // Write separator (always 0)
            data.extend_from_slice(&0u16.to_be_bytes());

            // Protocol limits component length to 1 byte (255 max)
            let len = component_bytes.len().min(255);
            data.push(len as u8);
            data.extend_from_slice(&component_bytes[..len]);
        }

        Self {
            field_type,
            data,
        }
    }

    pub fn to_string(&self) -> Result<String, String> {
        // Try UTF-8 first
        let s = if let Ok(s) = String::from_utf8(self.data.clone()) {
            s
        } else {
            // Fall back to MacOS Roman (x-mac-roman) - this is what Hotline protocol uses
            let (decoded, _encoding, had_errors) = encoding_rs::MACINTOSH.decode(&self.data);
            if had_errors {
                return Err("Failed to decode string".to_string());
            }
            decoded.into_owned()
        };

        // Classic Mac OS used \r (carriage return) for line breaks, but modern systems use \n
        // Convert \r to \n so they render properly in HTML
        Ok(s.replace('\r', "\n"))
    }

    pub fn to_u16(&self) -> Result<u16, String> {
        if self.data.len() != 2 {
            return Err(format!("Invalid u16 size: {}", self.data.len()));
        }
        Ok(u16::from_be_bytes([self.data[0], self.data[1]]))
    }

    pub fn to_u32(&self) -> Result<u32, String> {
        if self.data.len() != 4 {
            return Err(format!("Invalid u32 size: {}", self.data.len()));
        }
        Ok(u32::from_be_bytes([
            self.data[0],
            self.data[1],
            self.data[2],
            self.data[3],
        ]))
    }

    pub fn to_u64(&self) -> Result<u64, String> {
        if self.data.len() != 8 {
            return Err(format!("Invalid u64 size: {}", self.data.len()));
        }
        Ok(u64::from_be_bytes([
            self.data[0],
            self.data[1],
            self.data[2],
            self.data[3],
            self.data[4],
            self.data[5],
            self.data[6],
            self.data[7],
        ]))
    }

    // Encode field for transmission
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(&(self.field_type as u16).to_be_bytes());
        buf.extend_from_slice(&(self.data.len() as u16).to_be_bytes());
        buf.extend_from_slice(&self.data);
        buf
    }
}

#[derive(Debug, Clone)]
pub struct Transaction {
    pub flags: u8,
    pub is_reply: u8,
    pub transaction_type: TransactionType,
    pub id: u32,
    pub error_code: u32,
    pub fields: Vec<TransactionField>,
}

impl Transaction {
    pub fn new(id: u32, transaction_type: TransactionType) -> Self {
        Self {
            flags: 0,
            is_reply: 0,
            transaction_type,
            id,
            error_code: 0,
            fields: Vec::new(),
        }
    }

    pub fn add_field(&mut self, field: TransactionField) {
        self.fields.push(field);
    }

    pub fn get_field(&self, field_type: FieldType) -> Option<&TransactionField> {
        self.fields
            .iter()
            .find(|f| f.field_type == field_type)
    }

    // Calculate the data size (all encoded fields)
    fn calculate_data_size(&self) -> u32 {
        let mut size = 2; // Field count (u16)
        for field in &self.fields {
            size += 2; // Field type
            size += 2; // Field size
            size += field.data.len(); // Field data
        }
        size as u32
    }

    // Encode transaction for sending
    pub fn encode(&self) -> Vec<u8> {
        let data_size = self.calculate_data_size();
        // Both totalSize and dataSize are the length of the field data (not including header)
        let total_size = data_size;

        let mut buf = Vec::with_capacity((TRANSACTION_HEADER_SIZE as u32 + data_size) as usize);

        // Header (20 bytes)
        buf.push(self.flags);
        buf.push(self.is_reply);
        buf.extend_from_slice(&(self.transaction_type as u16).to_be_bytes());
        buf.extend_from_slice(&self.id.to_be_bytes());
        buf.extend_from_slice(&self.error_code.to_be_bytes());
        buf.extend_from_slice(&total_size.to_be_bytes());
        buf.extend_from_slice(&data_size.to_be_bytes());

        // Fields
        buf.extend_from_slice(&(self.fields.len() as u16).to_be_bytes());
        for field in &self.fields {
            buf.extend_from_slice(&field.encode());
        }

        buf
    }

    // Decode transaction from bytes
    pub fn decode(data: &[u8]) -> Result<Self, String> {
        if data.len() < TRANSACTION_HEADER_SIZE {
            return Err("Transaction data too short".to_string());
        }

        let flags = data[0];
        let is_reply = data[1];
        let transaction_type = TransactionType::from(u16::from_be_bytes([data[2], data[3]]));
        let id = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
        let error_code = u32::from_be_bytes([data[8], data[9], data[10], data[11]]);
        let total_size = u32::from_be_bytes([data[12], data[13], data[14], data[15]]);
        let data_size = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);

        let mut transaction = Transaction {
            flags,
            is_reply,
            transaction_type,
            id,
            error_code,
            fields: Vec::new(),
        };

        // Decode fields
        if data_size > 0 && data.len() >= TRANSACTION_HEADER_SIZE + 2 {
            let field_data = &data[TRANSACTION_HEADER_SIZE..];
            if field_data.len() < 2 {
                return Ok(transaction);
            }

            let field_count = u16::from_be_bytes([field_data[0], field_data[1]]) as usize;
            let mut offset = 2;

            for _ in 0..field_count {
                if offset + 4 > field_data.len() {
                    break;
                }

                let field_type_raw = u16::from_be_bytes([field_data[offset], field_data[offset + 1]]);
                let field_size = u16::from_be_bytes([field_data[offset + 2], field_data[offset + 3]]) as usize;
                offset += 4;

                if offset + field_size > field_data.len() {
                    break;
                }

                let field_data_bytes = field_data[offset..offset + field_size].to_vec();
                offset += field_size;

                transaction.fields.push(TransactionField {
                    field_type: FieldType::from(field_type_raw),
                    data: field_data_bytes,
                });
            }
        }

        Ok(transaction)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::constants::{FieldType, TransactionType, TRANSACTION_HEADER_SIZE};

    // ── TransactionField ──────────────────────────────────────────

    #[test]
    fn field_from_string_roundtrip() {
        let field = TransactionField::from_string(FieldType::UserName, "hello");
        assert_eq!(field.to_string().unwrap(), "hello");
    }

    #[test]
    fn field_from_encoded_string_xor() {
        let field = TransactionField::from_encoded_string(FieldType::UserPassword, "abc");
        // Each byte XOR 0xFF
        assert_eq!(field.data, vec![0x61 ^ 0xFF, 0x62 ^ 0xFF, 0x63 ^ 0xFF]);
    }

    #[test]
    fn field_u16_roundtrip() {
        let field = TransactionField::from_u16(FieldType::UserId, 42);
        assert_eq!(field.to_u16().unwrap(), 42);
    }

    #[test]
    fn field_u16_max() {
        let field = TransactionField::from_u16(FieldType::UserId, u16::MAX);
        assert_eq!(field.to_u16().unwrap(), u16::MAX);
    }

    #[test]
    fn field_u32_roundtrip() {
        let field = TransactionField::from_u32(FieldType::FileSize, 123456);
        assert_eq!(field.to_u32().unwrap(), 123456);
    }

    #[test]
    fn field_u64_roundtrip() {
        let field = TransactionField::from_u64(FieldType::TransferSize, 9_876_543_210);
        assert_eq!(field.to_u64().unwrap(), 9_876_543_210);
    }

    #[test]
    fn field_u16_wrong_size() {
        let field = TransactionField::new(FieldType::UserId, vec![0, 0, 0]);
        assert!(field.to_u16().is_err());
    }

    #[test]
    fn field_u32_wrong_size() {
        let field = TransactionField::new(FieldType::FileSize, vec![0]);
        assert!(field.to_u32().is_err());
    }

    #[test]
    fn field_u64_wrong_size() {
        let field = TransactionField::new(FieldType::TransferSize, vec![0; 4]);
        assert!(field.to_u64().is_err());
    }

    #[test]
    fn field_encode_format() {
        let field = TransactionField::from_u16(FieldType::UserId, 1);
        let encoded = field.encode();
        // field_type (2) + field_size (2) + data (2) = 6 bytes
        assert_eq!(encoded.len(), 6);
        // First 2 bytes: field type (UserId = 103)
        assert_eq!(u16::from_be_bytes([encoded[0], encoded[1]]), 103);
        // Next 2 bytes: data length (2)
        assert_eq!(u16::from_be_bytes([encoded[2], encoded[3]]), 2);
    }

    #[test]
    fn field_from_path_encoding() {
        let path = vec!["folder".to_string(), "subfolder".to_string()];
        let field = TransactionField::from_path(FieldType::FilePath, &path);
        // First 2 bytes: count of components (2)
        assert_eq!(u16::from_be_bytes([field.data[0], field.data[1]]), 2);
    }

    #[test]
    fn field_string_with_carriage_returns() {
        let field = TransactionField::from_string(FieldType::Data, "line1\rline2\rline3");
        let result = field.to_string().unwrap();
        assert_eq!(result, "line1\nline2\nline3");
    }

    // ── Transaction ───────────────────────────────────────────────

    #[test]
    fn transaction_encode_decode_roundtrip() {
        let mut tx = Transaction::new(42, TransactionType::SendChat);
        tx.add_field(TransactionField::from_string(FieldType::Data, "Hello!"));
        tx.add_field(TransactionField::from_u16(FieldType::UserId, 7));

        let encoded = tx.encode();
        let decoded = Transaction::decode(&encoded).unwrap();

        assert_eq!(decoded.id, 42);
        assert_eq!(decoded.transaction_type, TransactionType::SendChat);
        assert_eq!(decoded.fields.len(), 2);
        assert_eq!(decoded.fields[0].to_string().unwrap(), "Hello!");
        assert_eq!(decoded.fields[1].to_u16().unwrap(), 7);
    }

    #[test]
    fn transaction_empty_fields() {
        let tx = Transaction::new(1, TransactionType::Login);
        let encoded = tx.encode();
        let decoded = Transaction::decode(&encoded).unwrap();

        assert_eq!(decoded.id, 1);
        assert_eq!(decoded.transaction_type, TransactionType::Login);
        assert!(decoded.fields.is_empty());
    }

    #[test]
    fn transaction_header_size() {
        let tx = Transaction::new(1, TransactionType::Reply);
        let encoded = tx.encode();
        // Header (20) + field count (2) = 22 bytes minimum
        assert!(encoded.len() >= TRANSACTION_HEADER_SIZE);
    }

    #[test]
    fn transaction_flags_and_error_code() {
        let mut tx = Transaction::new(99, TransactionType::Error);
        tx.flags = 1;
        tx.is_reply = 1;
        tx.error_code = 500;

        let encoded = tx.encode();
        let decoded = Transaction::decode(&encoded).unwrap();

        assert_eq!(decoded.flags, 1);
        assert_eq!(decoded.is_reply, 1);
        assert_eq!(decoded.error_code, 500);
    }

    #[test]
    fn transaction_decode_too_short() {
        let data = vec![0u8; 10]; // Less than TRANSACTION_HEADER_SIZE
        assert!(Transaction::decode(&data).is_err());
    }

    #[test]
    fn transaction_get_field() {
        let mut tx = Transaction::new(1, TransactionType::SendChat);
        tx.add_field(TransactionField::from_string(FieldType::Data, "msg"));
        tx.add_field(TransactionField::from_u16(FieldType::ChatId, 5));

        assert!(tx.get_field(FieldType::Data).is_some());
        assert!(tx.get_field(FieldType::ChatId).is_some());
        assert!(tx.get_field(FieldType::UserName).is_none());
    }
}
