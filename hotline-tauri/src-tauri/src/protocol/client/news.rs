// News and message board functionality for Hotline client

use super::HotlineClient;
use crate::protocol::constants::{FieldType, TransactionType, resolve_error_message};
use crate::protocol::transaction::{Transaction, TransactionField};
use crate::protocol::types::{NewsArticle, NewsCategory};
use std::time::Duration;
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

        self.send_transaction(&transaction).await?;

        // Wait for reply
        let reply = tokio::time::timeout(Duration::from_secs(10), rx.recv())
            .await
            .map_err(|_| "Timeout waiting for message board reply".to_string())?
            .ok_or("Channel closed".to_string())?;

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            return Err(format!("Get message board failed: {}", error_msg));
        }

        let raw_data = reply
            .get_field(FieldType::Data)
            .map(|f| f.data.clone())
            .unwrap_or_default();

        let posts = parse_message_board_data(&raw_data);

        println!("Received message board: {} posts", posts.len());

        Ok(posts)
    }

    pub async fn post_message_board(&self, text: String) -> Result<(), String> {
        println!("Posting to message board: {} chars", text.len());

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::OldPostNews);
        transaction.add_field(TransactionField::from_string(FieldType::Data, &text));

        self.send_transaction(&transaction).await?;

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

        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await.map_err(|e| {
            // Clean up will happen on timeout below
            format!("Failed to send request: {}", e)
        })?;

        let reply = match tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
            Ok(Some(reply)) => reply,
            Ok(None) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Channel closed while waiting for news categories reply".to_string());
            }
            Err(_) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Timeout waiting for news categories reply (server may not support news)".to_string());
            }
        };

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            if reply.error_code == 1 || error_msg.to_lowercase().contains("not supported") {
                return Err("News is not supported on this server".to_string());
            }
            return Err(format!("Get news categories failed: {}", error_msg));
        }

        let mut categories = Vec::new();
        for field in &reply.fields {
            if field.field_type == FieldType::NewsCategoryListData15 {
                if let Ok(category) = self.parse_news_category(&field.data, &path) {
                    categories.push(category);
                }
            }
        }

        println!("Received {} news categories (reply had {} fields)", categories.len(), reply.fields.len());

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

        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
            Ok(Some(reply)) => reply,
            Ok(None) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Channel closed while waiting for news articles reply".to_string());
            }
            Err(_) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Timeout waiting for news articles reply (server may not support news)".to_string());
            }
        };

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            if reply.error_code == 1 || error_msg.to_lowercase().contains("not supported") {
                return Err("News is not supported on this server".to_string());
            }
            return Err(format!("Get news articles failed: {}", error_msg));
        }

        let articles = if let Some(field) = reply.get_field(FieldType::NewsArticleListData) {
            self.parse_news_article_list(&field.data, &path)?
        } else {
            Vec::new()
        };

        println!("Received {} news articles (reply had {} fields)", articles.len(), reply.fields.len());

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
                return Err("Channel closed while waiting for news article data reply".to_string());
            }
            Err(_) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Timeout waiting for news article data reply".to_string());
            }
        };

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            return Err(format!("Get news article data failed: {}", error_msg));
        }

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
                return Err("Channel closed while waiting for post news article reply".to_string());
            }
            Err(_) => {
                let mut pending = self.pending_transactions.write().await;
                pending.remove(&transaction_id);
                return Err("Timeout waiting for post news article reply".to_string());
            }
        };

        if reply.error_code != 0 {
            let server_text = reply
                .get_field(FieldType::ErrorText)
                .and_then(|f| f.to_string().ok());
            let error_msg = resolve_error_message(reply.error_code, server_text);
            println!("Post news article error: code={}, message={}", reply.error_code, error_msg);
            return Err(format!("Post news article failed: {}", error_msg));
        }

        println!("News article posted successfully");

        Ok(())
    }

    pub async fn create_news_category(&self, path: Vec<String>, name: String) -> Result<(), String> {
        println!("Creating news category '{}' at path: {:?}", name, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::NewNewsCategory);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }
        transaction.add_field(TransactionField::from_string(FieldType::NewsCategoryName, &name));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(r)) => r,
            Ok(None) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Channel closed".to_string()); }
            Err(_) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Timeout".to_string()); }
        };

        if reply.error_code != 0 {
            let msg = resolve_error_message(reply.error_code, reply.get_field(FieldType::ErrorText).and_then(|f| f.to_string().ok()));
            return Err(format!("Create news category failed: {}", msg));
        }
        println!("News category '{}' created", name);
        Ok(())
    }

    pub async fn create_news_folder(&self, path: Vec<String>, name: String) -> Result<(), String> {
        println!("Creating news folder '{}' at path: {:?}", name, path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::NewNewsFolder);
        if !path.is_empty() {
            transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        }
        transaction.add_field(TransactionField::from_string(FieldType::FileName, &name));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(r)) => r,
            Ok(None) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Channel closed".to_string()); }
            Err(_) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Timeout".to_string()); }
        };

        if reply.error_code != 0 {
            let msg = resolve_error_message(reply.error_code, reply.get_field(FieldType::ErrorText).and_then(|f| f.to_string().ok()));
            return Err(format!("Create news folder failed: {}", msg));
        }
        println!("News folder '{}' created", name);
        Ok(())
    }

    pub async fn delete_news_item(&self, path: Vec<String>) -> Result<(), String> {
        println!("Deleting news item at path: {:?}", path);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::DeleteNewsItem);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(r)) => r,
            Ok(None) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Channel closed".to_string()); }
            Err(_) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Timeout".to_string()); }
        };

        if reply.error_code != 0 {
            let msg = resolve_error_message(reply.error_code, reply.get_field(FieldType::ErrorText).and_then(|f| f.to_string().ok()));
            return Err(format!("Delete news item failed: {}", msg));
        }
        println!("News item deleted at path: {:?}", path);
        Ok(())
    }

    pub async fn delete_news_article(&self, path: Vec<String>, article_id: u32, recursive: bool) -> Result<(), String> {
        println!("Deleting news article {} at path: {:?} (recursive: {})", article_id, path, recursive);

        let mut transaction = Transaction::new(self.next_transaction_id(), TransactionType::DeleteNewsArticle);
        transaction.add_field(TransactionField::from_path(FieldType::NewsPath, &path));
        transaction.add_field(TransactionField::from_u32(FieldType::NewsArticleId, article_id));
        transaction.add_field(TransactionField::from_u16(FieldType::NewsArticleRecursiveDelete, if recursive { 1 } else { 0 }));

        let transaction_id = transaction.id;
        let (tx, mut rx) = mpsc::channel(1);
        {
            let mut pending = self.pending_transactions.write().await;
            pending.insert(transaction_id, tx);
        }

        self.send_transaction(&transaction).await?;

        let reply = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(r)) => r,
            Ok(None) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Channel closed".to_string()); }
            Err(_) => { let mut p = self.pending_transactions.write().await; p.remove(&transaction_id); return Err("Timeout".to_string()); }
        };

        if reply.error_code != 0 {
            let msg = resolve_error_message(reply.error_code, reply.get_field(FieldType::ErrorText).and_then(|f| f.to_string().ok()));
            return Err(format!("Delete news article failed: {}", msg));
        }
        println!("News article {} deleted", article_id);
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

            // Parse date (8 bytes): 2-byte year, 2-byte ms, 4-byte seconds since midnight Jan 1 of that year
            let date_str = if offset + 8 <= data.len() {
                let year = u16::from_be_bytes([data[offset], data[offset + 1]]);
                let _ms = u16::from_be_bytes([data[offset + 2], data[offset + 3]]);
                let secs = u32::from_be_bytes([data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]]);
                if year > 0 && secs > 0 {
                    // Convert seconds-from-year-start to month/day/hour/minute
                    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
                    let days_in_months: [u32; 12] = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                    let total_days = secs / 86400;
                    let day_secs = secs % 86400;
                    let hour = day_secs / 3600;
                    let minute = (day_secs % 3600) / 60;
                    let mut remaining = total_days;
                    let mut month = 0u32;
                    for (i, &dim) in days_in_months.iter().enumerate() {
                        if remaining < dim {
                            month = i as u32 + 1;
                            break;
                        }
                        remaining -= dim;
                    }
                    if month == 0 { month = 12; }
                    let day = remaining + 1;
                    let ampm = if hour < 12 { "AM" } else { "PM" };
                    let h12 = if hour == 0 { 12 } else if hour > 12 { hour - 12 } else { hour };
                    Some(format!("{}/{}/{} {}:{:02} {}", month, day, year, h12, minute, ampm))
                } else {
                    None
                }
            } else {
                None
            };
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
                date: date_str,
                path: parent_path.to_vec(),
            });
        }

        Ok(articles)
    }
}

// --- Message board parsing helpers ---
// Boards mix UTF-8 (modern clients) and Mac Roman (old clients) posts.
// We split on divider lines in raw bytes before decoding so each post
// gets its own UTF-8 → Mac Roman fallback pass.

fn split_raw_lines(data: &[u8]) -> Vec<Vec<u8>> {
    let mut lines: Vec<Vec<u8>> = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < data.len() {
        if data[i] == 0x0D {
            lines.push(data[start..i].to_vec());
            i += 1;
            if i < data.len() && data[i] == 0x0A {
                i += 1;
            }
            start = i;
        } else if data[i] == 0x0A {
            lines.push(data[start..i].to_vec());
            i += 1;
            start = i;
        } else {
            i += 1;
        }
    }
    if start < data.len() {
        lines.push(data[start..].to_vec());
    }
    lines
}

fn classify_divider_lead(line: &[u8]) -> Option<u8> {
    const SEPS: &[u8] = &[b'_', b'-', b'=', b'~', b'*'];
    const WS: &[u8] = &[b' ', b'\t'];
    let s = line.iter().position(|b| !WS.contains(b))?;
    let e = line.iter().rposition(|b| !WS.contains(b))? + 1;
    let trimmed = &line[s..e];
    let lead = *trimmed.first()?;
    if !SEPS.contains(&lead) {
        return None;
    }
    if trimmed.len() >= 15 && trimmed.iter().all(|b| SEPS.contains(b)) {
        return Some(lead);
    }
    let lc = trimmed.iter().take_while(|b| SEPS.contains(b)).count();
    let tc = trimmed.iter().rev().take_while(|b| SEPS.contains(b)).count();
    if lc >= 5 && tc >= 5 {
        return Some(lead);
    }
    None
}

fn find_canonical_divider(lines: &[Vec<u8>]) -> Option<u8> {
    let mut counts: std::collections::HashMap<u8, usize> = std::collections::HashMap::new();
    let mut order: std::collections::HashMap<u8, usize> = std::collections::HashMap::new();
    for line in lines {
        if let Some(ch) = classify_divider_lead(line) {
            let n = order.len();
            order.entry(ch).or_insert(n);
            *counts.entry(ch).or_insert(0) += 1;
        }
    }
    counts
        .iter()
        .max_by(|a, b| {
            a.1.cmp(b.1).then_with(|| {
                order.get(b.0).unwrap_or(&usize::MAX).cmp(order.get(a.0).unwrap_or(&usize::MAX))
            })
        })
        .map(|(c, _)| *c)
}

fn decode_post_bytes(data: &[u8]) -> Option<String> {
    if data.is_empty() {
        return None;
    }
    let s = if let Ok(s) = std::str::from_utf8(data) {
        s.to_owned()
    } else {
        let (decoded, _, _) = encoding_rs::MACINTOSH.decode(data);
        decoded.into_owned()
    };
    let s = s.replace('\r', "\n");
    let trimmed = s.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

fn parse_message_board_data(data: &[u8]) -> Vec<String> {
    if data.is_empty() {
        return Vec::new();
    }
    let lines = split_raw_lines(data);
    let canonical = find_canonical_divider(&lines);
    let mut posts: Vec<String> = Vec::new();
    let mut current: Vec<u8> = Vec::new();

    for line in &lines {
        if let (Some(lead), Some(canon)) = (classify_divider_lead(line), canonical) {
            if lead == canon {
                if !current.is_empty() {
                    if let Some(post) = decode_post_bytes(&current) {
                        posts.push(post);
                    }
                    current.clear();
                }
                continue;
            }
        }
        if !current.is_empty() {
            current.push(b'\n');
        }
        current.extend_from_slice(line);
    }

    if !current.is_empty() {
        if let Some(post) = decode_post_bytes(&current) {
            posts.push(post);
        }
    }

    posts
}
