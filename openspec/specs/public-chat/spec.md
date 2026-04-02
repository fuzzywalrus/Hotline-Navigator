## Purpose

Defines public chat room messaging, including sending and receiving messages, server broadcasts, user notifications, mention detection, and watch words.

## Requirements

### Requirement: Send Public Chat Message

The client SHALL send a public chat message to the connected server using TransactionType::SendChat (105). The transaction SHALL include the message text in the Data field (FieldType::Data) and ChatOptions set to 0. Messages SHALL be UTF-8 encoded.

#### Scenario: User sends a chat message

- **WHEN** the user types a message and submits the chat form
- **THEN** the client sends a SendChat transaction with the message in the Data field and ChatOptions = 0
- **THEN** the message input is cleared

#### Scenario: Empty message rejected

- **WHEN** the user attempts to send a message with only whitespace
- **THEN** the send button is disabled and no transaction is sent

#### Scenario: Message sent while agreement pending

- **WHEN** the server agreement has not been accepted
- **THEN** the message input is disabled and the placeholder text indicates the user must accept or decline the agreement

### Requirement: Receive Public Chat Messages

The client SHALL listen for incoming chat messages on the `chat-message-{serverId}` event. Each message SHALL include userId, userName, message text, and a locally-assigned timestamp. Received messages SHALL be appended to the chat message list and a chat sound SHALL be played.

#### Scenario: Incoming chat message displayed

- **WHEN** a chat-message event is received with userId, userName, and message
- **THEN** the message is appended to the chat view with the sender's name and message text
- **THEN** a chat notification sound is played

#### Scenario: Chat message from muted user

- **WHEN** a chat-message event is received from a user whose name is in the mutedUsers list (case-insensitive match)
- **THEN** the message is still appended to the message list
- **THEN** no chat sound is played
- **THEN** mention detection is skipped for this message

### Requirement: Server Broadcast Messages

Server broadcast messages SHALL be displayed with distinct styling to differentiate them from regular user messages. Broadcast messages are identified by userId = 0 and userName = "Server". They SHALL render inside a styled card with a megaphone icon and a "Server Broadcast" label. A server message sound SHALL be played on receipt.

#### Scenario: Broadcast message received

- **WHEN** a broadcast-message event is received with a message payload
- **THEN** the message is displayed in a blue-bordered card with a megaphone icon and the label "Server Broadcast"
- **THEN** a server message sound is played

#### Scenario: Admin sends broadcast

- **WHEN** the current user has broadcast permission (canBroadcast) and activates broadcast mode
- **THEN** a dedicated broadcast input is shown with a "Broadcast" send button and a "Cancel" button
- **WHEN** the user submits a broadcast message
- **THEN** a UserBroadcast transaction (355) is sent with the message in the Data field

### Requirement: User Join and Leave Notifications

The client SHALL display join and leave notifications inline in the chat stream. Join messages are triggered by user-changed events for new users; leave messages are triggered by user-left events. These notifications SHALL be styled as centered, italic, gray text distinct from regular chat messages.

#### Scenario: User joins the server

- **WHEN** a user-changed event is received for a userId not in the current user list
- **THEN** a join message "{userName} joined" is appended to the chat
- **THEN** a join sound is played (unless the user list was previously empty, to avoid sound spam during initial load)

#### Scenario: User leaves the server

- **WHEN** a user-left event is received for a userId in the current user list
- **THEN** a leave message "{userName} left" is appended to the chat
- **THEN** a leave sound is played

### Requirement: Message Timestamps

The client SHALL support an optional timestamp display on each chat message. When the showTimestamps preference is enabled, each message SHALL display the time in HH:MM format (2-digit hour and minute, locale-aware). Timestamps are toggled via the Preferences panel.

#### Scenario: Timestamps enabled

- **WHEN** the showTimestamps preference is true
- **THEN** each chat message, join/leave notification, and broadcast message displays a timestamp prefix in gray text

#### Scenario: Timestamps disabled

- **WHEN** the showTimestamps preference is false
- **THEN** no timestamp is rendered for any message

### Requirement: Mention Detection

The client SHALL detect when the current user's name is mentioned in a chat message using the @username pattern (case-insensitive, word-boundary match). Messages containing a mention SHALL be visually highlighted with a yellow background and left border. Mention detection SHALL be skipped for messages from muted users.

#### Scenario: User is mentioned in chat

- **WHEN** a chat message contains @username matching the current user's name (case-insensitive)
- **THEN** the message is displayed with a yellow highlight (background and left border)
- **THEN** the isMention flag is set to true on the message object

#### Scenario: Mention notification when tab inactive

- **WHEN** a mention is detected and the server tab is not the active tab and mentionPopup is enabled
- **THEN** a toast notification is shown with the title "From {senderName}" and message "@{username} mentioned in chat"

#### Scenario: Mention notification when tab active

- **WHEN** a mention is detected and the server tab is the active tab
- **THEN** the mention is logged to notification history but no toast popup is shown

### Requirement: Watch Words

The client SHALL support user-defined watch words that trigger the same notification behavior as mentions. Watch words are stored in the watchWords preference array. Detection uses case-insensitive whole-word matching. When a watch word is matched (and the sender is not muted), the message is flagged as a mention and a notification is generated.

#### Scenario: Watch word matched in chat

- **WHEN** a chat message contains a word matching one of the user's configured watch words (case-insensitive, whole-word boundary)
- **THEN** the message is flagged as a mention (isMention = true) and highlighted
- **THEN** if the tab is not active and mentionPopup is enabled, a toast notification with the message "Watch word matched in chat" is shown

#### Scenario: No watch words configured

- **WHEN** the watchWords preference array is empty
- **THEN** watch word detection is not performed (only @mention detection applies)

### Requirement: Auto-Scroll to Newest Messages

The chat view SHALL automatically scroll to the newest message when new messages arrive, provided the user is already scrolled to the bottom. If the user has scrolled up to read history, auto-scroll SHALL be suppressed until the user scrolls back to the bottom. The "at bottom" threshold is defined as being within 50 pixels of the scroll container's maximum scroll position.

#### Scenario: User at bottom of chat

- **WHEN** a new message arrives and the scroll position is within 50px of the bottom
- **THEN** the chat view smoothly scrolls to show the new message

#### Scenario: User scrolled up reading history

- **WHEN** a new message arrives and the scroll position is more than 50px from the bottom
- **THEN** the chat view does not auto-scroll, preserving the user's reading position

#### Scenario: Container resized while at bottom

- **WHEN** the scroll container is resized (e.g., window resize) and the user was at the bottom
- **THEN** the scroll position is re-anchored to the bottom instantly (no smooth animation)

### Requirement: System Message Formatting

System-generated messages (join, leave, broadcast) SHALL be visually distinct from user chat messages. Join and leave notifications SHALL be rendered as centered, italic, gray text. Broadcast messages SHALL be rendered in a blue-themed card with a megaphone icon. Admin users' names SHALL be displayed in red/dark-red color, while regular users' names are displayed in blue and the current user's own messages use green.

#### Scenario: Admin user message styling

- **WHEN** a chat message is received from a user with the isAdmin flag set
- **THEN** the sender's name is displayed in red (dark mode: red-400)

#### Scenario: Own message styling

- **WHEN** a chat message is displayed where the userName is "Me"
- **THEN** the sender's name is displayed in green (dark mode: green-400)

#### Scenario: Regular user message styling

- **WHEN** a chat message is from a non-admin, non-self user
- **THEN** the sender's name is displayed in blue (dark mode: blue-400)

### Requirement: Chat Message Encoding

All chat messages SHALL be encoded as UTF-8. Usernames received in UserNameWithInfo fields are decoded using `String::from_utf8_lossy` to gracefully handle non-UTF-8 bytes from legacy Hotline clients.

#### Scenario: UTF-8 message roundtrip

- **WHEN** the user sends a message containing non-ASCII characters (e.g., accented letters, emoji)
- **THEN** the message is transmitted as UTF-8 in the Data field and displayed correctly when echoed back

#### Scenario: Legacy encoding in username

- **WHEN** a username contains bytes that are not valid UTF-8
- **THEN** the username is decoded with lossy UTF-8 conversion (invalid bytes replaced with the Unicode replacement character)

### Requirement: Chat History Persistence

When the enableChatHistory preference is enabled, the client SHALL persist chat messages (including join/leave events and broadcasts) to encrypted local storage via the chatHistoryStore. Each stored message includes userId, userName, message text, ISO 8601 timestamp, and optional isMention, isAdmin, and type fields.

#### Scenario: Chat history enabled

- **WHEN** a chat message is received and enableChatHistory is true
- **THEN** the message is persisted to the chatHistoryStore with the serverId, serverName, and message details

#### Scenario: Chat history disabled

- **WHEN** a chat message is received and enableChatHistory is false
- **THEN** the message is not persisted to the chatHistoryStore

### Requirement: Tab Unread Count for Chat

When the server tab is not the active tab and a new chat message arrives from a non-muted user, the tab's unread count SHALL be incremented. The unread count is displayed as a badge on the tab. When the user switches to the tab, the unread count SHALL reset to zero.

#### Scenario: Message arrives on inactive tab

- **WHEN** a chat message arrives from a non-muted user and the server tab is not active
- **THEN** the tab's unread count is incremented by 1

#### Scenario: User switches to tab

- **WHEN** the user activates a server tab
- **THEN** the tab's unread count is reset to 0
