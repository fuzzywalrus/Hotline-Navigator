// Hotline protocol constants
// Error code reference: https://hlwiki.com/index.php/HL_ErrorCodes

/// Hotline protocol error codes.
/// Servers may also send arbitrary error codes; these are the well-known ones.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum HotlineErrorCode {
    // General
    None = 0,
    Generic = -1,
    NotConnected = 1,
    Socket = 2,
    // Login & Access (1000-1004)
    LoginFailed = 1000,
    AlreadyLoggedIn = 1001,
    AccessDenied = 1002,
    UserBanned = 1003,
    ServerFull = 1004,
    // File & Transfer (2000-2003)
    FileNotFound = 2000,
    FileInUse = 2001,
    DiskFull = 2002,
    TransferFailed = 2003,
    // News & Messaging (3000-3001)
    NewsFull = 3000,
    MsgRefused = 3001,
}

impl HotlineErrorCode {
    /// Try to match a raw error code to a known variant.
    pub fn from_code(code: u32) -> Option<Self> {
        // error_code is u32 in the transaction header but some codes are negative in the spec
        match code as i32 {
            0 => Some(Self::None),
            -1 => Some(Self::Generic),
            1 => Some(Self::NotConnected),
            2 => Some(Self::Socket),
            1000 => Some(Self::LoginFailed),
            1001 => Some(Self::AlreadyLoggedIn),
            1002 => Some(Self::AccessDenied),
            1003 => Some(Self::UserBanned),
            1004 => Some(Self::ServerFull),
            2000 => Some(Self::FileNotFound),
            2001 => Some(Self::FileInUse),
            2002 => Some(Self::DiskFull),
            2003 => Some(Self::TransferFailed),
            3000 => Some(Self::NewsFull),
            3001 => Some(Self::MsgRefused),
            _ => None,
        }
    }

    /// Human-readable fallback message for when the server doesn't send ErrorText.
    pub fn default_message(&self) -> &'static str {
        match self {
            Self::None => "No error",
            Self::Generic => "A non-specific error occurred",
            Self::NotConnected => "The connection is no longer active",
            Self::Socket => "A network socket error occurred",
            Self::LoginFailed => "Invalid login credentials",
            Self::AlreadyLoggedIn => "Already logged in to this server",
            Self::AccessDenied => "Access denied — you lack the required permissions",
            Self::UserBanned => "Banned from this server",
            Self::ServerFull => "Server is full",
            Self::FileNotFound => "File or folder not found",
            Self::FileInUse => "File is in use by another process",
            Self::DiskFull => "Server disk is full",
            Self::TransferFailed => "File transfer failed",
            Self::NewsFull => "News database is full",
            Self::MsgRefused => "Recipient has refused private messages",
        }
    }
}

/// Resolve a transaction error code to a human-readable message.
/// Prefers the server-provided ErrorText; falls back to known error code descriptions.
pub fn resolve_error_message(error_code: u32, server_error_text: Option<String>) -> String {
    if let Some(text) = server_error_text {
        if !text.is_empty() {
            return text;
        }
    }
    match HotlineErrorCode::from_code(error_code) {
        Some(known) => known.default_message().to_string(),
        None => format!("Unknown error (code {})", error_code),
    }
}

// Protocol identifiers
pub const PROTOCOL_ID: &[u8; 4] = b"TRTP";
pub const SUBPROTOCOL_ID: &[u8; 4] = b"HOTL";
pub const FILE_TRANSFER_ID: &[u8; 4] = b"HTXF";
pub const PROTOCOL_VERSION: u16 = 0x0001;
pub const PROTOCOL_SUBVERSION: u16 = 0x0002;

// Transaction header size
pub const TRANSACTION_HEADER_SIZE: usize = 20;

/// Maximum allowed transaction body size (10 MB).
/// Hotline protocol transactions (chat, user lists, news, file listings) are
/// never legitimately this large. File data uses separate HTXF transfers.
pub const MAX_TRANSACTION_BODY_SIZE: u32 = 10 * 1024 * 1024;

// Default ports
pub const DEFAULT_SERVER_PORT: u16 = 5500;
pub const DEFAULT_TLS_PORT: u16 = 5600;
pub const DEFAULT_TRACKER_PORT: u16 = 5498;

// Capability flags (DATA_CAPABILITIES bitmask)
pub const CAPABILITY_LARGE_FILES: u16 = 0x0001;

// HTXF transfer flags
pub const HTXF_FLAG_LARGE_FILE: u32 = 0x00000001;
pub const HTXF_FLAG_SIZE64: u32 = 0x00000002;

// Transaction types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum TransactionType {
    Reply = 0,
    Error = 100,
    GetMessageBoard = 101,
    NewMessage = 102,
    OldPostNews = 103,
    ServerMessage = 104,
    SendChat = 105,
    ChatMessage = 106,
    Login = 107,
    SendInstantMessage = 108,
    ShowAgreement = 109,
    DisconnectUser = 110,
    DisconnectMessage = 111,
    InviteToNewChat = 112,
    InviteToChat = 113,
    RejectChatInvite = 114,
    JoinChat = 115,
    LeaveChat = 116,
    NotifyChatOfUserChange = 117,
    NotifyChatOfUserDelete = 118,
    NotifyChatSubject = 119,
    SetChatSubject = 120,
    Agreed = 121,
    ServerBanner = 122,
    GetFileNameList = 200,
    DownloadFile = 202,
    UploadFile = 203,
    DeleteFile = 204,
    NewFolder = 205,
    GetFileInfo = 206,
    SetFileInfo = 207,
    MoveFile = 208,
    MakeFileAlias = 209,
    DownloadFolder = 210,
    DownloadInfo = 211,
    DownloadBanner = 212,
    UploadFolder = 213,
    GetUserNameList = 300,
    NotifyUserChange = 301,
    NotifyUserDelete = 302,
    GetClientInfoText = 303,
    SetClientUserInfo = 304,
    NewUser = 350,
    DeleteUser = 351,
    GetUser = 352,
    SetUser = 353,
    UserAccess = 354,
    UserBroadcast = 355,
    GetNewsCategoryList = 370,
    GetNewsArticleList = 371,
    DeleteNewsItem = 380,
    NewNewsFolder = 381,
    NewNewsCategory = 382,
    GetNewsArticleData = 400,
    PostNewsArticle = 410,
    DeleteNewsArticle = 411,
    Unknown = 0xFFFF,
}

impl From<u16> for TransactionType {
    fn from(value: u16) -> Self {
        match value {
            0 => Self::Reply,
            100 => Self::Error,
            101 => Self::GetMessageBoard,
            102 => Self::NewMessage,
            103 => Self::OldPostNews,
            104 => Self::ServerMessage,
            105 => Self::SendChat,
            106 => Self::ChatMessage,
            107 => Self::Login,
            108 => Self::SendInstantMessage,
            109 => Self::ShowAgreement,
            110 => Self::DisconnectUser,
            111 => Self::DisconnectMessage,
            112 => Self::InviteToNewChat,
            113 => Self::InviteToChat,
            114 => Self::RejectChatInvite,
            115 => Self::JoinChat,
            116 => Self::LeaveChat,
            117 => Self::NotifyChatOfUserChange,
            118 => Self::NotifyChatOfUserDelete,
            119 => Self::NotifyChatSubject,
            120 => Self::SetChatSubject,
            121 => Self::Agreed,
            122 => Self::ServerBanner,
            200 => Self::GetFileNameList,
            202 => Self::DownloadFile,
            203 => Self::UploadFile,
            204 => Self::DeleteFile,
            205 => Self::NewFolder,
            206 => Self::GetFileInfo,
            207 => Self::SetFileInfo,
            208 => Self::MoveFile,
            209 => Self::MakeFileAlias,
            210 => Self::DownloadFolder,
            211 => Self::DownloadInfo,
            212 => Self::DownloadBanner,
            213 => Self::UploadFolder,
            300 => Self::GetUserNameList,
            301 => Self::NotifyUserChange,
            302 => Self::NotifyUserDelete,
            303 => Self::GetClientInfoText,
            304 => Self::SetClientUserInfo,
            350 => Self::NewUser,
            351 => Self::DeleteUser,
            352 => Self::GetUser,
            353 => Self::SetUser,
            354 => Self::UserAccess,
            355 => Self::UserBroadcast,
            370 => Self::GetNewsCategoryList,
            371 => Self::GetNewsArticleList,
            380 => Self::DeleteNewsItem,
            381 => Self::NewNewsFolder,
            382 => Self::NewNewsCategory,
            400 => Self::GetNewsArticleData,
            410 => Self::PostNewsArticle,
            411 => Self::DeleteNewsArticle,
            _ => Self::Unknown,
        }
    }
}

// Field types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum FieldType {
    ErrorText = 100,
    Data = 101,
    UserName = 102,
    UserId = 103,
    UserIconId = 104,
    UserLogin = 105,
    UserPassword = 106,
    ReferenceNumber = 107,
    TransferSize = 108,
    ChatOptions = 109,
    UserAccess = 110,
    UserAlias = 111,
    UserFlags = 112,
    Options = 113,
    ChatId = 114,
    ChatSubject = 115,
    WaitingCount = 116,
    ServerAgreement = 150,
    ServerBanner = 151,
    ServerBannerType = 152,
    ServerBannerUrl = 153,
    NoServerAgreement = 154,
    VersionNumber = 160,
    CommunityBannerId = 161,
    ServerName = 162,
    FileNameWithInfo = 200,
    FileName = 201,
    FilePath = 202,
    FileTransferOptions = 204,
    FileTypeString = 205,
    FileCreatorString = 206,
    FileSize = 207,
    FileCreateDate = 208,
    FileModifyDate = 209,
    FileComment = 210,
    FileNewName = 211,
    FileType = 213,
    QuotingMessage = 214,
    AutomaticResponse = 215,
    FolderItemCount = 220,
    UserNameWithInfo = 300,
    NewsCategoryGuid = 319,
    NewsCategoryListData = 320,
    NewsArticleListData = 321,
    NewsCategoryName = 322,
    NewsCategoryListData15 = 323,
    NewsPath = 325,
    NewsArticleId = 326,
    NewsArticleDataFlavor = 327,
    NewsArticleTitle = 328,
    NewsArticlePoster = 329,
    NewsArticleDate = 330,
    NewsArticlePrevious = 331,
    NewsArticleNext = 332,
    NewsArticleData = 333,
    NewsArticleFlags = 334,
    NewsArticleParentArticle = 335,
    NewsArticleFirstChildArticle = 336,
    NewsArticleRecursiveDelete = 337,
    // Large file extension fields
    Capabilities = 496,       // 0x01F0
    FileSize64 = 497,         // 0x01F1
    Offset64 = 498,           // 0x01F2
    TransferSize64 = 499,     // 0x01F3
    FolderItemCount64 = 500,  // 0x01F4
    // HOPE (Hotline One-time Password Extension) fields
    HopeAppId = 3585,              // 0x0E01
    HopeAppString = 3586,          // 0x0E02
    HopeSessionKey = 3587,         // 0x0E03
    HopeMacAlgorithm = 3588,       // 0x0E04
    HopeServerCipher = 3777,       // 0x0EC1
    HopeClientCipher = 3778,       // 0x0EC2
    HopeServerCipherMode = 3779,   // 0x0EC3
    HopeClientCipherMode = 3780,   // 0x0EC4
    HopeServerIV = 3781,           // 0x0EC5
    HopeClientIV = 3782,           // 0x0EC6
    HopeServerChecksum = 3783,     // 0x0EC7
    HopeClientChecksum = 3784,     // 0x0EC8
    HopeServerCompression = 3785,  // 0x0EC9
    HopeClientCompression = 3786,  // 0x0ECA
}

impl From<u16> for FieldType {
    fn from(value: u16) -> Self {
        match value {
            100 => Self::ErrorText,
            101 => Self::Data,
            102 => Self::UserName,
            103 => Self::UserId,
            104 => Self::UserIconId,
            105 => Self::UserLogin,
            106 => Self::UserPassword,
            107 => Self::ReferenceNumber,
            108 => Self::TransferSize,
            109 => Self::ChatOptions,
            110 => Self::UserAccess,
            111 => Self::UserAlias,
            112 => Self::UserFlags,
            113 => Self::Options,
            114 => Self::ChatId,
            115 => Self::ChatSubject,
            116 => Self::WaitingCount,
            150 => Self::ServerAgreement,
            151 => Self::ServerBanner,
            152 => Self::ServerBannerType,
            153 => Self::ServerBannerUrl,
            154 => Self::NoServerAgreement,
            160 => Self::VersionNumber,
            161 => Self::CommunityBannerId,
            162 => Self::ServerName,
            200 => Self::FileNameWithInfo,
            201 => Self::FileName,
            202 => Self::FilePath,
            204 => Self::FileTransferOptions,
            205 => Self::FileTypeString,
            206 => Self::FileCreatorString,
            207 => Self::FileSize,
            208 => Self::FileCreateDate,
            209 => Self::FileModifyDate,
            210 => Self::FileComment,
            211 => Self::FileNewName,
            213 => Self::FileType,
            214 => Self::QuotingMessage,
            215 => Self::AutomaticResponse,
            220 => Self::FolderItemCount,
            300 => Self::UserNameWithInfo,
            319 => Self::NewsCategoryGuid,
            320 => Self::NewsCategoryListData,
            321 => Self::NewsArticleListData,
            322 => Self::NewsCategoryName,
            323 => Self::NewsCategoryListData15,
            325 => Self::NewsPath,
            326 => Self::NewsArticleId,
            327 => Self::NewsArticleDataFlavor,
            328 => Self::NewsArticleTitle,
            329 => Self::NewsArticlePoster,
            330 => Self::NewsArticleDate,
            331 => Self::NewsArticlePrevious,
            332 => Self::NewsArticleNext,
            333 => Self::NewsArticleData,
            334 => Self::NewsArticleFlags,
            335 => Self::NewsArticleParentArticle,
            336 => Self::NewsArticleFirstChildArticle,
            337 => Self::NewsArticleRecursiveDelete,
            496 => Self::Capabilities,
            497 => Self::FileSize64,
            498 => Self::Offset64,
            499 => Self::TransferSize64,
            500 => Self::FolderItemCount64,
            3585 => Self::HopeAppId,
            3586 => Self::HopeAppString,
            3587 => Self::HopeSessionKey,
            3588 => Self::HopeMacAlgorithm,
            3777 => Self::HopeServerCipher,
            3778 => Self::HopeClientCipher,
            3779 => Self::HopeServerCipherMode,
            3780 => Self::HopeClientCipherMode,
            3781 => Self::HopeServerIV,
            3782 => Self::HopeClientIV,
            3783 => Self::HopeServerChecksum,
            3784 => Self::HopeClientChecksum,
            3785 => Self::HopeServerCompression,
            3786 => Self::HopeClientCompression,
            _ => Self::ErrorText, // Default fallback
        }
    }
}
