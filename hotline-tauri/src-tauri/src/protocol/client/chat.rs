// Chat functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType};
use crate::protocol::transaction::{Transaction, TransactionField};
use tokio::io::AsyncWriteExt;

impl HotlineClient {
    pub async fn send_chat(&self, message: String) -> Result<(), String> {
        println!("Sending chat: {}", message);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SendChat);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));
        transaction.add_field(TransactionField::from_u16(FieldType::ChatOptions, 0)); // 0 = normal chat, 1 = announce

        let encoded = transaction.encode();
        println!("Chat transaction: {} bytes", encoded.len());

        println!("Writing chat to stream...");
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| {
                let err = format!("Failed to send chat: {}", e);
                eprintln!("{}", err);
                err
            })?;

        println!("Flushing stream...");
        // Flush the stream to ensure the message is sent immediately
        write_stream
            .flush()
            .await
            .map_err(|e| {
                let err = format!("Failed to flush stream: {}", e);
                eprintln!("{}", err);
                err
            })?;

        println!("Chat sent successfully");

        Ok(())
    }

    pub async fn send_broadcast(&self, message: String) -> Result<(), String> {
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::UserBroadcast);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));

        let encoded = transaction.encode();

        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send broadcast: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    pub async fn send_private_message(&self, user_id: u16, message: String) -> Result<(), String> {
        println!("Sending private message to user {}: {}", user_id, message);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SendInstantMessage);
        transaction.add_field(TransactionField::from_u16(FieldType::UserId, user_id));
        transaction.add_field(TransactionField::from_u32(FieldType::Options, 1)); // Options = 1 for instant messages
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));

        let encoded = transaction.encode();

        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send private message: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        println!("Private message sent successfully");

        Ok(())
    }

    pub async fn accept_agreement(&self) -> Result<(), String> {
        use std::time::Duration;
        use tokio::sync::mpsc;
        use crate::protocol::constants::TransactionType;

        println!("Sending agreement acceptance...");

        // Get current user info
        let username = {
            let username_guard = self.username.lock().await;
            username_guard.clone()
        };
        
        let user_icon_id = {
            let icon_guard = self.user_icon_id.lock().await;
            *icon_guard
        };

        // Create Agreed transaction with REQUIRED fields
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::Agreed);
        
        // REQUIRED fields for Agreed transaction (some servers like Mobius require these)
        transaction.add_field(TransactionField::from_string(
            FieldType::UserName,
            &username,
        ));
        transaction.add_field(TransactionField::from_u16(
            FieldType::UserIconId,
            user_icon_id,
        ));
        transaction.add_field(TransactionField::from_u16(
            FieldType::Options,
            0, // User options (typically 0)
        ));
        
        let encoded = transaction.encode();
        let transaction_id = transaction.id;

        // Create channel to receive reply (if any)
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction with combined write+flush
        {
        let mut write_guard = self.write_half.lock().await;
        let write_stream = write_guard
            .as_mut()
            .ok_or("Not connected".to_string())?;

        write_stream
            .write_all(&encoded)
            .await
            .map_err(|e| format!("Failed to send agreement: {}", e))?;

        write_stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply (but handle empty replies gracefully)
        // Some servers send empty replies, which is fine
        println!("Waiting for Agreed reply...");
        match tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
            Ok(Some(_reply)) => {
                println!("Agreed reply received (may be empty, that's OK)");
                // Remove from pending
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
            }
            Ok(None) => {
                println!("Agreed channel closed (empty reply, that's OK)");
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
            }
            Err(_) => {
                println!("Agreed timeout (empty reply, that's OK)");
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
            }
        }

        println!("Agreement accepted successfully");

        // CRITICAL: Call GetUserNameList immediately after Agreed
        // This must happen in the same function, not separately
        // Some servers (like Mobius) require this to complete the sign-in process
        println!("Requesting user list after agreement acceptance...");
        self.get_user_list().await?;

        Ok(())
    }
}
