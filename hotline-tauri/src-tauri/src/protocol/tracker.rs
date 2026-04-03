// Hotline Tracker Client
// Protocol: Connect to tracker, send HTRK magic packet, receive server listings
// Supports v1 (legacy) and v3 (TLV metadata, IPv6, UTF-8) with auto-fallback

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use crate::protocol::types::TrackerServer;

const TRACKER_MAGIC: &[u8] = b"HTRK";
const TRACKER_VERSION_V1: u16 = 0x0001;
const TRACKER_VERSION_V3: u16 = 0x0003;
const DEFAULT_TRACKER_PORT: u16 = 5498;

// v3 feature flags (2-byte bitmask in handshake)
const FEAT_IPV6: u16 = 0x0001;
const FEAT_QUERY: u16 = 0x0002;

// v3 TLV field IDs (server record metadata)
const TLV_SERVER_SOFTWARE: u16 = 0x0200;
const TLV_COUNTRY_CODE: u16 = 0x0201;
const TLV_MAX_USERS: u16 = 0x0204;
const TLV_BANNER_URL: u16 = 0x0208;
const TLV_ICON_URL: u16 = 0x0209;
const TLV_SUPPORTS_HOPE: u16 = 0x0301;
const TLV_SUPPORTS_TLS: u16 = 0x0302;
const TLV_TLS_PORT: u16 = 0x0303;
const TLV_TAGS: u16 = 0x0310;

// v3 listing request TLV field IDs
const TLV_SEARCH_TEXT: u16 = 0x1001;
const TLV_PAGE_LIMIT: u16 = 0x1011;

// v3 address type bytes
const ADDR_TYPE_IPV4: u8 = 0x04;
const ADDR_TYPE_IPV6: u8 = 0x06;
const ADDR_TYPE_HOSTNAME: u8 = 0x48;

/// A parsed TLV field from a v3 tracker response
#[derive(Debug, Clone)]
pub struct TlvField {
    pub field_id: u16,
    pub value: Vec<u8>,
}

impl TlvField {
    /// Extract a UTF-8 string value
    fn as_string(&self) -> Option<String> {
        String::from_utf8(self.value.clone()).ok()
    }

    /// Extract a u16 value (big-endian)
    fn as_u16(&self) -> Option<u16> {
        if self.value.len() >= 2 {
            Some(u16::from_be_bytes([self.value[0], self.value[1]]))
        } else {
            None
        }
    }

    /// Extract a bool value (0x00 = false, 0x01 = true)
    fn as_bool(&self) -> Option<bool> {
        self.value.first().map(|&b| b != 0)
    }
}

/// Find a TLV field by ID in a list
fn tlv_get(fields: &[TlvField], id: u16) -> Option<&TlvField> {
    fields.iter().find(|f| f.field_id == id)
}

fn tlv_get_string(fields: &[TlvField], id: u16) -> Option<String> {
    tlv_get(fields, id).and_then(|f| f.as_string())
}

fn tlv_get_u16(fields: &[TlvField], id: u16) -> Option<u16> {
    tlv_get(fields, id).and_then(|f| f.as_u16())
}

fn tlv_get_bool(fields: &[TlvField], id: u16) -> Option<bool> {
    tlv_get(fields, id).and_then(|f| f.as_bool())
}

/// Parse `count` TLV fields from a stream. Unknown field IDs are preserved
/// (and silently ignored by callers), ensuring forward compatibility.
async fn parse_tlv_fields(stream: &mut TcpStream, count: u16) -> Result<Vec<TlvField>, String> {
    let mut fields = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let field_id = stream.read_u16().await
            .map_err(|e| format!("Failed to read TLV field ID: {}", e))?;
        let length = stream.read_u16().await
            .map_err(|e| format!("Failed to read TLV field length: {}", e))?;
        let mut value = vec![0u8; length as usize];
        if length > 0 {
            stream.read_exact(&mut value).await
                .map_err(|e| format!("Failed to read TLV field value: {}", e))?;
        }
        fields.push(TlvField { field_id, value });
    }
    Ok(fields)
}

/// Parse TLV fields from a byte slice (for unit tests / non-async contexts)
pub fn parse_tlv_fields_from_bytes(data: &[u8], count: u16) -> Result<Vec<TlvField>, String> {
    let mut fields = Vec::with_capacity(count as usize);
    let mut offset = 0;
    for _ in 0..count {
        if offset + 4 > data.len() {
            return Err("TLV data too short for header".to_string());
        }
        let field_id = u16::from_be_bytes([data[offset], data[offset + 1]]);
        let length = u16::from_be_bytes([data[offset + 2], data[offset + 3]]) as usize;
        offset += 4;
        if offset + length > data.len() {
            return Err("TLV data too short for value".to_string());
        }
        let value = data[offset..offset + length].to_vec();
        offset += length;
        fields.push(TlvField { field_id, value });
    }
    Ok(fields)
}

/// Check if a name is a separator entry (all dashes, length > 3)
fn is_separator_name(name: &str) -> bool {
    name.len() > 3 && name.chars().all(|c| c == '-')
}

pub struct TrackerClient;

impl TrackerClient {
    /// Fetch server list from a tracker.
    ///
    /// Attempts a v3 handshake first (8 bytes: HTRK + 0x0003 + feature flags).
    /// If the tracker responds with v1 or v2, falls back to v1 batch parsing.
    /// If the tracker rejects the v3 version (connection closed), reconnects
    /// and retries with a v1 handshake.
    pub async fn fetch_servers(address: &str, port: Option<u16>, search: Option<String>) -> Result<Vec<TrackerServer>, String> {
        let tracker_port = port.unwrap_or(DEFAULT_TRACKER_PORT);
        let addr = crate::protocol::socket_addr_string(address, tracker_port);

        println!("TrackerClient: Connecting to tracker {}:{}", address, tracker_port);

        // Try v3 handshake first
        match Self::try_fetch_v3(&addr, search.as_deref()).await {
            Ok(servers) => {
                println!("TrackerClient: Completed - {} servers", servers.len());
                Ok(servers)
            }
            Err(e) => {
                // If v3 failed, it might be because the tracker rejected version 3.
                // Reconnect and try v1.
                println!("TrackerClient: v3 handshake failed ({}), retrying with v1", e);
                let servers = Self::try_fetch_v1(&addr).await?;
                println!("TrackerClient: Completed (v1 fallback) - {} servers", servers.len());
                Ok(servers)
            }
        }
    }

    /// Attempt a v3 handshake and listing. Returns servers or an error.
    async fn try_fetch_v3(addr: &str, search: Option<&str>) -> Result<Vec<TrackerServer>, String> {
        let mut stream = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            TcpStream::connect(addr),
        )
        .await
        .map_err(|_| "Connection to tracker timed out after 10 seconds".to_string())?
        .map_err(|e| format!("Failed to connect to tracker: {}", e))?;

        // Build feature flags
        let mut flags: u16 = FEAT_IPV6;
        if search.is_some() {
            flags |= FEAT_QUERY;
        }

        // Send 8-byte v3 handshake: HTRK + version 3 + feature flags
        let mut magic_packet = Vec::with_capacity(8);
        magic_packet.extend_from_slice(TRACKER_MAGIC);
        magic_packet.extend_from_slice(&TRACKER_VERSION_V3.to_be_bytes());
        magic_packet.extend_from_slice(&flags.to_be_bytes());

        stream.write_all(&magic_packet).await
            .map_err(|e| format!("Failed to send tracker magic packet: {}", e))?;
        stream.flush().await
            .map_err(|e| format!("Failed to flush tracker handshake: {}", e))?;

        println!("TrackerClient: Sent v3 magic packet (flags: 0x{:04X})", flags);

        // Read 6 bytes of response
        let mut magic_response = [0u8; 6];
        stream.read_exact(&mut magic_response).await
            .map_err(|e| format!("Failed to read tracker magic response: {}", e))?;

        if &magic_response[0..4] != TRACKER_MAGIC {
            return Err(format!(
                "Invalid tracker magic response: expected HTRK, got {:?}",
                String::from_utf8_lossy(&magic_response[0..4])
            ));
        }

        let version = u16::from_be_bytes([magic_response[4], magic_response[5]]);
        println!("TrackerClient: Tracker responded with version {}", version);

        if version == TRACKER_VERSION_V3 {
            // Read 2 more bytes for tracker's feature flags
            let tracker_flags = stream.read_u16().await
                .map_err(|e| format!("Failed to read tracker feature flags: {}", e))?;
            let negotiated = flags & tracker_flags;
            println!("TrackerClient: v3 session — client flags: 0x{:04X}, tracker flags: 0x{:04X}, negotiated: 0x{:04X}",
                flags, tracker_flags, negotiated);

            // Send listing request
            Self::send_listing_request(&mut stream, search, negotiated).await?;

            // Read v3 listing response with timeout
            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                Self::read_v3_listing(&mut stream),
            )
            .await
            .map_err(|_| "Tracker response timed out after 30 seconds".to_string())?
        } else {
            // Tracker is v1/v2 — fall back to batch parsing on this same connection
            println!("TrackerClient: Tracker is v{}, falling back to v1 parsing", version);
            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                Self::read_v1_server_batches(&mut stream),
            )
            .await
            .map_err(|_| "Tracker response timed out after 30 seconds".to_string())?
        }
    }

    /// Connect with a pure v1 handshake (6 bytes). Used as fallback when v3 is rejected.
    async fn try_fetch_v1(addr: &str) -> Result<Vec<TrackerServer>, String> {
        let mut stream = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            TcpStream::connect(addr),
        )
        .await
        .map_err(|_| "Connection to tracker timed out after 10 seconds".to_string())?
        .map_err(|e| format!("Failed to connect to tracker: {}", e))?;

        // Send 6-byte v1 handshake
        let mut magic_packet = Vec::with_capacity(6);
        magic_packet.extend_from_slice(TRACKER_MAGIC);
        magic_packet.extend_from_slice(&TRACKER_VERSION_V1.to_be_bytes());

        stream.write_all(&magic_packet).await
            .map_err(|e| format!("Failed to send tracker magic packet: {}", e))?;
        stream.flush().await
            .map_err(|e| format!("Failed to flush tracker handshake: {}", e))?;

        println!("TrackerClient: Sent v1 magic packet (fallback)");

        // Read 6-byte response
        let mut magic_response = [0u8; 6];
        stream.read_exact(&mut magic_response).await
            .map_err(|e| format!("Failed to read tracker magic response: {}", e))?;

        if &magic_response[0..4] != TRACKER_MAGIC {
            return Err(format!(
                "Invalid tracker magic response: expected HTRK, got {:?}",
                String::from_utf8_lossy(&magic_response[0..4])
            ));
        }

        let version = u16::from_be_bytes([magic_response[4], magic_response[5]]);
        println!("TrackerClient: v1 fallback — tracker version {}", version);

        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            Self::read_v1_server_batches(&mut stream),
        )
        .await
        .map_err(|_| "Tracker response timed out after 30 seconds".to_string())?
    }

    /// Send a v3 listing request after the handshake.
    async fn send_listing_request(stream: &mut TcpStream, search: Option<&str>, negotiated: u16) -> Result<(), String> {
        // Build TLV fields for the request
        let mut tlv_data: Vec<u8> = Vec::new();
        let mut field_count: u16 = 0;

        // Search text (only if FEAT_QUERY is negotiated)
        if let Some(text) = search {
            if negotiated & FEAT_QUERY != 0 && !text.is_empty() {
                let text_bytes = text.as_bytes();
                tlv_data.extend_from_slice(&TLV_SEARCH_TEXT.to_be_bytes());
                tlv_data.extend_from_slice(&(text_bytes.len() as u16).to_be_bytes());
                tlv_data.extend_from_slice(text_bytes);
                field_count += 1;
            }
        }

        // Default page limit to avoid unbounded responses
        if negotiated & FEAT_QUERY != 0 {
            tlv_data.extend_from_slice(&TLV_PAGE_LIMIT.to_be_bytes());
            tlv_data.extend_from_slice(&2u16.to_be_bytes()); // length = 2 bytes
            tlv_data.extend_from_slice(&500u16.to_be_bytes()); // limit = 500
            field_count += 1;
        }

        // Write request: type (u16) + field_count (u16) + TLV data
        let request_type: u16 = 0x0001; // list servers
        stream.write_all(&request_type.to_be_bytes()).await
            .map_err(|e| format!("Failed to send listing request type: {}", e))?;
        stream.write_all(&field_count.to_be_bytes()).await
            .map_err(|e| format!("Failed to send listing request field count: {}", e))?;
        if !tlv_data.is_empty() {
            stream.write_all(&tlv_data).await
                .map_err(|e| format!("Failed to send listing request TLV fields: {}", e))?;
        }
        stream.flush().await
            .map_err(|e| format!("Failed to flush listing request: {}", e))?;

        println!("TrackerClient: Sent v3 listing request ({} TLV fields)", field_count);
        Ok(())
    }

    /// Read a v3 listing response: response header + server records with TLV metadata.
    async fn read_v3_listing(stream: &mut TcpStream) -> Result<Vec<TrackerServer>, String> {
        // Response header: response_type (u16), total_size (u32), total_servers (u16), record_count (u16)
        let response_type = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 response type: {}", e))?;
        let _total_size = stream.read_u32().await
            .map_err(|e| format!("Failed to read v3 total size: {}", e))?;
        let total_servers = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 total servers: {}", e))?;
        let record_count = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 record count: {}", e))?;

        println!("TrackerClient: v3 response — type: {}, total_servers: {}, records: {}",
            response_type, total_servers, record_count);

        let mut servers = Vec::with_capacity(record_count as usize);

        for _ in 0..record_count {
            match Self::read_v3_server_record(stream).await {
                Ok(Some(server)) => servers.push(server),
                Ok(None) => {} // filtered separator
                Err(e) => return Err(e),
            }
        }

        println!("TrackerClient: v3 parsing complete — {} servers (after filtering)", servers.len());
        Ok(servers)
    }

    /// Parse a single v3 server record from the stream.
    /// Returns None if the entry is a separator (filtered out).
    async fn read_v3_server_record(stream: &mut TcpStream) -> Result<Option<TrackerServer>, String> {
        // Address type (1 byte)
        let addr_type = stream.read_u8().await
            .map_err(|e| format!("Failed to read v3 address type: {}", e))?;

        let (address, address_type_str) = match addr_type {
            ADDR_TYPE_IPV4 => {
                let mut ip = [0u8; 4];
                stream.read_exact(&mut ip).await
                    .map_err(|e| format!("Failed to read v3 IPv4 address: {}", e))?;
                (format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]), "ipv4")
            }
            ADDR_TYPE_IPV6 => {
                let mut ip = [0u8; 16];
                stream.read_exact(&mut ip).await
                    .map_err(|e| format!("Failed to read v3 IPv6 address: {}", e))?;
                let segments: Vec<String> = (0..8)
                    .map(|i| format!("{:x}", u16::from_be_bytes([ip[i * 2], ip[i * 2 + 1]])))
                    .collect();
                (segments.join(":"), "ipv6")
            }
            ADDR_TYPE_HOSTNAME => {
                let len = stream.read_u16().await
                    .map_err(|e| format!("Failed to read v3 hostname length: {}", e))? as usize;
                let mut hostname_data = vec![0u8; len];
                stream.read_exact(&mut hostname_data).await
                    .map_err(|e| format!("Failed to read v3 hostname: {}", e))?;
                let hostname = String::from_utf8(hostname_data)
                    .map_err(|e| format!("Invalid UTF-8 in v3 hostname: {}", e))?;
                (hostname, "hostname")
            }
            other => {
                return Err(format!("Unknown v3 address type: 0x{:02X}", other));
            }
        };

        // Port (u16) + User count (u16)
        let port = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 server port: {}", e))?;
        let users = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 user count: {}", e))?;

        // Name (2-byte length + UTF-8)
        let name_len = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 name length: {}", e))? as usize;
        let name = if name_len > 0 {
            let mut data = vec![0u8; name_len];
            stream.read_exact(&mut data).await
                .map_err(|e| format!("Failed to read v3 server name: {}", e))?;
            String::from_utf8(data)
                .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).to_string())
        } else {
            String::new()
        };

        // Description (2-byte length + UTF-8)
        let desc_len = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 description length: {}", e))? as usize;
        let description = if desc_len > 0 {
            let mut data = vec![0u8; desc_len];
            stream.read_exact(&mut data).await
                .map_err(|e| format!("Failed to read v3 server description: {}", e))?;
            String::from_utf8(data)
                .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).to_string())
        } else {
            String::new()
        };

        // TLV metadata
        let tlv_count = stream.read_u16().await
            .map_err(|e| format!("Failed to read v3 TLV count: {}", e))?;
        let tlv_fields = parse_tlv_fields(stream, tlv_count).await?;

        // Filter separators
        if is_separator_name(&name) {
            return Ok(None);
        }

        Ok(Some(TrackerServer {
            address,
            port,
            users,
            name: if name.is_empty() { None } else { Some(name) },
            description: if description.is_empty() { None } else { Some(description) },
            supports_tls: tlv_get_bool(&tlv_fields, TLV_SUPPORTS_TLS),
            supports_hope: tlv_get_bool(&tlv_fields, TLV_SUPPORTS_HOPE),
            tls_port: tlv_get_u16(&tlv_fields, TLV_TLS_PORT),
            server_software: tlv_get_string(&tlv_fields, TLV_SERVER_SOFTWARE),
            tags: tlv_get_string(&tlv_fields, TLV_TAGS),
            max_users: tlv_get_u16(&tlv_fields, TLV_MAX_USERS),
            country_code: tlv_get_string(&tlv_fields, TLV_COUNTRY_CODE),
            banner_url: tlv_get_string(&tlv_fields, TLV_BANNER_URL),
            icon_url: tlv_get_string(&tlv_fields, TLV_ICON_URL),
            address_type: Some(address_type_str.to_string()),
        }))
    }

    /// Read v1 server listing batches (legacy format).
    async fn read_v1_server_batches(stream: &mut TcpStream) -> Result<Vec<TrackerServer>, String> {
        let mut servers = Vec::new();
        let mut total_entries_parsed = 0;
        let mut total_expected_entries = 0;
        let mut batch_count = 0;

        loop {
            batch_count += 1;

            // Read batch header (8 bytes)
            let mut header = [0u8; 8];
            stream.read_exact(&mut header).await
                .map_err(|e| format!("Failed to read tracker batch header: {}", e))?;

            let message_type = u16::from_be_bytes([header[0], header[1]]);
            let _data_length = u16::from_be_bytes([header[2], header[3]]);
            let server_count = u16::from_be_bytes([header[4], header[5]]);
            let server_count2 = u16::from_be_bytes([header[6], header[7]]);

            if total_expected_entries == 0 {
                total_expected_entries = server_count as usize;
            }

            println!("TrackerClient: v1 batch #{} - type: {}, count1: {}, count2: {}",
                batch_count, message_type, server_count, server_count2);

            for _ in 0..server_count2 {
                // IP address (4 bytes)
                let mut ip_bytes = [0u8; 4];
                stream.read_exact(&mut ip_bytes).await
                    .map_err(|e| format!("Failed to read server IP: {}", e))?;
                let address = format!("{}.{}.{}.{}", ip_bytes[0], ip_bytes[1], ip_bytes[2], ip_bytes[3]);

                // Port (u16)
                let port = stream.read_u16().await
                    .map_err(|e| format!("Failed to read server port: {}", e))?;

                // User count (u16)
                let users = stream.read_u16().await
                    .map_err(|e| format!("Failed to read user count: {}", e))?;

                // Skip 2 unused bytes
                let mut unused = [0u8; 2];
                stream.read_exact(&mut unused).await
                    .map_err(|e| format!("Failed to skip unused bytes: {}", e))?;

                // Server name (Pascal string: 1-byte length + MacOS Roman data)
                let name_len = stream.read_u8().await
                    .map_err(|e| format!("Failed to read server name length: {}", e))? as usize;
                let name = if name_len > 0 {
                    let mut data = vec![0u8; name_len];
                    stream.read_exact(&mut data).await
                        .map_err(|e| format!("Failed to read server name: {}", e))?;
                    let (decoded, _, had_errors) = encoding_rs::MACINTOSH.decode(&data);
                    if had_errors {
                        String::from_utf8_lossy(&data).to_string()
                    } else {
                        decoded.into_owned()
                    }
                } else {
                    String::new()
                };

                // Server description (Pascal string)
                let desc_len = stream.read_u8().await
                    .map_err(|e| format!("Failed to read server description length: {}", e))? as usize;
                let description = if desc_len > 0 {
                    let mut data = vec![0u8; desc_len];
                    stream.read_exact(&mut data).await
                        .map_err(|e| format!("Failed to read server description: {}", e))?;
                    let (decoded, _, had_errors) = encoding_rs::MACINTOSH.decode(&data);
                    if had_errors {
                        String::from_utf8_lossy(&data).to_string()
                    } else {
                        decoded.into_owned()
                    }
                } else {
                    String::new()
                };

                total_entries_parsed += 1;

                if !is_separator_name(&name) {
                    servers.push(TrackerServer {
                        address,
                        port,
                        users,
                        name: if name.is_empty() { None } else { Some(name) },
                        description: if description.is_empty() { None } else { Some(description) },
                        supports_tls: None,
                        supports_hope: None,
                        tls_port: None,
                        server_software: None,
                        tags: None,
                        max_users: None,
                        country_code: None,
                        banner_url: None,
                        icon_url: None,
                        address_type: None,
                    });
                }
            }

            println!("TrackerClient: v1 batch #{}: parsed {} entries, {} servers",
                batch_count, server_count2, servers.len());

            if total_entries_parsed >= total_expected_entries {
                break;
            }

            if batch_count >= 100 {
                println!("TrackerClient: WARNING - Stopped after 100 batches");
                break;
            }
        }

        println!("TrackerClient: v1 batch loop complete - parsed {}/{} entries, {} servers",
            total_entries_parsed, total_expected_entries, servers.len());

        Ok(servers)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tlv_fields_from_bytes() {
        // Two fields: SERVER_SOFTWARE = "Janus/3.0" and SUPPORTS_TLS = true
        let mut data = Vec::new();
        // Field 1: SERVER_SOFTWARE (0x0200), length 9, "Janus/3.0"
        data.extend_from_slice(&0x0200u16.to_be_bytes());
        data.extend_from_slice(&9u16.to_be_bytes());
        data.extend_from_slice(b"Janus/3.0");
        // Field 2: SUPPORTS_TLS (0x0302), length 1, true
        data.extend_from_slice(&0x0302u16.to_be_bytes());
        data.extend_from_slice(&1u16.to_be_bytes());
        data.push(0x01);

        let fields = parse_tlv_fields_from_bytes(&data, 2).unwrap();
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].field_id, TLV_SERVER_SOFTWARE);
        assert_eq!(fields[0].as_string().unwrap(), "Janus/3.0");
        assert_eq!(fields[1].field_id, TLV_SUPPORTS_TLS);
        assert_eq!(fields[1].as_bool().unwrap(), true);
    }

    #[test]
    fn test_parse_tlv_unknown_field_ids_preserved() {
        // Unknown field ID 0xF001 with value "custom"
        let mut data = Vec::new();
        data.extend_from_slice(&0xF001u16.to_be_bytes());
        data.extend_from_slice(&6u16.to_be_bytes());
        data.extend_from_slice(b"custom");

        let fields = parse_tlv_fields_from_bytes(&data, 1).unwrap();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].field_id, 0xF001);
        // Unknown fields are parsed but tlv_get won't match known IDs
        assert!(tlv_get(&fields, TLV_SERVER_SOFTWARE).is_none());
        assert!(tlv_get(&fields, 0xF001).is_some());
    }

    #[test]
    fn test_parse_tlv_empty_block() {
        let data: Vec<u8> = Vec::new();
        let fields = parse_tlv_fields_from_bytes(&data, 0).unwrap();
        assert!(fields.is_empty());
    }

    #[test]
    fn test_tlv_type_helpers() {
        let fields = vec![
            TlvField { field_id: TLV_SUPPORTS_TLS, value: vec![0x01] },
            TlvField { field_id: TLV_SUPPORTS_HOPE, value: vec![0x00] },
            TlvField { field_id: TLV_TLS_PORT, value: vec![0x15, 0xE0] }, // 5600
            TlvField { field_id: TLV_SERVER_SOFTWARE, value: b"Mobius/0.20".to_vec() },
            TlvField { field_id: TLV_TAGS, value: b"chat,retro".to_vec() },
        ];

        assert_eq!(tlv_get_bool(&fields, TLV_SUPPORTS_TLS), Some(true));
        assert_eq!(tlv_get_bool(&fields, TLV_SUPPORTS_HOPE), Some(false));
        assert_eq!(tlv_get_u16(&fields, TLV_TLS_PORT), Some(5600));
        assert_eq!(tlv_get_string(&fields, TLV_SERVER_SOFTWARE), Some("Mobius/0.20".to_string()));
        assert_eq!(tlv_get_string(&fields, TLV_TAGS), Some("chat,retro".to_string()));
        assert_eq!(tlv_get_string(&fields, TLV_COUNTRY_CODE), None);
    }

    #[test]
    fn test_is_separator_name() {
        assert!(is_separator_name("------"));
        assert!(is_separator_name("----"));
        assert!(!is_separator_name("---")); // too short
        assert!(!is_separator_name("--")); // too short
        assert!(!is_separator_name("hello"));
        assert!(!is_separator_name("-hi-"));
    }
}
