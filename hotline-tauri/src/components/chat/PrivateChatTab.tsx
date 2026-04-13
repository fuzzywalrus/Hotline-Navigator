import { useRef, useEffect, useState } from 'react';
import MarkdownText from '../common/MarkdownText';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { PrivateChatRoom } from '../server/serverTypes';

interface PrivateChatTabProps {
  room: PrivateChatRoom;
  onSendMessage: (chatId: number, message: string) => void;
  onLeave: (chatId: number) => void;
  onSetSubject: (chatId: number, subject: string) => void;
}

export default function PrivateChatTab({ room, onSendMessage, onLeave, onSetSubject }: PrivateChatTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const [message, setMessage] = useState('');
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState(room.subject);
  const { clickableLinks } = usePreferencesStore();

  useEffect(() => {
    setSubjectDraft(room.subject);
  }, [room.subject]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [room.messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSendMessage(room.chatId, message);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleSubjectSubmit = () => {
    onSetSubject(room.chatId, subjectDraft);
    setEditingSubject(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Subject bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">Subject:</span>
        {editingSubject ? (
          <input
            className="flex-1 text-sm bg-white dark:bg-gray-700 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200"
            value={subjectDraft}
            onChange={(e) => setSubjectDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubjectSubmit();
              if (e.key === 'Escape') setEditingSubject(false);
            }}
            onBlur={handleSubjectSubmit}
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
            onClick={() => setEditingSubject(true)}
            title="Click to edit subject"
          >
            {room.subject || '(no subject)'}
          </span>
        )}
        {/* Mini user list */}
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {room.users.length} user{room.users.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => onLeave(room.chatId)}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1"
          title="Leave chat"
        >
          Leave
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1"
      >
        {room.messages.map((msg, i) => (
          <div key={i} className="text-sm">
            <span className="font-bold text-gray-800 dark:text-gray-200">
              {msg.userName}
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="ml-2 text-gray-700 dark:text-gray-300">
              {clickableLinks ? (
                <MarkdownText text={msg.message} />
              ) : (
                msg.message
              )}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
