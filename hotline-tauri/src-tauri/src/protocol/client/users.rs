// User management functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType, resolve_error_message};
use crate::protocol::transaction::{Transaction, TransactionField};
use std::time::Duration;
use tokio::sync::mpsc;

impl HotlineClient {
    pub async fn get_user_list(&self) -> Result<(), String> {
        println!("Requesting user list...");

        let transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetUserNameList);

        println!("Sending GetUserNameList transaction...");
        self.send_transaction(&transaction).await?;

        println!("GetUserNameList request sent");
        Ok(())
    }

    pub(crate) fn parse_user_info(data: &[u8]) -> Result<(u16, String, u16, u16, Option<u32>), String> {
        // UserNameWithInfo format:
        // 2 bytes: User ID
        // 2 bytes: Icon ID
        // 2 bytes: User flags
        // 2 bytes: Username length
        // N bytes: Username
        // 4 bytes: Nick color (optional, 0x00RRGGBB)

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

        // Check for optional trailing nick color (4 bytes after username)
        let color = if data.len() >= 8 + name_len + 4 {
            let c = u32::from_be_bytes([
                data[8 + name_len],
                data[8 + name_len + 1],
                data[8 + name_len + 2],
                data[8 + name_len + 3],
            ]);
            // 0xFFFFFFFF means "no color"
            if c == 0xFFFFFFFF { None } else { Some(c) }
        } else {
            None
        };

        Ok((user_id, username, icon_id, flags, color))
    }

    /// Disconnect a user from the server (admin function)
    pub async fn disconnect_user(&self, user_id: u16, options: Option<u16>) -> Result<(), String> {
        println!("Disconnecting user {} with options: {:?}", user_id, options);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::DisconnectUser);
        transaction.add_field(TransactionField::from_u16(FieldType::UserId, user_id));

        if let Some(opts) = options {
            transaction.add_field(TransactionField::from_u16(FieldType::Options, opts));
        }

        self.send_transaction(&transaction).await?;

        println!("DisconnectUser transaction sent successfully");
        Ok(())
    }

    /// Get client info text from the server for a specific user
    pub async fn get_client_info(&self, user_id: u16) -> Result<String, String> {
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetClientInfoText);
        transaction.add_field(TransactionField::from_u16(FieldType::UserId, user_id));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(reply)) => reply,
            Ok(None) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Channel closed while waiting for client info reply".to_string());
            }
            Err(_) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Timeout waiting for client info reply".to_string());
            }
        };

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            return Err(format!("Get client info failed: {}", error_msg));
        }

        let info = reply
            .get_field(FieldType::Data)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_else(|| "No info available".to_string());

        Ok(info)
    }

    /// Get current user access permissions
    pub async fn get_user_access(&self) -> u64 {
        let access_guard = self.user_access.lock().await;
        *access_guard
    }
}
