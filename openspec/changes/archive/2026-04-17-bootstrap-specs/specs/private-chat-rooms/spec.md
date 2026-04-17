## ADDED Requirements

### Requirement: Create New Private Chat Room

The client SHALL create a new private chat room by sending a TransactionType::InviteToNewChat (112) transaction with the target user's ID. The server responds with a chat_id that uniquely identifies the room. The client SHALL wait up to 10 seconds for the reply. On success, the chat room is added to the local private chat rooms list.

#### Scenario: Invite user to new chat room

- **WHEN** the user initiates a private chat with another user
- **THEN** the client sends an InviteToNewChat transaction with the target UserId
- **THEN** on receiving the reply, the client extracts the ChatId field and creates a new PrivateChatRoom entry with the returned chat_id, an empty subject, and an empty message list

#### Scenario: Invite to new chat times out

- **WHEN** the server does not respond to InviteToNewChat within 10 seconds
- **THEN** the client returns a "Timeout waiting for chat invite reply" error

#### Scenario: Server returns error for new chat invite

- **WHEN** the server replies with a non-zero error code
- **THEN** the client returns the resolved error message to the user

---

### Requirement: Invite Users to Existing Chat Room

The client SHALL invite additional users to an existing private chat room using TransactionType::InviteToChat (113). The transaction SHALL include both the ChatId and the target UserId fields.

#### Scenario: Invite additional user to chat room

- **WHEN** the user invites another user to an existing private chat room
- **THEN** the client sends an InviteToChat transaction with the chat room's ChatId and the target UserId

---

### Requirement: Accept Chat Invitation

When the client receives a chat invitation via the `chat-invite-{serverId}` event, it SHALL present the invitation to the user. If the user accepts, the client SHALL send a TransactionType::JoinChat (115) transaction with the ChatId. The server replies with the chat subject and participant list. The client SHALL wait up to 10 seconds for the reply. On success, a new PrivateChatRoom is created with the subject and user list.

#### Scenario: User accepts chat invitation

- **WHEN** a chat-invite event is received with chatId, userId, and userName
- **THEN** the invitation is presented to the user (via the onChatInvite callback)
- **WHEN** the user accepts the invitation
- **THEN** the client sends a JoinChat transaction with the ChatId
- **THEN** on success, a PrivateChatRoom is created with the subject and user list from the reply

#### Scenario: Join chat returns subject and user list

- **WHEN** the JoinChat reply is received successfully
- **THEN** the client extracts the ChatSubject field as the room subject
- **THEN** the client parses UserNameWithInfo fields to build the participant list (userId, userName, iconId, flags)

---

### Requirement: Reject Chat Invitation

The client SHALL allow the user to reject a chat invitation by sending TransactionType::RejectChatInvite (114) with the ChatId.

#### Scenario: User rejects chat invitation

- **WHEN** a chat invitation is received and the user declines
- **THEN** the client sends a RejectChatInvite transaction with the ChatId
- **THEN** no chat room is created locally

---

### Requirement: Set Chat Room Subject

The client SHALL allow participants to set or edit the subject of a private chat room using TransactionType::SetChatSubject (120). The transaction SHALL include the ChatId and the new subject text in the ChatSubject field.

#### Scenario: User sets chat subject

- **WHEN** the user edits the chat room subject
- **THEN** the client sends a SetChatSubject transaction with the ChatId and the new subject string

#### Scenario: Remote subject change received

- **WHEN** a chat-subject event is received with chatId and subject
- **THEN** the local PrivateChatRoom's subject is updated to the new value

---

### Requirement: View Participant List

The client SHALL display the list of participants in each private chat room. Each participant entry SHALL show the user's icon and status flags. The participant list is updated in real time as users join and leave the room.

#### Scenario: Participant list displayed

- **WHEN** the user views a private chat room
- **THEN** the participant list shows each user with their id, name, icon, and flags

#### Scenario: Participant list updated on join

- **WHEN** a chat-user-joined event is received for the room
- **THEN** the new user is added to the room's participant list (if not already present)

#### Scenario: Participant list updated on leave

- **WHEN** a chat-user-left event is received for the room
- **THEN** the user is removed from the room's participant list

---

### Requirement: Leave Chat Room

The client SHALL allow the user to leave a private chat room by sending TransactionType::LeaveChat (116) with the ChatId.

#### Scenario: User leaves chat room

- **WHEN** the user chooses to leave a private chat room
- **THEN** the client sends a LeaveChat transaction with the ChatId

---

### Requirement: Per-Room Message History

The client SHALL maintain a separate message history for each private chat room. Messages are appended as they arrive via the `private-chat-message-{serverId}` event. Each message includes chatId, userId, userName, message text, and a locally-assigned timestamp. The history persists for the duration of the session.

#### Scenario: Message received in private chat room

- **WHEN** a private-chat-message event is received with chatId, userId, userName, and message
- **THEN** the message is appended to the corresponding PrivateChatRoom's messages array with a timestamp

#### Scenario: Send message to private chat room

- **WHEN** the user sends a message in a private chat room
- **THEN** the client sends a SendChat transaction (105) with the message in the Data field, the ChatId field set to the room's chat_id, and ChatOptions = 0

---

### Requirement: Private Chat Room Events

The client SHALL listen for the following events scoped by serverId to manage private chat room state:

- `chat-invite-{serverId}`: Invitation to join a chat room (chatId, userId, userName)
- `private-chat-message-{serverId}`: Message in a private chat room (chatId, userId, userName, message)
- `chat-user-joined-{serverId}`: User joined a chat room (chatId, userId, userName, icon, flags)
- `chat-user-left-{serverId}`: User left a chat room (chatId, userId)
- `chat-subject-{serverId}`: Chat room subject changed (chatId, subject)

#### Scenario: All event listeners registered

- **WHEN** the server connection is established and the useServerEvents hook mounts
- **THEN** listeners are registered for chat-invite, private-chat-message, chat-user-joined, chat-user-left, and chat-subject events scoped to the serverId

#### Scenario: Event listeners cleaned up on unmount

- **WHEN** the useServerEvents hook unmounts
- **THEN** all five private chat event listeners are unregistered
