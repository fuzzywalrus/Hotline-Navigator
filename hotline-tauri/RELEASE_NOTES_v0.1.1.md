# Hotline Navigator v0.1.1

## Release Highlights

This release adds several important features and improvements, including @username mentions, join/leave messages, a tabbed interface for multiple servers, and various UI enhancements.

## New Features

### @Username Mentions
- **Mention Detection**: Case-insensitive @username detection in chat messages
- **Visual Highlighting**: Messages containing mentions are highlighted with yellow background and left border
- **Notifications**: Mentions trigger tab unread count increments and toast notifications
- **Smart Matching**: Uses word boundaries to prevent partial matches (e.g., `@greg` doesn't match `@gregory`)

### Join/Leave Messages
- **Join Messages**: Chat messages displayed when users join the server (`"{username} joined"`)
- **Leave Messages**: Chat messages displayed when users leave the server (`"{username} left"`)
- **Styling**: Join/leave messages styled as centered, italic, gray text for subtle appearance
- **User List Updates**: User list now correctly updates when users join or leave

### Tabbed Interface
- **Multi-Server Support**: Browser-like tabbed interface for managing multiple server connections
- **Tab Management**: Add, remove, and switch between server tabs with keyboard shortcuts
- **Unread Indicators**: Tab badges show unread message counts for background tabs
- **Tracker Tab**: Always-visible tracker/bookmark tab that acts as "home" for opening new servers
- **Keyboard Shortcuts**: 
  - `⌘W` - Close active server tab
  - `⌘Tab` - Switch to next tab
  - `⌘1-9` - Switch to tab by number

## UI Improvements

### Dark Mode Enhancements
- **Tab Styling**: Active tab uses lighter dark background (`gray-700`) with white text and purple underline
- **Overscroll Fix**: Fixed white background showing on overscroll in dark mode
- **Inactive Tabs**: Darker background (`gray-800`) with gray text for better contrast

### User Experience
- **Close Tab Disconnect**: Closing a server tab automatically disconnects from the backend
- **Tab Persistence**: Tabs persist across server connections and disconnections
- **Dynamic Tab Titles**: Tab titles update automatically from server name

## Bug Fixes

- Fixed user list not updating when new users join (now uses `NotifyUserChange` correctly)
- Fixed duplicate join messages (removed from initial load handler)
- Fixed leave messages not appearing (properly get username before removal)
- Fixed white background on overscroll in dark mode

##Installation

1. Download `Hotline Navigator_0.1.1_universal.dmg`
2. Open the DMG file
3. Drag `Hotline Navigator` to your Applications folder
4. Launch from Applications