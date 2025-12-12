// Hotline transaction structures

use super::constants::{FieldType, TransactionType, TRANSACTION_HEADER_SIZE};
use std::io::{self, Write};

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

    pub fn to_string(&self) -> Result<String, String> {
        String::from_utf8(self.data.clone())
            .map_err(|e| format!("Failed to decode string: {}", e))
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
