import { useState, useEffect, useRef } from 'react';

interface Message {
  text: string;
  isOutgoing: boolean;
  timestamp: Date;
}

interface MessageDialogProps {
  userId: number;
  userName: string;
  messages: Message[];
  onSendMessage: (userId: number, message: string) => Promise<void>;
  onClose: () => void;
}

export default function MessageDialog({ userId, userName, messages, onSendMessage, onClose }: MessageDialogProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const messageText = input.trim();
    setSending(true);

    try {
      await onSendMessage(userId, messageText);
      setInput('');
    } catch (error) {
      console.error('Failed to send private message:', error);
      alert(`Failed to send message: ${error}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-[500px] h-[600px] flex flex-col">
        {/* Header */}
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Message {userName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No messages yet. Start a conversation!
            </div>
          ) : (
            messages.map((msg, index) => {
              // Create unique key from timestamp, content, and index
              const uniqueKey = `${msg.timestamp.getTime()}-${msg.isOutgoing ? 'out' : 'in'}-${msg.text.substring(0, 20)}-${index}`;
              return (
              <div
                key={uniqueKey}
                className={`flex ${msg.isOutgoing ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    msg.isOutgoing
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  <pre className="text-sm font-sans whitespace-pre-wrap break-words">
                    {msg.text}
                  </pre>
                </div>
              </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${userName}...`}
              disabled={sending}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
