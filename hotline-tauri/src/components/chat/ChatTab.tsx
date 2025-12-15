import { useRef, useEffect, useState } from 'react';

interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
  type?: 'message' | 'agreement' | 'server' | 'joined' | 'left' | 'signOut';
  isMention?: boolean; // Indicates if this message mentions the current user
}

interface ChatTabProps {
  serverName: string;
  messages: ChatMessage[];
  message: string;
  sending: boolean;
  bannerUrl?: string | null;
  agreementText?: string | null;
  onMessageChange: (value: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onAcceptAgreement?: () => void;
  onDeclineAgreement?: () => void;
}

export default function ChatTab({
  serverName,
  messages,
  message,
  sending,
  bannerUrl,
  agreementText,
  onMessageChange,
  onSendMessage,
  onAcceptAgreement,
  onDeclineAgreement,
}: ChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [agreementExpanded, setAgreementExpanded] = useState(false);
  const agreementContentRef = useRef<HTMLDivElement>(null);
  const [isAgreementExpandable, setIsAgreementExpandable] = useState(false);
  const MAX_AGREEMENT_HEIGHT = 340;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agreementText]);

  // Check if agreement is expandable
  useEffect(() => {
    if (agreementContentRef.current && agreementText) {
      const height = agreementContentRef.current.scrollHeight;
      setIsAgreementExpandable(height > MAX_AGREEMENT_HEIGHT);
    }
  }, [agreementText]);

  // Debug: log when agreement text changes
  useEffect(() => {
    if (agreementText) {
      console.log('ChatTab: Agreement text received, length:', agreementText.length);
      console.log('ChatTab: Agreement text (first 100 chars):', agreementText.substring(0, 100));
    } else {
      console.log('ChatTab: No agreement text');
    }
  }, [agreementText]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Server Agreement */}
        {agreementText && (
          <div className="flex flex-col items-center py-6 space-y-4">
            {/* Banner above agreement */}
            {bannerUrl && (
              <div className="flex justify-center mb-2">
                <img
                  src={bannerUrl}
                  alt="Server Banner"
                  className="max-w-[468px] h-auto max-h-[60px] rounded-lg"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
            )}

            {/* Agreement text */}
            <div className="w-full max-w-md">
              <div
                ref={agreementContentRef}
                className={`bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 overflow-y-auto ${
                  !agreementExpanded && isAgreementExpandable ? 'max-h-[340px]' : ''
                }`}
              >
                <pre className="text-xs font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                  {agreementText}
                </pre>
              </div>

              {/* Expand button */}
              {isAgreementExpandable && !agreementExpanded && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => setAgreementExpanded(true)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
                    title="Expand Server Agreement"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    Expand
                  </button>
                </div>
              )}

              {/* Accept/Decline buttons */}
              <div className="flex gap-3 justify-end mt-4">
                <button
                  onClick={onDeclineAgreement}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  Decline
                </button>
                <button
                  onClick={onAcceptAgreement}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        
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
            return (
              <div 
                key={uniqueKey} 
                className={`text-sm ${
                  isMention 
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 pl-3 py-2 rounded-r my-1' 
                    : ''
                }`}
              >
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
            placeholder={agreementText ? "Please accept or decline the server agreement" : "Type a message..."}
            disabled={sending || !!agreementText}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
