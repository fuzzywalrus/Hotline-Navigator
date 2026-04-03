## MODIFIED Requirements

### Requirement: Default bookmarks

The system SHALL define a set of default trackers and servers that are populated on first launch (when bookmarks.json is empty) and can be restored via the `add_default_bookmarks` command.

Default trackers (all on port 5498):
| ID | Name | Address |
|----|------|---------|
| `default-tracker-hltracker` | Featured Servers | `hltracker.com` |
| `default-tracker-mainecyber` | Maine Cyber | `tracked.mainecyber.com` |
| `default-tracker-preterhuman` | Preterhuman | `tracker.preterhuman.net` |
| `default-tracker-bigredh` | Big Red H | `track.bigredh.com` |
| `default-tracker-vespernet` | Vespernet | `tracker.vespernet.net` |

Default servers:
| ID | Name | Address | Port | TLS | HOPE |
|----|------|---------|------|-----|------|
| `default-server-bigredh` | Hotline Central Hub | `server.bigredh.com` | 5500 | false | false |
| `default-server-system7` | System7 Today | `hotline.system7today.com` | 5500 | false | false |
| `default-server-macdomain` | MacDomain | `62.116.228.143` | 5500 | false | false |
| `default-server-applearchive` | Apple Media Archive & Hotline Navigator | `hotline.semihosted.xyz` | 5600 | true | true |

All default bookmarks use login `"guest"`, no password, no icon, and `auto_connect: false`.

#### Scenario: First launch populates defaults

- **WHEN** the application launches for the first time (bookmarks.json is empty or does not exist)
- **THEN** the system SHALL populate the bookmarks list with all default trackers and servers, in the order listed above, and persist to bookmarks.json

#### Scenario: Defaults not duplicated on subsequent launches

- **WHEN** the application launches and bookmarks.json already contains bookmarks
- **THEN** the system SHALL NOT add duplicate default bookmarks
