interface BoardTabProps {
  boardPosts: string[];
  loadingBoard: boolean;
  boardMessage: string;
  postingBoard: boolean;
  onBoardMessageChange: (value: string) => void;
  onPostBoard: (e: React.FormEvent) => void;
}

export default function BoardTab({
  boardPosts,
  loadingBoard,
  boardMessage,
  postingBoard,
  onBoardMessageChange,
  onPostBoard,
}: BoardTabProps) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Posts list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loadingBoard ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            Loading message board...
          </div>
        ) : boardPosts.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No posts on message board
          </div>
        ) : (
          <div className="space-y-4">
            {boardPosts.map((post, index) => {
              // Create unique key from post content hash and index
              const postHash = post.substring(0, 50).replace(/\s/g, '');
              const uniqueKey = `post-${index}-${postHash}`;
              return (
              <div
                key={uniqueKey}
                className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <pre className="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap break-words m-0">
                  {post}
                </pre>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post composer */}
      <form onSubmit={onPostBoard} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col gap-2">
          <textarea
            value={boardMessage}
            onChange={(e) => onBoardMessageChange(e.target.value)}
            placeholder="Write a message to the board..."
            disabled={postingBoard}
            rows={3}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!boardMessage.trim() || postingBoard}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
            >
              {postingBoard ? 'Posting...' : 'Post to Board'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
