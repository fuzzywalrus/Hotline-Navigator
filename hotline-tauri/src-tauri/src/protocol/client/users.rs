// User management functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType};
use crate::protocol::transaction::{Transaction, TransactionField};
use tokio::io::AsyncWriteExt;

impl HotlineClient {
    pub async fn get_user_list(&self) -> Result<(), String> {
        println!("Requesting user list...");

        let transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetUserNameList);
        let encoded = transaction.encode();

        println!("Sending GetUserNameList transaction...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send GetUserNameList: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stream: {}", e))?;

        println!("GetUserNameList request sent");

        Ok(())
    }

    pub(crate) fn parse_user_info(data: &[u8]) -> Result<(u16, String, u16, u16), String> {
        // UserNameWithInfo format:
        // 2 bytes: User ID
        // 2 bytes: Icon ID
        // 2 bytes: User flags
        // 2 bytes: Username length
        // N bytes: Username

        if data.len() < 8 {
            return Err("UserNameWithInfo data too short".to_string());
        }

        let user_id = u16::from_be_bytes([data[0], data[1]]);
        let icon_id = u16::from_be_bytes([data[2], data[3]]);
        let flags = u16::from_be_bytes([data[4], data[5]]);
        let name_len = u16::from_be_bytes([data[6], data[7]]) as usize;

        if data.len() < 8 + name_len {
            return Err("UserNameWithInfo username data too short".to_string());
        }

        let username = String::from_utf8_lossy(&data[8..8 + name_len]).to_string();

        Ok((user_id, username, icon_id, flags))
    }

    /// Disconnect a user from the server (admin function)
    /// 
    /// - `user_id`: The ID of the user to disconnect
    /// - `options`: Optional disconnect options (1 = temporarily ban, 2 = permanently ban)
    pub async fn disconnect_user(&self, user_id: u16, options: Option<u16>) -> Result<(), String> {
        println!("Disconnecting user {} with options: {:?}", user_id, options);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::DisconnectUser);
        transaction.add_field(TransactionField::from_u16(FieldType::UserId, user_id));
        
        if let Some(opts) = options {
            transaction.add_field(TransactionField::from_u16(FieldType::Options, opts));
        }

        let encoded = transaction.encode();

        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send DisconnectUser: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        println!("DisconnectUser transaction sent successfully");

        Ok(())
    }

    /// Get current user access permissions
    pub async fn get_user_access(&self) -> u64 {
        let access_guard = self.user_access.lock().await;
        *access_guard
    }
}
