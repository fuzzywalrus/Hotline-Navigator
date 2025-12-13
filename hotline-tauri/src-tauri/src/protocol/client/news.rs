// News and message board functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType};
use crate::protocol::transaction::{Transaction, TransactionField};
use crate::protocol::types::{NewsArticle, NewsCategory};
use std::io::ErrorKind;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;

impl HotlineClient {
    pub async fn get_message_board(&self) -> Result<Vec<String>, String> {
        println!("Requesting message board");

        let transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetMessageBoard);
        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();
        let write_result = {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            write_stream.write_all(&encoded).await
        };
        if let Err(e) = &write_result {
            if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                let mut write_guard = self.write_half.lock().await;
                write_guard.take();
            }
        }
        write_result.map_err(|e| format!("Failed to send get message board request: {}", e))?;

        let flush_result = {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;
            write_stream.flush().await
        };
        if let Err(e) = &flush_result {
            if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                let mut write_guard = self.write_half.lock().await;
                write_guard.take();
            }
        }
        flush_result.map_err(|e| format!("Failed to flush: {}", e))?;

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for message board reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get message board failed: {}", error_msg));
        }

        // Get the Data field containing all posts
        let posts_data = reply
            .get_field(FieldType::Data)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_default();

        // For now, return as single string in array (Swift does this too)
        // TODO: Parse individual posts if server uses dividers
        let posts = if posts_data.is_empty() {
            Vec::new()
        } else {
            vec![posts_data]
        };

        println!("Received message board: {} posts", posts.len());

        Ok(posts)
    }

    pub async fn post_message_board(&self, text: String) -> Result<(), String> {
        println!("Posting to message board: {} chars", text.len());

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::OldPostNews);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &text));

        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            let write_result = write_stream.write_all(&encoded).await;
            drop(write_stream);
            drop(write_guard);
            if let Err(e) = &write_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            write_result.map_err(|e| format!("Failed to post message: {}", e))?;

            let flush_result = {
                let mut write_guard = self.write_half.lock().await;
                let write_stream = write_guard
                    .as_mut()
                    .ok_or("Not connected".to_string())?;
                write_stream.flush().await
            };
            if let Err(e) = &flush_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            flush_result.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        println!("Message board post sent successfully");

        Ok(())
    }

    pub async fn get_news_categories(&self, path: Vec<String>) -> Result<Vec<NewsCategory>, String> {
        println!("Requesting news categories for path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsCategoryList);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            let write_result = write_stream.write_all(&encoded).await;
            drop(write_stream);
            drop(write_guard);
            if let Err(e) = &write_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            write_result.map_err(|e| format!("Failed to send request: {}", e))?;

            let flush_result = {
                let mut write_guard = self.write_half.lock().await;
                let write_stream = write_guard
                    .as_mut()
                    .ok_or("Not connected".to_string())?;
                write_stream.flush().await
            };
            if let Err(e) = &flush_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            flush_result.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news categories reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news categories failed: {}", error_msg));
        }

        // Parse categories from NewsCategoryListData15 fields
        let mut categories = Vec::new();
        for field in &reply.fields {
            if field.field_type == FieldType::NewsCategoryListData15 {
                if let Ok(category) = self.parse_news_category(&field.data, &path) {
                    categories.push(category);
                }
            }
        }

        println!("Received {} news categories", categories.len());

        Ok(categories)
    }

    pub async fn get_news_articles(&self, path: Vec<String>) -> Result<Vec<NewsArticle>, String> {
        println!("Requesting news articles for path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsArticleList);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            let write_result = write_stream.write_all(&encoded).await;
            drop(write_stream);
            drop(write_guard);
            if let Err(e) = &write_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            write_result.map_err(|e| format!("Failed to send request: {}", e))?;

            let flush_result = {
                let mut write_guard = self.write_half.lock().await;
                let write_stream = write_guard
                    .as_mut()
                    .ok_or("Not connected".to_string())?;
                write_stream.flush().await
            };
            if let Err(e) = &flush_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            flush_result.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news articles reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news articles failed: {}", error_msg));
        }

        // Parse articles from NewsArticleListData field
        let articles = if let Some(field) = reply.get_field(FieldType::NewsArticleListData) {
            self.parse_news_article_list(&field.data, &path)?
        } else {
            Vec::new()
        };

        println!("Received {} news articles", articles.len());

        Ok(articles)
    }

    pub async fn get_news_article_data(&self, article_id: u32, path: Vec<String>) -> Result<String, String> {
        println!("Requesting news article data for ID {} at path: {:?}", article_id, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::GetNewsArticleData);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleId, article_id));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleDataFlavor, "text/plain"));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            let write_result = write_stream.write_all(&encoded).await;
            drop(write_stream);
            drop(write_guard);
            if let Err(e) = &write_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            write_result.map_err(|e| format!("Failed to send request: {}", e))?;

            let flush_result = {
                let mut write_guard = self.write_half.lock().await;
                let write_stream = write_guard
                    .as_mut()
                    .ok_or("Not connected".to_string())?;
                write_stream.flush().await
            };
            if let Err(e) = &flush_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            flush_result.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for news article data reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            return Err(format!("Get news article data failed: {}", error_msg));
        }

        // Get article content from NewsArticleData field
        let content = reply
            .get_field(FieldType::NewsArticleData)
            .and_then(|f| f.to_string().ok())
            .unwrap_or_default();

        println!("Received news article content: {} chars", content.len());

        Ok(content)
    }

    pub async fn post_news_article(&self, title: String, text: String, path: Vec<String>, parent_id: u32) -> Result<(), String> {
        println!("Posting news article '{}' to path: {:?}", title, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::PostNewsArticle);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleId, parent_id));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleTitle, &title));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleDataFlavor, "text/plain"));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleFlags, 0));
        transaction.add_field(TransactionField::from_string(FieldType::NewsArticleData, &text));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);

        // Register pending transaction
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        // Send transaction
        let encoded = transaction.encode();

        {
            let mut write_guard = self.write_half.lock().await;
            let write_stream = write_guard
                .as_mut()
                .ok_or("Not connected".to_string())?;

            let write_result = write_stream.write_all(&encoded).await;
            drop(write_stream);
            drop(write_guard);
            if let Err(e) = &write_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            write_result.map_err(|e| format!("Failed to send request: {}", e))?;

            let flush_result = {
                let mut write_guard = self.write_half.lock().await;
                let write_stream = write_guard
                    .as_mut()
                    .ok_or("Not connected".to_string())?;
                write_stream.flush().await
            };
            if let Err(e) = &flush_result {
                if e.kind() == ErrorKind::BrokenPipe || e.to_string().contains("Broken pipe") {
                    let mut write_guard = self.write_half.lock().await;
                    write_guard.take();
                }
            }
            flush_result.map_err(|e| format!("Failed to flush: {}", e))?;
        }

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for post news article reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let error_msg = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok())
                .unwrap_or_else(|| format!("Error code: {}", reply.error_code));
            println!("Post news article error: code={}, message={}", reply.error_code, error_msg);
            return Err(format!("Post news article failed: {}", error_msg));
        }

        println!("News article posted successfully");

        Ok(())
    }

    // Helper method to parse a single news category from binary data
    fn parse_news_category(&self, data: &[u8], parent_path: &[String]) -> Result<NewsCategory, String> {
        if data.len() < 4 {
            return Err("Category data too short".to_string());
        }

        let category_type = u16::from_be_bytes([data[0], data[1]]);
        let count = u16::from_be_bytes([data[2], data[3]]);

        let name = if category_type == 2 {
            // Bundle: PString at offset 4
            if data.len() < 5 {
                return Err("Bundle data too short".to_string());
            }
            let name_len = data[4] as usize;
            if data.len() < 5 + name_len {
                return Err("Bundle name too short".to_string());
            }
            String::from_utf8_lossy(&data[5..5 + name_len]).to_string()
        } else if category_type == 3 {
            // Category: PString at offset 28
            if data.len() < 29 {
                return Err("Category data too short".to_string());
            }
            let name_len = data[28] as usize;
            if data.len() < 29 + name_len {
                return Err("Category name too short".to_string());
            }
            let (decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[29..29 + name_len]);
            decoded.to_string()
        } else {
            return Err(format!("Unknown category type: {}", category_type));
        };

        let mut path = parent_path.to_vec();
        path.push(name.clone());

        Ok(NewsCategory {
            category_type,
            count,
            name,
            path,
        })
    }

    // Helper method to parse news article list from binary data
    fn parse_news_article_list(&self, data: &[u8], parent_path: &[String]) -> Result<Vec<NewsArticle>, String> {
        if data.len() < 8 {
            return Err("Article list data too short".to_string());
        }

        let mut offset = 0;

        // Read list metadata (skip for now)
        // let list_id = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
        let article_count = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
        offset += 8;

        // Skip list name and description (PStrings)
        if offset >= data.len() {
            return Ok(Vec::new());
        }
        let name_len = data[offset] as usize;
        offset += 1 + name_len;

        if offset >= data.len() {
            return Ok(Vec::new());
        }
        let desc_len = data[offset] as usize;
        offset += 1 + desc_len;

        // Parse articles
        let mut articles = Vec::new();
        for _ in 0..article_count {
            if offset + 20 > data.len() {
                break;
            }

            let article_id = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            // Skip date (8 bytes)
            offset += 8;

            let parent_id = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            let flags = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
            offset += 4;

            if offset + 3 > data.len() {
                break;
            }

            let flavor_count = u16::from_be_bytes([data[offset], data[offset + 1]]);
            offset += 2;

            let title_len = data[offset] as usize;
            offset += 1;

            if offset + title_len > data.len() {
                break;
            }
            let (title_decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[offset..offset + title_len]);
            let title = title_decoded.to_string();
            offset += title_len;

            if offset >= data.len() {
                break;
            }
            let poster_len = data[offset] as usize;
            offset += 1;

            if offset + poster_len > data.len() {
                break;
            }
            let (poster_decoded, _, _) = encoding_rs::MACINTOSH.decode(&data[offset..offset + poster_len]);
            let poster = poster_decoded.to_string();
            offset += poster_len;

            // Skip flavors
            for _ in 0..flavor_count {
                if offset >= data.len() {
                    break;
                }
                let flavor_len = data[offset] as usize;
                offset += 1;

                if offset + flavor_len + 2 > data.len() {
                    break;
                }
                offset += flavor_len;

                // Skip article size
                offset += 2;
            }

            articles.push(NewsArticle {
                id: article_id,
                parent_id,
                flags,
                title,
                poster,
                date: None,
                path: parent_path.to_vec(),
            });
        }

        Ok(articles)
    }
}
