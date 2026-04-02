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


### Requirement: Markdown rendering in post display

The system SHALL render message board posts using Markdown formatting when the user has enabled Markdown rendering in preferences.

#### Scenario: Render a post containing Markdown syntax

- **WHEN** a post contains Markdown formatting (e.g., bold, links, lists)
- **THEN** the system SHALL render the Markdown as formatted text in the display

#### Scenario: Render a post without Markdown

- **WHEN** a post contains no Markdown syntax
- **THEN** the system SHALL display the post as plain text


### Requirement: Auto-scroll to latest posts

The system SHALL automatically scroll the message board view to show the most recent posts when the board is loaded or when a new post is submitted.

#### Scenario: Auto-scroll on initial load

- **WHEN** the message board finishes loading posts
- **THEN** the system SHALL scroll the view so the latest posts are visible

#### Scenario: Auto-scroll after posting

- **WHEN** the user successfully submits a new post
- **THEN** the system SHALL scroll the view so the newly posted message is visible


### Requirement: Access privilege enforcement

The system SHALL enforce server access privileges for message board operations. Reading the board and posting to the board each require the appropriate privilege granted by the server.

#### Scenario: User lacks read privilege

- **WHEN** the user does not have the privilege to read the message board
- **THEN** the system SHALL NOT send a GetMessageBoard transaction and SHALL indicate that access is denied

#### Scenario: User lacks post privilege

- **WHEN** the user does not have the privilege to post to the message board
- **THEN** the system SHALL disable the post submission control and indicate that posting is not permitted

#### Scenario: User has both read and post privileges

- **WHEN** the user has privileges to both read and post to the message board
- **THEN** the system SHALL allow fetching posts and enable the post submission control
