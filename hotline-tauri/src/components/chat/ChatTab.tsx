import { useRef, useEffect } from 'react';

interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
}

interface ChatTabProps {
  serverName: string;
  messages: ChatMessage[];
  message: string;
  sending: boolean;
  onMessageChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
}

export default function ChatTab({
  serverName,
  messages,
  message,
  sending,
  onMessageChange,
  onSendMessage,
}: ChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Connected to {serverName}
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwnMessage = msg.userName === 'Me';
            // Create unique key from userId, timestamp, message content, and index
            const uniqueKey = `${msg.userId}-${msg.timestamp.getTime()}-${msg.message.substring(0, 20)}-${index}`;
            return (
              <div key={uniqueKey} className="text-sm">
                <span
                  className={`font-semibold ${
                    isOwnMessage
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {msg.userName}:
                </span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{msg.message}</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form onSubmit={onSendMessage} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!message.trim() || sending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
