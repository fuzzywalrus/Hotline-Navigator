// Hotline protocol types
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BookmarkType {
    Server,
    Tracker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<u16>,
    #[serde(default)]
    pub auto_connect: bool,
    #[serde(default)]
    pub tls: bool,
    #[serde(default)]
    pub hope: bool,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub bookmark_type: Option<BookmarkType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackerServer {
    pub address: String,
    pub port: u16,
    pub users: u16,
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "supportsTls", skip_serializing_if = "Option::is_none")]
    pub supports_tls: Option<bool>,
    #[serde(rename = "supportsHope", skip_serializing_if = "Option::is_none")]
    pub supports_hope: Option<bool>,
    #[serde(rename = "tlsPort", skip_serializing_if = "Option::is_none")]
    pub tls_port: Option<u16>,
    #[serde(rename = "serverSoftware", skip_serializing_if = "Option::is_none")]
    pub server_software: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<String>,
    #[serde(rename = "maxUsers", skip_serializing_if = "Option::is_none")]
    pub max_users: Option<u16>,
    #[serde(rename = "countryCode", skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    #[serde(rename = "bannerUrl", skip_serializing_if = "Option::is_none")]
    pub banner_url: Option<String>,
    #[serde(rename = "iconUrl", skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(rename = "addressType", skip_serializing_if = "Option::is_none")]
    pub address_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub description: String,
    pub version: String,
    #[serde(rename = "hopeEnabled", default)]
    pub hope_enabled: bool,
    #[serde(rename = "hopeTransport", default)]
    pub hope_transport: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agreement: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub icon: u16,
    pub flags: u16,
    pub is_admin: bool,
    pub is_idle: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    LoggingIn,
    LoggedIn,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsCategory {
    #[serde(rename = "type")]
    pub category_type: u16, // 2 = bundle (folder), 3 = category
    pub count: u16,         // Number of items inside
    pub name: String,
    pub path: Vec<String>,  // Full path to this category
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsArticle {
    pub id: u32,
    pub parent_id: u32,     // 0 if root article
    pub flags: u32,
    pub title: String,
    pub poster: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    pub path: Vec<String>,  // Path to containing category
}
