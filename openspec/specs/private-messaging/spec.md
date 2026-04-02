## Purpose

Defines direct private messaging between users, including send/receive, unread indicators, message history, muting, and notification preferences.

## Requirements

### Requirement: Send Private Message

The client SHALL send a private message to a specific user by their user ID using TransactionType::SendInstantMessage (108). The transaction SHALL include the target UserId field, the message text in the Data field, and Options set to 1. Private messaging MUST be enabled in preferences for messages to be sent.

#### Scenario: User sends a private message

- **WHEN** the user composes a private message to a specific user and submits it
- **THEN** the client sends a SendInstantMessage transaction with the target user's ID, the message in the Data field, and Options = 1
- **THEN** the message is added to the local private message history for that user as an outgoing message with a timestamp

#### Scenario: Private messaging disabled

- **WHEN** the enablePrivateMessaging preference is false
- **THEN** the send message option is not available in the user interface

### Requirement: Receive Private Messages

The client SHALL listen for incoming private messages on the `private-message-{serverId}` event. Each received message includes a userId and message text. The client SHALL resolve the sender's display name from the current user list. A private message notification sound SHALL be played on receipt.

#### Scenario: Incoming private message received

- **WHEN** a private-message event is received with userId and message
- **THEN** the message is added to the private message history for that userId as an incoming message with a timestamp
- **THEN** a private message sound is played
- **THEN** a toast notification is shown with the title "Private message from {displayName}" and the message content

#### Scenario: Private message from unknown user

- **WHEN** a private-message event is received and the userId is not found in the current user list
- **THEN** the sender's display name falls back to "User {userId}"

#### Scenario: Private messaging disabled suppresses listening

- **WHEN** the enablePrivateMessaging preference is false
- **THEN** the client does not register a listener for private-message events and incoming private messages are ignored

### Requirement: Unread Message Count Badges

The client SHALL maintain an unread message count per user. Each incoming private message SHALL increment the unread count for its sender. The unread count SHALL be displayed as a numeric badge next to the user's name in the user list. The count SHALL be reset to zero when the user opens the private message dialog for that sender.

#### Scenario: Unread count incremented

- **WHEN** a private message is received from userId N
- **THEN** the unread count for userId N is incremented by 1
- **THEN** the badge next to the user in the user list displays the current unread count

#### Scenario: Unread count cleared on opening dialog

- **WHEN** the user clicks on a user with unread messages in the user list
- **THEN** the unread count for that user is reset to 0 and the badge is removed

### Requirement: Private Message History Within Session

The client SHALL maintain a per-user message history for the duration of the server session. Each message in the history SHALL include the message text, a boolean indicating whether it is outgoing, and a timestamp. The history is stored in a Map keyed by userId. The history is cleared when the server connection ends.

#### Scenario: Message history accumulates

- **WHEN** multiple private messages are sent to and received from the same user
- **THEN** all messages are stored in chronological order in the history for that userId
- **THEN** the message dialog displays the full conversation with outgoing and incoming messages distinguished

#### Scenario: History cleared on disconnect

- **WHEN** the server connection is closed
- **THEN** the private message history map is cleared

### Requirement: Enable/Disable Private Messaging

The client SHALL provide a preference toggle (enablePrivateMessaging) that controls whether private messaging is active. When disabled, the client SHALL NOT listen for incoming private messages, SHALL NOT show the send message option in user dialogs, and SHALL NOT display unread badges. The preference defaults to true.

#### Scenario: Private messaging toggled off

- **WHEN** the user disables enablePrivateMessaging in preferences
- **THEN** the private-message event listener is not registered
- **THEN** the "Send Message" button is hidden in user info dialogs
- **THEN** clicking a user in the user list does not open a private message dialog

#### Scenario: Private messaging toggled on

- **WHEN** the user enables enablePrivateMessaging in preferences
- **THEN** the private-message event listener is registered
- **THEN** the "Send Message" button is available in user info dialogs

### Requirement: Mute Specific Users

The client SHALL support a muted users list stored in the mutedUsers preference array. Messages from muted users in public chat SHALL have their notification sounds suppressed and mention detection skipped. Muted users can be added and removed via the preferences panel. Matching is case-insensitive by username.

#### Scenario: Muted user sends public chat message

- **WHEN** a chat message is received from a user whose name (case-insensitive) is in the mutedUsers list
- **THEN** the message is displayed in the chat but no sound is played
- **THEN** mention and watch word detection is skipped for the message

#### Scenario: User added to mute list

- **WHEN** the user adds a username to the mutedUsers list in preferences
- **THEN** subsequent messages from that user are treated as muted (no sound, no mention detection)

#### Scenario: User removed from mute list

- **WHEN** the user removes a username from the mutedUsers list
- **THEN** subsequent messages from that user are treated normally (sound plays, mention detection active)

### Requirement: Private Message Notifications

When a private message is received, the client SHALL show a toast notification with the sender's name and the message content. A dedicated private message sound SHALL be played. The notification title format is "Private message from {displayName}".

#### Scenario: Private message notification shown

- **WHEN** a private message is received and private messaging is enabled
- **THEN** a toast notification is displayed with the title "Private message from {displayName}" and the message as body text
- **THEN** a private message notification sound is played

### Requirement: Open Message Window From User List

The client SHALL allow opening a private message dialog by clicking a user in the user list. Clicking a user SHALL open either a message dialog or user info dialog depending on context. The unread count for that user SHALL be cleared when the dialog opens.

#### Scenario: Click user to open message dialog

- **WHEN** the user clicks on a user entry in the user list and private messaging is enabled
- **THEN** a message dialog opens for that user showing the conversation history
- **THEN** the unread count for that user is reset to 0

#### Scenario: Click user with private messaging disabled

- **WHEN** the user clicks on a user entry in the user list and private messaging is disabled
- **THEN** a notification informs the user that private messaging is disabled

### Requirement: Tab Unread Count for Private Messages

When the server tab is not the active tab and a private message arrives, the tab's unread count SHALL be incremented. This ensures the user is aware of new private messages even when viewing a different tab.

#### Scenario: Private message arrives on inactive tab

- **WHEN** a private message is received and the server tab is not the active tab
- **THEN** the tab's unread count is incremented by 1
