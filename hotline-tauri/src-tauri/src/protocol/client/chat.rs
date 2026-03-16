// Chat functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType};
use crate::protocol::transaction::{Transaction, TransactionField};

impl HotlineClient {
    pub async fn send_chat(&self, message: String) -> Result<(), String> {
        println!("Sending chat: {}", message);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SendChat);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));
        transaction.add_field(TransactionField::from_u16(FieldType::ChatOptions, 0));

        self.send_transaction(&transaction).await?;

        println!("Chat sent successfully");
        Ok(())
    }

    pub async fn send_broadcast(&self, message: String) -> Result<(), String> {
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::UserBroadcast);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));

        self.send_transaction(&transaction).await
    }

    pub async fn send_private_message(&self, user_id: u16, message: String) -> Result<(), String> {
        println!("Sending private message to user {}: {}", user_id, message);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SendInstantMessage);
        transaction.add_field(TransactionField::from_u16(FieldType::UserId, user_id));
        transaction.add_field(TransactionField::from_u32(FieldType::Options, 1));
        transaction.add_field(TransactionField::from_string(FieldType::Data, &message));

        self.send_transaction(&transaction).await?;

        println!("Private message sent successfully");
        Ok(())
    }

    pub async fn send_set_client_user_info(&self, username: &str, icon_id: u16) -> Result<(), String> {
        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::SetClientUserInfo);
        transaction.add_field(TransactionField::from_string(FieldType::UserName, username));
        transaction.add_field(TransactionField::from_u16(FieldType::UserIconId, icon_id));
        transaction.add_field(TransactionField::from_u16(FieldType::Options, 0));

        self.send_transaction(&transaction).await?;

        // Update local state
        *self.username.lock().await = username.to_string();
        *self.user_icon_id.lock().await = icon_id;

        Ok(())
    }

    pub async fn accept_agreement(&self) -> Result<(), String> {
        use std::time::Duration;
        use tokio::sync::mpsc;

        println!("Sending agreement acceptance...");

        let username = {
            let username_guard = self.username.lock().await;
            username_guard.clone()
        };

        let user_icon_id = {
            let icon_guard = self.user_icon_id.lock().await;
            *icon_guard
        };

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::Agreed);
        transaction.add_field(TransactionField::from_string(FieldType::UserName, &username));
        transaction.add_field(TransactionField::from_u16(FieldType::UserIconId, user_icon_id));
        transaction.add_field(TransactionField::from_u16(FieldType::Options, 0));

        let transaction_id = transaction.id;

        // Create channel to receive reply (if any)
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        // Wait for reply (but handle empty replies gracefully)
        println!("Waiting for Agreed reply...");
        match tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
            Ok(Some(_reply)) => {
                println!("Agreed reply received (may be empty, that's OK)");
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
        println!("Requesting user list after agreement acceptance...");
        self.get_user_list().await?;

        Ok(())
    }
}
