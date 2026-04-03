## Purpose

Defines user list display, user info retrieval, admin actions, and access privilege enforcement via the 64-bit permission bitmap.

## Requirements

### Requirement: Display Connected Users

The client SHALL display all connected users in a user list. Each user entry SHALL show the user's icon (by iconId), display name, and visual indicators for admin and idle status. The user list is populated from GetUserNameList (300) on connection and updated in real time via user-joined, user-left, and user-changed events.

#### Scenario: User list populated on connect

- **WHEN** the client connects and accepts the server agreement
- **THEN** a GetUserNameList transaction is sent
- **THEN** the returned UserNameWithInfo fields are parsed into the user list, each with userId, userName, iconId, flags, isAdmin, isIdle, and optional color

#### Scenario: User list updated on user change

- **WHEN** a user-changed event is received for an existing userId
- **THEN** that user's entry in the list is updated with the new userName, iconId, flags, and derived isAdmin/isIdle status


### Requirement: Admin User Badge

Admin users SHALL be visually distinguished in the user list. The isAdmin flag is derived from the user's flags field. Admin users' names in chat SHALL be displayed in red. The specific flag bit that indicates admin status is parsed by the parseUserFlags function.

#### Scenario: Admin user displayed with indicator

- **WHEN** a user's flags indicate admin status
- **THEN** the user is displayed with isAdmin = true
- **THEN** their name in chat messages is rendered in red (dark mode: red-400)

#### Scenario: Non-admin user displayed normally

- **WHEN** a user's flags do not indicate admin status
- **THEN** the user is displayed with isAdmin = false
- **THEN** their name in chat messages is rendered in blue (dark mode: blue-400)


### Requirement: Idle User Display

Idle users SHALL be visually distinguished in the user list with a grayed-out appearance. The isIdle flag is derived from the user's flags field via the parseUserFlags function.

#### Scenario: Idle user shown grayed out

- **WHEN** a user's flags indicate idle status
- **THEN** the user is displayed with isIdle = true and a grayed-out visual style

#### Scenario: User becomes active

- **WHEN** a user-changed event is received and the flags no longer indicate idle status
- **THEN** the user's isIdle flag is set to false and the grayed-out styling is removed


### Requirement: Custom User Nick Colors

The client SHALL support custom nickname colors transmitted as an optional 4-byte field (0x00RRGGBB format) appended to the UserNameWithInfo data. A value of 0xFFFFFFFF means "no color" and is treated as None. When a valid color is present, it SHALL be used to style the user's name display.

#### Scenario: User has custom nick color

- **WHEN** a UserNameWithInfo field includes trailing color bytes that are not 0xFFFFFFFF
- **THEN** the user's color property is set to the parsed hex value and used for name rendering

#### Scenario: User has no custom nick color

- **WHEN** a UserNameWithInfo field has no trailing color bytes or the value is 0xFFFFFFFF
- **THEN** the user's color property is None and the default color scheme is used


### Requirement: Click User to Open Private Message Dialog

The client SHALL open a private message dialog when the user clicks on a user entry in the user list, provided that private messaging is enabled in preferences. If private messaging is disabled, no message dialog is opened.

#### Scenario: Click user with messaging enabled

- **WHEN** the user clicks a user entry in the user list and enablePrivateMessaging is true
- **THEN** a private message dialog opens for the selected user
- **THEN** the unread count for that user is reset to 0

#### Scenario: Click user with messaging disabled

- **WHEN** the user clicks a user entry in the user list and enablePrivateMessaging is false
- **THEN** no private message dialog is opened


### Requirement: Right-Click Context Menu

The client SHALL display a context menu when the user right-clicks on a user entry in the user list. The context menu SHALL provide actions relevant to the selected user, gated by the current user's permissions.

#### Scenario: Right-click shows context menu

- **WHEN** the user right-clicks on a user entry in the user list
- **THEN** a context menu is displayed with available actions for that user


### Requirement: Get User Info

The client SHALL retrieve detailed information about a user by sending TransactionType::GetClientInfoText (303) with the target UserId. The server responds with a text block containing the user's details (icon, username, user ID, admin/idle status, client software info). The client SHALL wait up to 10 seconds for the reply.

#### Scenario: User info requested successfully

- **WHEN** the user requests info for a specific user
- **THEN** the client sends a GetClientInfoText transaction with the target UserId
- **THEN** on receiving the reply, the info text from the Data field is displayed to the user

#### Scenario: User info request times out

- **WHEN** the server does not respond to GetClientInfoText within 10 seconds
- **THEN** the client returns a "Timeout waiting for client info reply" error

#### Scenario: User info request returns error

- **WHEN** the server replies with a non-zero error code
- **THEN** the client displays the resolved error message


### Requirement: Update Own Username and Icon

The client SHALL allow the user to update their display username and icon via TransactionType::SetClientUserInfo. The transaction includes UserName, UserIconId, and Options (set to 0) fields. After sending, the client SHALL update its local username and user_icon_id state. Changes are broadcast by the server to all connected users.

#### Scenario: User updates username and icon

- **WHEN** the user changes their username or icon in settings
- **THEN** the client sends a SetClientUserInfo transaction with the new UserName and UserIconId
- **THEN** the local username and user_icon_id state are updated to reflect the new values


### Requirement: Admin Disconnect User

An admin user SHALL be able to disconnect another user from the server by sending TransactionType::DisconnectUser (110) with the target UserId. An optional Options field may specify disconnect behavior (e.g., ban).

#### Scenario: Admin disconnects a user

- **WHEN** an admin user initiates a disconnect for a target user
- **THEN** the client sends a DisconnectUser transaction with the target UserId
- **THEN** the target user is removed from the server

#### Scenario: Admin disconnects user with options

- **WHEN** an admin user disconnects a user with additional options (e.g., temporary ban)
- **THEN** the DisconnectUser transaction includes the Options field with the specified value


### Requirement: Admin Broadcast Message

An admin user SHALL be able to broadcast a message to all connected users using TransactionType::UserBroadcast (355). The message is sent in the Data field. The broadcast button is only visible when the user has the canBroadcast permission.

#### Scenario: Admin sends broadcast

- **WHEN** the user has canBroadcast permission and submits a broadcast message
- **THEN** the client sends a UserBroadcast transaction with the message in the Data field
- **THEN** the broadcast input is cleared and broadcast mode is deactivated

#### Scenario: Non-admin cannot broadcast

- **WHEN** the user does not have canBroadcast permission
- **THEN** the broadcast button is not visible in the chat interface


### Requirement: Access Privileges Bitmap

The server SHALL assign the client an access privileges bitmap (FieldType::UserAccess) as an 8-byte (64-bit) value during login. The bitmap is included in the login reply. Bits are indexed from the most significant bit (MSB = bit 0), so bit `N` is tested as `(access >> (63 - N)) & 1`. The client stores this value and currently uses selected bits to gate some UI operations such as Disconnect User and Broadcast.

Key permission bits:
- Bit 0: Can Delete Files
- Bit 1: Can Upload Files
- Bit 2: Can Download Files
- Bit 3: Can Rename Files
- Bit 4: Can Move Files
- Bit 5: Can Create Folders
- Bit 6: Can Delete Folders
- Bit 7: Can Rename Folders
- Bit 8: Can Move Folders
- Bit 9: Can Read Chat
- Bit 10: Can Send Chat
- Bit 11: Can Initiate Private Chat
- Bit 12: Close Chat (documented, not implemented in official clients)
- Bit 13: Show in List (documented, not implemented in official clients)
- Bit 14: Can Create Users
- Bit 15: Can Delete Users
- Bit 16: Can Read Users
- Bit 17: Can Modify Users
- Bit 18: Change Own Password (documented, not implemented in official clients)
- Bit 19: Send Private Message (documented, not implemented in official clients)
- Bit 20: Can Read News
- Bit 21: Can Post News
- Bit 22: Can Disconnect Users
- Bit 23: Cannot Be Disconnected
- Bit 24: Can Get User Info
- Bit 25: Can Upload Anywhere
- Bit 26: Can Use Any Name
- Bit 27: Don't Show Agreement
- Bit 28: Can Comment Files
- Bit 29: Can Comment Folders
- Bit 30: Can View Drop Boxes
- Bit 31: Can Make Aliases
- Bit 32: Can Broadcast
- Bit 33: Can Delete News Articles
- Bit 34: Can Create News Categories
- Bit 35: Can Delete News Categories
- Bit 36: Can Create News Bundles
- Bit 37: Can Delete News Bundles
- Bit 38: Can Upload Folders
- Bit 39: Can Download Folders
- Bit 40: Can Send Message (instant/private messaging)

#### Scenario: Access privileges stored on login

- **WHEN** the login reply contains a UserAccess field
- **THEN** the 8-byte value is parsed as a u64 and stored in the client's user_access state
- **THEN** the access value is emitted to the frontend via the connection status event

#### Scenario: Permission checked before operation

- **WHEN** the user attempts an operation (e.g., broadcast, disconnect user)
- **THEN** the client checks the corresponding bit in the access bitmap
- **THEN** if the bit is not set, the UI element for that operation is hidden or disabled when that operation is one of the currently gated actions

#### Scenario: Access value requested after connection

- **WHEN** the frontend requests the current user's access permissions via get_user_access
- **THEN** the stored u64 access bitmap is returned
