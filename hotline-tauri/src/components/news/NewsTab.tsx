interface NewsCategory {
  type: number;
  count: number;
  name: string;
  path: string[];
}

interface NewsArticle {
  id: number;
  parent_id: number;
  flags: number;
  title: string;
  poster: string;
  date?: string;
  path: string[];
}

interface NewsTabProps {
  newsPath: string[];
  newsCategories: NewsCategory[];
  newsArticles: NewsArticle[];
  selectedArticle: NewsArticle | null;
  articleContent: string;
  loadingNews: boolean;
  showComposer: boolean;
  composerTitle: string;
  composerBody: string;
  postingNews: boolean;
  onNewsPathChange: (path: string[]) => void;
  onNewsBack: () => void;
  onNavigateNews: (category: NewsCategory) => void;
  onSelectArticle: (article: NewsArticle) => void;
  onToggleComposer: () => void;
  onComposerTitleChange: (value: string) => void;
  onComposerBodyChange: (value: string) => void;
  onPostNews: (e: React.FormEvent) => void;
}

export default function NewsTab({
  newsPath,
  newsCategories,
  newsArticles,
  selectedArticle,
  articleContent,
  loadingNews,
  showComposer,
  composerTitle,
  composerBody,
  postingNews,
  onNewsPathChange,
  onNewsBack,
  onNavigateNews,
  onSelectArticle,
  onToggleComposer,
  onComposerTitleChange,
  onComposerBodyChange,
  onPostNews,
}: NewsTabProps) {
  return (
    <div className="flex-1 flex">
      {/* Left panel: Categories and Articles */}
      <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Path breadcrumb */}
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => onNewsPathChange([])}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            News
          </button>
          {newsPath.map((segment, index) => {
            // Create unique key from path segment and position
            const uniqueKey = `news-path-${index}-${segment}`;
            return (
            <span key={uniqueKey} className="flex items-center gap-2">
              <span className="text-gray-400 dark:text-gray-500">/</span>
              <button
                onClick={() => onNewsPathChange(newsPath.slice(0, index + 1))}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {segment}
              </button>
            </span>
            );
          })}
          {newsPath.length > 0 && (
            <button
              onClick={onNewsBack}
              className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back
            </button>
          )}
        </div>

        {/* Categories list */}
        {newsCategories.length > 0 && (
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400">
              CATEGORIES
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {newsCategories.map((category, index) => {
                // Create unique key from category path and name
                const uniqueKey = `category-${category.path.join('/')}-${category.name}-${index}`;
                return (
                <button
                  key={uniqueKey}
                  onClick={() => onNavigateNews(category)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      📁 {category.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {category.count} {category.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Articles list */}
        <div className="flex-1 overflow-y-auto">
          {loadingNews ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Loading news...
            </div>
          ) : newsArticles.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No articles in this category
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {newsArticles.map((article) => (
                <button
                  key={article.id}
                  onClick={() => onSelectArticle(article)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    selectedArticle?.id === article.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {article.title}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    by {article.poster}
                    {article.parent_id > 0 && (
                      <span className="ml-2 text-blue-600 dark:text-blue-400">↳ Reply</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Post button */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={onToggleComposer}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
          >
            {showComposer ? 'Cancel' : selectedArticle ? 'Reply to Article' : 'Post Article'}
          </button>
        </div>
      </div>

      {/* Right panel: Article viewer or composer */}
      <div className="w-1/2 flex flex-col">
        {showComposer ? (
          /* Composer */
          <form onSubmit={onPostNews} className="flex-1 flex flex-col p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {selectedArticle ? `Reply to: ${selectedArticle.title}` : 'Post New Article'}
            </h3>
            <input
              type="text"
              value={composerTitle}
              onChange={(e) => onComposerTitleChange(e.target.value)}
              placeholder="Article title..."
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <textarea
              value={composerBody}
              onChange={(e) => onComposerBodyChange(e.target.value)}
              placeholder="Article content..."
              rows={20}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <button
              type="submit"
              disabled={!composerTitle.trim() || !composerBody.trim() || postingNews}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
            >
              {postingNews ? 'Posting...' : 'Post'}
            </button>
          </form>
        ) : selectedArticle ? (
          /* Article viewer */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedArticle.title}
              </h2>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                by {selectedArticle.poster}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap break-words">
                {articleContent}
              </pre>
            </div>
          </div>
        ) : (
          /* No article selected */
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            Select an article to read
          </div>
        )}
      </div>
    </div>
  );
}
