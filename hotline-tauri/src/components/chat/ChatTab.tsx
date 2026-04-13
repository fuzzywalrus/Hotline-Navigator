import { useRef, useEffect, useState } from 'react';
import MarkdownText from '../common/MarkdownText';
import { usePreferencesStore } from '../../stores/preferencesStore';

interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
  type?: 'message' | 'agreement' | 'server' | 'joined' | 'left' | 'signOut';
  isMention?: boolean; // Indicates if this message mentions the current user
  isAdmin?: boolean;
}

interface ChatTabProps {
  serverName: string;
  messages: ChatMessage[];
  message: string;
  sending: boolean;
  bannerUrl?: string | null;
  agreementText?: string | null;
  canBroadcast?: boolean;
  onMessageChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onSendBroadcast?: (message: string) => void;
  onAcceptAgreement?: () => void;
  onDeclineAgreement?: () => void;
}

export default function ChatTab({
  serverName,
  messages,
  message,
  sending,
  bannerUrl: _bannerUrl,
  agreementText,
  canBroadcast,
  onMessageChange,
  onSendMessage,
  onSendBroadcast,
  onAcceptAgreement: _onAcceptAgreement,
  onDeclineAgreement: _onDeclineAgreement,
}: ChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const { clickableLinks, showTimestamps } = usePreferencesStore();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  // Auto-scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  // Auto-resize textarea as message content changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [message]);

  // Re-anchor to bottom on container resize (e.g. window resize)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        scrollToBottom(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && !agreementText ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Connected to {serverName}
          </div>
        ) : (
          messages.map((msg, index) => {
            // Check if this is a broadcast message (from Server)
            const isBroadcast = msg.userName === 'Server' && msg.userId === 0;
            
            if (isBroadcast) {
              // Create unique key for broadcast
              const uniqueKey = `broadcast-${msg.timestamp.getTime()}-${msg.message.substring(0, 20)}-${index}`;
              return (
                <div key={uniqueKey} className="my-2">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                        Server Broadcast
                        {showTimestamps && (
                          <span className="font-normal text-blue-500 dark:text-blue-400 ml-2">{formatTime(msg.timestamp)}</span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            
            // Check if this is a join/leave message
            if (msg.type === 'joined' || msg.type === 'left') {
              const uniqueKey = `${msg.type}-${msg.userId}-${msg.timestamp.getTime()}-${index}`;
              return (
                <div key={uniqueKey} className="text-sm text-center my-1">
                  {showTimestamps && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{formatTime(msg.timestamp)}</span>
                  )}
                  <span className="italic text-gray-500 dark:text-gray-400">
                    {msg.message}
                  </span>
                </div>
              );
            }
            
            const isOwnMessage = msg.userName === 'Me';
            const isMention = msg.isMention || false;
            // Create unique key from userId, timestamp, message content, and index
            const uniqueKey = `${msg.userId}-${msg.timestamp.getTime()}-${msg.message.substring(0, 20)}-${index}`;

            // Detect relay messages: userName is "Relay" and message is "Service | actualUser: text"
            const relayMatch = msg.userName === 'Relay'
              ? msg.message.match(/^(.+?)\s*\|\s*(.+?):\s(.*)$/s)
              : null;

            return (
              <div
                key={uniqueKey}
                className={`text-sm ${
                  isMention
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 pl-3 py-2 rounded-r my-1'
                    : ''
                }`}
              >
                {showTimestamps && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{formatTime(msg.timestamp)}</span>
                )}
                {relayMatch ? (
                  <>
                    <span className="font-bold text-[#5865F2]">
                      {msg.userName}: {relayMatch[1]}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500"> | </span>
                    <span className="font-bold text-sky-600 dark:text-sky-400">
                      {relayMatch[2]}:
                    </span>{' '}
                  </>
                ) : (
                  <span
                    className={`font-bold ${
                      isOwnMessage
                        ? 'text-green-600 dark:text-green-400'
                        : msg.isAdmin
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    {msg.userName}:
                  </span>
                )}{' '}
                <span className="text-gray-900 dark:text-gray-100">
                  {clickableLinks ? <MarkdownText text={relayMatch ? relayMatch[3] : msg.message} /> : (relayMatch ? relayMatch[3] : msg.message)}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Broadcast mode input */}
      {broadcastMode && (
        <div className="border-t border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Server Broadcast</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Type broadcast message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && broadcastMessage.trim()) {
                  onSendBroadcast?.(broadcastMessage.trim());
                  setBroadcastMessage('');
                  setBroadcastMode(false);
                }
                if (e.key === 'Escape') {
                  setBroadcastMode(false);
                  setBroadcastMessage('');
                }
              }}
              autoFocus
              className="flex-1 px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (broadcastMessage.trim()) {
                  onSendBroadcast?.(broadcastMessage.trim());
                  setBroadcastMessage('');
                }
                setBroadcastMode(false);
              }}
              disabled={!broadcastMessage.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
            >
              Broadcast
            </button>
            <button
              onClick={() => { setBroadcastMode(false); setBroadcastMessage(''); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Message input */}
      <form onSubmit={onSendMessage} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          {canBroadcast && !broadcastMode && (
            <button
              type="button"
              onClick={() => setBroadcastMode(true)}
              title="Send Server Broadcast"
              className="px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </button>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (message.trim() && !sending && !agreementText) {
                  (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                }
              }
            }}
            placeholder={agreementText ? "Please accept or decline the server agreement" : "Type a message..."}
            disabled={sending || !!agreementText}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none overflow-y-hidden leading-normal"
          />
          <button
            type="submit"
            disabled={!message.trim() || sending || !!agreementText}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
