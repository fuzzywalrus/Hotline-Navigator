// Hotline Tracker Client
// Protocol: Connect to tracker, send HTRK magic packet, receive server listings

use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use crate::protocol::types::TrackerServer;

const TRACKER_MAGIC: &[u8] = b"HTRK";
const TRACKER_VERSION: u16 = 0x0001;
const DEFAULT_TRACKER_PORT: u16 = 5498;

pub struct TrackerClient;

impl TrackerClient {
    /// Fetch server list from a tracker
    /// 
    /// Protocol:
    /// 1. Connect to tracker (default port 5498)
    /// 2. Send magic packet: "HTRK" (4 bytes) + version (2 bytes, 0x0001)
    /// 3. Receive magic response: "HTRK" (4 bytes) + version (2 bytes)
    /// 4. Receive batches:
    ///    - Header: message_type (u16) + data_length (u16) + server_count (u16) + server_count2 (u16)
    ///    - For each server:
    ///      - IP address: 4 bytes (individual octets)
    ///      - Port: u16 (big-endian)
    ///      - User count: u16 (big-endian)
    ///      - Unused: 2 bytes
    ///      - Server name: Pascal string (1-byte length + data, MacOS Roman encoding)
    ///      - Server description: Pascal string (1-byte length + data, MacOS Roman encoding)
    pub async fn fetch_servers(address: &str, port: Option<u16>) -> Result<Vec<TrackerServer>, String> {
        let tracker_port = port.unwrap_or(DEFAULT_TRACKER_PORT);
        let addr = crate::protocol::socket_addr_string(address, tracker_port);
        
        println!("TrackerClient: Connecting to tracker {}:{}", address, tracker_port);
        
        let mut stream = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            TcpStream::connect(&addr),
        )
        .await
        .map_err(|_| format!("Connection to tracker timed out after 10 seconds"))?
        .map_err(|e| format!("Failed to connect to tracker: {}", e))?;
        
        println!("TrackerClient: Connected to tracker");
        
        // Send magic packet: "HTRK" + version (0x0001)
        let mut magic_packet = Vec::with_capacity(6);
        magic_packet.extend_from_slice(TRACKER_MAGIC);
        magic_packet.extend_from_slice(&TRACKER_VERSION.to_be_bytes());
        
        stream
            .write_all(&magic_packet)
            .await
            .map_err(|e| format!("Failed to send tracker magic packet: {}", e))?;
        
        stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush tracker handshake: {}", e))?;
        
        println!("TrackerClient: Sent magic packet");
        
        // Receive magic response (6 bytes: "HTRK" + version)
        let mut magic_response = [0u8; 6];
        stream
            .read_exact(&mut magic_response)
            .await
            .map_err(|e| format!("Failed to read tracker magic response: {}", e))?;
        
        if &magic_response[0..4] != TRACKER_MAGIC {
            return Err(format!(
                "Invalid tracker magic response: expected HTRK, got {:?}",
                String::from_utf8_lossy(&magic_response[0..4])
            ));
        }
        
        let version = u16::from_be_bytes([magic_response[4], magic_response[5]]);
        println!("TrackerClient: Received magic response, version: {}", version);
        
        // Read server listings (may span multiple batches) with overall timeout
        let servers = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            Self::read_server_batches(&mut stream),
        )
        .await
        .map_err(|_| "Tracker response timed out after 30 seconds".to_string())??;

        println!("TrackerClient: Completed - {} servers", servers.len());

        Ok(servers)
    }

    async fn read_server_batches(stream: &mut TcpStream) -> Result<Vec<TrackerServer>, String> {
        let mut servers = Vec::new();
        let mut total_entries_parsed = 0;
        let mut total_expected_entries = 0;
        let mut batch_count = 0;

        loop {
            batch_count += 1;
            
            // Read batch header (8 bytes)
            let mut header = [0u8; 8];
            stream
                .read_exact(&mut header)
                .await
                .map_err(|e| format!("Failed to read tracker batch header: {}", e))?;
            
            let message_type = u16::from_be_bytes([header[0], header[1]]);
            let _data_length = u16::from_be_bytes([header[2], header[3]]);
            let server_count = u16::from_be_bytes([header[4], header[5]]);
            let server_count2 = u16::from_be_bytes([header[6], header[7]]);
            
            // First header tells us the total expected entries
            if total_expected_entries == 0 {
                total_expected_entries = server_count as usize;
            }
            
            println!("TrackerClient: Batch #{} - type: {}, count1: {}, count2: {}", 
                batch_count, message_type, server_count, server_count2);
            
            // Parse servers in this batch
            for _ in 0..server_count2 {
                // Read IP address (4 bytes)
                let mut ip_bytes = [0u8; 4];
                stream
                    .read_exact(&mut ip_bytes)
                    .await
                    .map_err(|e| format!("Failed to read server IP: {}", e))?;
                
                let address = format!("{}.{}.{}.{}", ip_bytes[0], ip_bytes[1], ip_bytes[2], ip_bytes[3]);
                
                // Read port (u16, big-endian)
                let mut port_bytes = [0u8; 2];
                stream
                    .read_exact(&mut port_bytes)
                    .await
                    .map_err(|e| format!("Failed to read server port: {}", e))?;
                let port = u16::from_be_bytes(port_bytes);
                
                // Read user count (u16, big-endian)
                let mut users_bytes = [0u8; 2];
                stream
                    .read_exact(&mut users_bytes)
                    .await
                    .map_err(|e| format!("Failed to read user count: {}", e))?;
                let users = u16::from_be_bytes(users_bytes);
                
                // Skip 2 unused bytes
                let mut unused = [0u8; 2];
                stream
                    .read_exact(&mut unused)
                    .await
                    .map_err(|e| format!("Failed to skip unused bytes: {}", e))?;
                
                // Read server name (Pascal string: 1 byte length + data)
                let mut name_len = [0u8; 1];
                stream
                    .read_exact(&mut name_len)
                    .await
                    .map_err(|e| format!("Failed to read server name length: {}", e))?;
                
                let name = if name_len[0] > 0 {
                    let mut name_data = vec![0u8; name_len[0] as usize];
                    stream
                        .read_exact(&mut name_data)
                        .await
                        .map_err(|e| format!("Failed to read server name: {}", e))?;
                    
                    // Decode MacOS Roman to UTF-8
                    let (decoded, _encoding, had_errors) = encoding_rs::MACINTOSH.decode(&name_data);
                    if had_errors {
                        String::from_utf8_lossy(&name_data).to_string()
                    } else {
                        decoded.into_owned()
                    }
                } else {
                    String::new()
                };
                
                // Read server description (Pascal string: 1 byte length + data)
                let mut desc_len = [0u8; 1];
                stream
                    .read_exact(&mut desc_len)
                    .await
                    .map_err(|e| format!("Failed to read server description length: {}", e))?;
                
                let description = if desc_len[0] > 0 {
                    let mut desc_data = vec![0u8; desc_len[0] as usize];
                    stream
                        .read_exact(&mut desc_data)
                        .await
                        .map_err(|e| format!("Failed to read server description: {}", e))?;
                    
                    // Decode MacOS Roman to UTF-8
                    let (decoded, _encoding, had_errors) = encoding_rs::MACINTOSH.decode(&desc_data);
                    if had_errors {
                        String::from_utf8_lossy(&desc_data).to_string()
                    } else {
                        decoded.into_owned()
                    }
                } else {
                    String::new()
                };
                
                total_entries_parsed += 1;
                
                // Filter out separator entries (names like "-------")
                let is_separator = name.chars().all(|c| c == '-') && name.len() > 3;
                
                if !is_separator {
                    servers.push(TrackerServer {
                        address,
                        port,
                        users,
                        name: if name.is_empty() { None } else { Some(name) },
                        description: if description.is_empty() { None } else { Some(description) },
                    });
                }
            }
            
            println!("TrackerClient: Batch #{}: parsed {} entries, {} servers (filtered separators)", 
                batch_count, server_count2, servers.len());
            
            // Check if we've read all expected entries
            if total_entries_parsed >= total_expected_entries {
                break;
            }
            
            // Safety: don't loop forever
            if batch_count >= 100 {
                println!("TrackerClient: WARNING - Stopped after 100 batches");
                break;
            }
        }
        
        println!("TrackerClient: Batch loop complete - parsed {}/{} entries, {} servers",
            total_entries_parsed, total_expected_entries, servers.len());

        Ok(servers)
    }
}

