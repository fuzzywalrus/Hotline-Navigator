## Purpose

Defines the server message board for reading and posting messages.

## Requirements

### Requirement: Fetch message board posts

The system SHALL retrieve all message board posts from the server using TransactionType::GetMessageBoard. The server returns a Data field containing newline-separated posts.

#### Scenario: Fetch posts from a populated board

- **WHEN** the user opens the message board view
- **THEN** the system SHALL send a GetMessageBoard transaction and display all returned posts parsed from the newline-delimited Data field

#### Scenario: Fetch posts from an empty board

- **WHEN** the user opens the message board view and the server returns an empty Data field
- **THEN** the system SHALL display an empty message board with no posts


### Requirement: Post a new message to the board

The system SHALL allow the user to submit a new message to the server message board using TransactionType::OldPostNews with the message content in the Data field.

#### Scenario: Submit a new post

- **WHEN** the user composes a message and confirms submission
- **THEN** the system SHALL send an OldPostNews transaction with the message in the Data field

#### Scenario: Post submission feedback

- **WHEN** the system sends a post transaction
- **THEN** the system SHALL provide real-time feedback indicating whether the submission succeeded or failed


### Requirement: Post format

Each message board post SHALL be a line of text. Posts are separated by newline characters in the Data field returned by the server.

#### Scenario: Parse multi-post response

- **WHEN** the server returns a Data field with multiple newline-separated entries
- **THEN** the system SHALL display each line as a separate post in chronological order


### Requirement: MarkdownText rendering in post display

The system SHALL render message board posts through the shared `MarkdownText` component. The current implementation does not gate message-board Markdown rendering on a separate preference toggle.

#### Scenario: Render a post containing Markdown syntax

- **WHEN** a post contains Markdown formatting (e.g., bold, links, lists)
- **THEN** the system SHALL render the Markdown as formatted text in the display

#### Scenario: Render a post without Markdown

- **WHEN** a post contains no Markdown syntax
- **THEN** the system SHALL display the post as plain text


### Requirement: Manual board scrolling

The message board view SHALL use the browser's normal scroll container behavior. The current implementation does not apply automatic scrolling when posts load or after a post is submitted.

#### Scenario: Initial board load

- **WHEN** the message board finishes loading posts
- **THEN** the scroll position SHALL remain under normal container/browser control

#### Scenario: Post submitted successfully

- **WHEN** the user successfully submits a new post
- **THEN** the board contents SHALL refresh without an explicit auto-scroll step


### Requirement: Access privilege enforcement

The system SHALL rely on server-side enforcement for message board privileges. The current UI attempts fetch and post operations when requested and surfaces any access-denied errors returned by the backend or server.

#### Scenario: User lacks read privilege

- **WHEN** the user does not have the privilege to read the message board
- **THEN** the system MAY still send a GetMessageBoard transaction
- **THEN** any access-denied failure returned by the backend or server SHALL be surfaced to the user

#### Scenario: User lacks post privilege

- **WHEN** the user does not have the privilege to post to the message board
- **THEN** the post submission UI remains available
- **THEN** any access-denied failure returned by the backend or server SHALL be surfaced to the user

#### Scenario: User has both read and post privileges

- **WHEN** the user has privileges to both read and post to the message board
- **THEN** the fetch and post operations SHALL succeed when sent
