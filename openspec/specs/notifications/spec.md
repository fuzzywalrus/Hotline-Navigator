## Purpose

Defines the notification system, including toast notifications, per-event sound effects, notification history, and watch word alerts.

## Requirements

### Requirement: Toast notifications for system events

The system SHALL display toast notifications for the following events: chat messages, private messages, file transfer completion, user joins, user leaves, errors, and system events.

#### Scenario: Toast on private message received

- **WHEN** the user receives a private message from another user
- **THEN** the system SHALL display a toast notification indicating a new private message

#### Scenario: Toast on file transfer completion

- **WHEN** a file transfer completes successfully
- **THEN** the system SHALL display a toast notification indicating the transfer is complete

#### Scenario: Toast on user join

- **WHEN** a user joins the connected server
- **THEN** the system SHALL display a toast notification indicating the user has joined

#### Scenario: Toast on user leave

- **WHEN** a user leaves the connected server
- **THEN** the system SHALL display a toast notification indicating the user has left

#### Scenario: Toast on error

- **WHEN** the system encounters an error (e.g., connection failure, transfer error)
- **THEN** the system SHALL display a toast notification describing the error


### Requirement: Notification types

Each toast notification SHALL be classified as one of four types: success, error, warning, or info. The visual presentation MUST differ by type so the user can distinguish them at a glance.

#### Scenario: Success notification appearance

- **WHEN** a success-type toast is displayed (e.g., file transfer completed)
- **THEN** the toast SHALL be styled distinctly as a success notification

#### Scenario: Error notification appearance

- **WHEN** an error-type toast is displayed (e.g., connection failure)
- **THEN** the toast SHALL be styled distinctly as an error notification

#### Scenario: Info notification appearance

- **WHEN** an info-type toast is displayed (e.g., user joined)
- **THEN** the toast SHALL be styled distinctly as an informational notification


### Requirement: Persistent notification history

The system SHALL maintain a log of all notifications generated during the session. The user SHALL be able to view this history in a dedicated modal.

#### Scenario: View notification history

- **WHEN** the user opens the notification history modal
- **THEN** the system SHALL display all notifications from the current session in chronological order

#### Scenario: Notification added to history

- **WHEN** a new toast notification is displayed
- **THEN** the system SHALL append it to the notification history log


### Requirement: Clear notification history

The system SHALL allow the user to clear all entries from the notification history log.

#### Scenario: Clear all notification history

- **WHEN** the user performs the clear notification history action
- **THEN** the notification history log SHALL be emptied and the history modal SHALL show no entries


### Requirement: Per-event sound effect toggles

The system SHALL provide individual sound effect toggles for each of the following events: chat messages, private messages, file transfer completion, user joins, user leaves, login complete, errors, server messages, and news articles. Each toggle SHALL independently control whether a sound plays for that event.

#### Scenario: Sound enabled for chat messages

- **WHEN** a chat message is received and the chat message sound toggle is enabled
- **THEN** the system SHALL play the chat message sound effect

#### Scenario: Sound disabled for chat messages

- **WHEN** a chat message is received and the chat message sound toggle is disabled
- **THEN** the system SHALL NOT play any sound for that event

#### Scenario: Sound on private message received

- **WHEN** a private message is received and the private message sound toggle is enabled
- **THEN** the system SHALL play the private message sound effect

#### Scenario: Sound on login complete

- **WHEN** the user successfully logs in to a server and the login complete sound toggle is enabled
- **THEN** the system SHALL play the login complete sound effect

#### Scenario: Sound on user join

- **WHEN** a user joins the server and the user join sound toggle is enabled
- **THEN** the system SHALL play the user join sound effect

#### Scenario: Sound on user leave

- **WHEN** a user leaves the server and the user leave sound toggle is enabled
- **THEN** the system SHALL play the user leave sound effect


### Requirement: Global sound toggle

The system SHALL provide a master sound toggle. When the global sound toggle is off, the system MUST NOT play any sound effects regardless of individual per-event toggle states.

#### Scenario: Global sound off suppresses all sounds

- **WHEN** the global sound toggle is off and any sound-triggering event occurs
- **THEN** the system SHALL NOT play any sound effect

#### Scenario: Global sound on defers to individual toggles

- **WHEN** the global sound toggle is on and a sound-triggering event occurs
- **THEN** the system SHALL play or suppress the sound according to the individual toggle for that event


### Requirement: Classic Hotline sound effects

The system SHALL use sound effects ported from the original Hotline client software. Each event type SHALL have a designated classic sound effect.

#### Scenario: Classic sound plays for chat message

- **WHEN** a chat message sound is triggered
- **THEN** the system SHALL play the classic Hotline chat sound effect


### Requirement: Persistent sound preferences

All sound toggle states (global and per-event) SHALL be persisted across application sessions.

#### Scenario: Sound preferences restored on launch

- **WHEN** the user previously disabled the chat message sound and restarts the application
- **THEN** the chat message sound toggle SHALL remain disabled after relaunch


### Requirement: Watch word list

The system SHALL allow the user to define a list of watch words (keywords). The watch word list SHALL be persisted across sessions.

#### Scenario: Add a watch word

- **WHEN** the user adds the word "hotline" to the watch word list
- **THEN** the word "hotline" SHALL appear in the persisted watch word list

#### Scenario: Remove a watch word

- **WHEN** the user removes the word "hotline" from the watch word list
- **THEN** the word "hotline" SHALL no longer appear in the watch word list


### Requirement: Watch word detection in chat

The system SHALL scan incoming chat messages for any of the user's defined watch words. Matching SHALL be case-insensitive.

#### Scenario: Watch word detected case-insensitively

- **WHEN** a chat message containing "HOTLINE" is received and the watch word list includes "hotline"
- **THEN** the system SHALL treat it as a watch word match

#### Scenario: No match when word not in list

- **WHEN** a chat message containing "server" is received and the watch word list does not include "server"
- **THEN** the system SHALL NOT trigger a watch word notification


### Requirement: Watch word notification

The system SHALL display a notification popup when a watch word is detected in an incoming chat message.

#### Scenario: Notification on watch word match

- **WHEN** a chat message matches one of the user's watch words
- **THEN** the system SHALL display a notification popup alerting the user that their watch word was found


### Requirement: Persistent watch word list

The watch word list SHALL persist across application sessions so that the user does not need to re-enter watch words after restarting the application.

#### Scenario: Watch words restored on launch

- **WHEN** the user previously added "hotline" and "retro" to the watch word list and restarts the application
- **THEN** the watch word list SHALL contain "hotline" and "retro" after relaunch
