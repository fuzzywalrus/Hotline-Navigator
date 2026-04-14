// Discord-style chat renderer with message batching, user icons, and grouped timestamps
import UserIcon from '../users/UserIcon';
import MarkdownText from '../common/MarkdownText';

interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
  iconId?: number;
  type?: 'message' | 'agreement' | 'server' | 'joined' | 'left' | 'signOut';
  isMention?: boolean;
  isAdmin?: boolean;
  isServerHistory?: boolean;
}

interface MessageGroup {
  userId: number;
  userName: string;
  iconId?: number;
  isAdmin?: boolean;
  timestamp: Date;
  messages: { message: string; timestamp: Date; isMention?: boolean; index: number }[];
}

interface DiscordChatRendererProps {
  messages: ChatMessage[];
  formatTime: (date: Date) => string;
}

const BATCH_GAP_MS = 5 * 60 * 1000; // 5 minutes

// Strip the "username: " or "username:  " prefix from message text.
// Hotline servers often embed the sender name in the Data field.
function stripUsernamePrefix(message: string, userName: string): string {
  const trimmed = message.trimStart();
  const prefix = `${userName}:`;
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trimStart();
  }
  return trimmed;
}

function batchMessages(messages: ChatMessage[]): (MessageGroup | ChatMessage)[] {
  const batches: (MessageGroup | ChatMessage)[] = [];
  let currentGroup: MessageGroup | null = null;

  messages.forEach((msg, index) => {
    // System messages, broadcasts, and server history break batching
    const isSystem = msg.type === 'joined' || msg.type === 'left' || msg.type === 'signOut';
    const isBroadcast = msg.userName === 'Server' && msg.userId === 0;
    const isServerHistory = msg.isServerHistory;

    if (isSystem || isBroadcast || isServerHistory) {
      if (currentGroup) {
        batches.push(currentGroup);
        currentGroup = null;
      }
      batches.push({ ...msg, index } as ChatMessage & { index: number });
      return;
    }

    // Check if this message continues the current group
    const timeDiff = currentGroup
      ? msg.timestamp.getTime() - currentGroup.messages[currentGroup.messages.length - 1].timestamp.getTime()
      : 0;

    if (
      currentGroup &&
      currentGroup.userId === msg.userId &&
      currentGroup.userName === msg.userName &&
      timeDiff < BATCH_GAP_MS
    ) {
      // Continue the group
      currentGroup.messages.push({
        message: msg.message,
        timestamp: msg.timestamp,
        isMention: msg.isMention,
        index,
      });
    } else {
      // Start a new group
      if (currentGroup) batches.push(currentGroup);
      currentGroup = {
        userId: msg.userId,
        userName: msg.userName,
        iconId: msg.iconId,
        isAdmin: msg.isAdmin,
        timestamp: msg.timestamp,
        messages: [{
          message: msg.message,
          timestamp: msg.timestamp,
          isMention: msg.isMention,
          index,
        }],
      };
    }
  });

  if (currentGroup) batches.push(currentGroup);
  return batches;
}

function isMessageGroup(item: MessageGroup | ChatMessage): item is MessageGroup {
  return 'messages' in item && Array.isArray((item as MessageGroup).messages);
}

export default function DiscordChatRenderer({ messages, formatTime }: DiscordChatRendererProps) {
  const batches = batchMessages(messages);

  return (
    <>
      {batches.map((batch, batchIndex) => {
        // Single messages (system, broadcast, server history) render inline
        if (!isMessageGroup(batch)) {
          const msg = batch as ChatMessage & { index?: number };
          const isBroadcast = msg.userName === 'Server' && msg.userId === 0;

          if (isBroadcast) {
            return (
              <div key={`broadcast-${batchIndex}`} className="my-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                      Server Broadcast
                      <span className="font-normal text-blue-500 dark:text-blue-400 ml-2">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {msg.message}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Join/leave/server history — render as simple centered text
          if (msg.type === 'joined' || msg.type === 'left') {
            return (
              <div key={`sys-${batchIndex}`} className="text-sm text-center my-1">
                <span className="italic text-gray-500 dark:text-gray-400">{msg.message}</span>
              </div>
            );
          }

          // Server history message — render retro-style (no icon)
          if (msg.isServerHistory) {
            return (
              <div key={`hist-${batchIndex}`} className="text-sm">
                <span className={`font-bold ${
                  msg.isAdmin ? 'text-red-600 dark:text-red-400' : 'text-sky-600 dark:text-sky-400'
                }`}>
                  {msg.userName}:
                </span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{stripUsernamePrefix(msg.message, msg.userName)}</span>
              </div>
            );
          }

          return null;
        }

        // Grouped messages — Discord style
        const group = batch;
        const isOwnMessage = group.userName === 'Me';

        // Detect relay for the group header
        const relayMatch = group.userName === 'Relay'
          ? group.messages[0].message.match(/^(.+?)\s*\|\s*(.+?):\s(.*)$/s)
          : null;

        return (
          <div key={`group-${batchIndex}`} className="flex gap-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1 -mx-1">
            {/* User icon */}
            <div className="flex-shrink-0 w-10 pt-0.5">
              {group.iconId != null ? (
                <UserIcon iconId={group.iconId} size={32} className="rounded" />
              ) : (
                <div className="w-8 h-8 rounded bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                  {group.userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 min-w-0">
              {/* Header: username + timestamp */}
              <div className="flex items-baseline gap-2">
                {relayMatch ? (
                  <>
                    <span className="font-semibold text-sm text-[#5865F2]">
                      {group.userName}: {relayMatch[1]}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 text-xs">|</span>
                    <span className="font-semibold text-sm text-sky-600 dark:text-sky-400">
                      {relayMatch[2]}
                    </span>
                  </>
                ) : (
                  <span className={`font-semibold text-sm ${
                    isOwnMessage
                      ? 'text-green-600 dark:text-green-400'
                      : group.isAdmin
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-sky-600 dark:text-sky-400'
                  }`}>
                    {group.userName}
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatTime(group.timestamp)}
                </span>
              </div>

              {/* Message bodies */}
              {group.messages.map((m, msgIndex) => {
                const cleanMessage = stripUsernamePrefix(m.message, group.userName);
                const msgRelayMatch = group.userName === 'Relay'
                  ? cleanMessage.match(/^(.+?)\s*\|\s*(.+?):\s(.*)$/s)
                  : null;
                const displayText = msgRelayMatch ? msgRelayMatch[3] : cleanMessage;

                return (
                  <div
                    key={msgIndex}
                    className={`text-sm leading-relaxed ${
                      m.isMention
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400 dark:border-yellow-500 pl-2 py-0.5 rounded-r my-0.5'
                        : ''
                    }`}
                  >
                    <span className="text-gray-900 dark:text-gray-100">
                      <MarkdownText text={displayText} hideImageUrls />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
