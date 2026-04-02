import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import MnemosyneWindow from './MnemosyneWindow';
import type { MnemosyneSearchResponse } from '../../types';

const MNEMOSYNE_ID = 'test-mnemosyne-1';
const MNEMOSYNE_URL = 'http://mnemosyne.test:8980';

const mockStats = {
  servers: { total: 25, active: 20 },
  content: {
    msgboard_posts: 1500,
    news_articles: 800,
    files: 5000,
    total_file_size: 10737418240,
  },
  most_active: [],
  recently_updated: [],
};

const mockSearchResponse: MnemosyneSearchResponse = {
  total: 3,
  results: [
    {
      type: 'file',
      server_id: 'srv-1',
      server_name: 'Test Server',
      server_address: 'test.example.com:5500',
      score: 10.0,
      data: {
        path: '/Files/',
        name: 'photo.jpg',
        size: 204800,
        type: 'JPEG',
        comment: 'A photo',
      },
    },
    {
      type: 'msgboard',
      server_id: 'srv-1',
      server_name: 'Test Server',
      server_address: 'test.example.com:5500',
      score: 8.5,
      data: {
        post_id: 42,
        nick: 'admin',
        body: 'Hello world from the message board',
        timestamp: '2026-03-30T10:00:00',
      },
    },
    {
      type: 'news',
      server_id: 'srv-2',
      server_name: 'Another Server',
      server_address: 'another.example.com:5500',
      score: 5.0,
      data: {
        path: '/News/General',
        article_id: 5,
        title: 'Welcome Article',
        poster: 'admin',
        body: 'This is the welcome article body',
        date: '2026-03-28',
      },
    },
  ],
};

const mockEmptyResponse: MnemosyneSearchResponse = {
  total: 0,
  results: [],
};

function seedMnemosyneBookmark() {
  useAppStore.setState({
    mnemosyneBookmarks: [
      { id: MNEMOSYNE_ID, name: 'Test Mnemosyne', url: MNEMOSYNE_URL },
    ],
  });
}

describe('MnemosyneWindow', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    seedMnemosyneBookmark();
  });

  describe('initial render', () => {
    it('shows the search bar and empty state', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      expect(screen.getByPlaceholderText(/search servers/i)).toBeInTheDocument();
      expect(screen.getByText('Search across Hotline servers')).toBeInTheDocument();
    });

    it('shows instance name in the header', () => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      expect(screen.getByText('Test Mnemosyne')).toBeInTheDocument();
    });

    it('shows "not found" when mnemosyneId is invalid', () => {
      render(<MnemosyneWindow mnemosyneId="nonexistent" />);

      expect(screen.getByText('Mnemosyne instance not found')).toBeInTheDocument();
    });

    it('fetches and displays stats on mount', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('20 servers indexed')).toBeInTheDocument();
      });
      expect(screen.getByText('5,000 files')).toBeInTheDocument();
      expect(screen.getByText('1,500 posts')).toBeInTheDocument();
      expect(screen.getByText('800 articles')).toBeInTheDocument();
    });

    it('calls stats endpoint with correct URL', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: `${MNEMOSYNE_URL}/api/v1/stats`,
        });
      });
    });

    it('gracefully handles stats fetch failure', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'));

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      // Should still show the search UI without stats
      await waitFor(() => {
        expect(screen.getByText('Search across Hotline servers')).toBeInTheDocument();
      });
      expect(screen.queryByText(/servers indexed/)).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('fires search on Enter with correct URL params', async () => {
      const user = userEvent.setup();
      // First call: stats. Second call: search.
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'photo');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: `${MNEMOSYNE_URL}/api/v1/search?q=photo&limit=20`,
        });
      });
    });

    it('displays search results', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('3 results found')).toBeInTheDocument();
      });

      // File result
      expect(screen.getByText('photo.jpg')).toBeInTheDocument();

      // Msgboard result
      expect(screen.getByText('Hello world from the message board')).toBeInTheDocument();

      // News result
      expect(screen.getByText('Welcome Article')).toBeInTheDocument();
    });

    it('shows "No results found" for empty results', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockEmptyResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'xyznonexistent');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });

    it('shows error message on search failure', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockRejectedValueOnce('Request failed: connection refused');

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Request failed: connection refused')).toBeInTheDocument();
      });
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    it('does not search when query is empty', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.click(input);
      await user.keyboard('{Enter}');

      // Only the stats call, no search call
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('type filters', () => {
    it('renders all filter buttons', () => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'News' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument();
    });

    it('includes type param when filter is set before search', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      // Select Files filter first
      await user.click(screen.getByRole('button', { name: 'Files' }));

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'photo');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: `${MNEMOSYNE_URL}/api/v1/search?q=photo&limit=20&type=files`,
        });
      });
    });

    it('re-searches when filter changes after initial search', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockSearchResponse) // initial search
        .mockResolvedValueOnce(mockSearchResponse); // re-search with filter

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('3 results found')).toBeInTheDocument();
      });

      // Now change filter — should trigger new search
      await user.click(screen.getByRole('button', { name: 'News' }));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: `${MNEMOSYNE_URL}/api/v1/search?q=test&limit=20&type=news`,
        });
      });
    });

    it('does not re-search when filter changes before any search', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      await user.click(screen.getByRole('button', { name: 'Board' }));

      // Only the stats call, no search
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('clear', () => {
    it('clears query and results when clear button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('3 results found')).toBeInTheDocument();
      });

      // Click the clear (X) button
      const clearButton = screen.getByRole('button', { name: '' }); // The X button has no text
      // Find the clear button more precisely — it's inside the form near the input
      const form = input.closest('form')!;
      const clearBtn = form.querySelector('button[type="button"]')! as HTMLElement;
      await user.click(clearBtn);

      // Results should be gone, empty state should return
      expect(screen.queryByText('3 results found')).not.toBeInTheDocument();
      expect(screen.getByText('Search across Hotline servers')).toBeInTheDocument();
      expect(input).toHaveValue('');
    });
  });

  describe('result types', () => {
    beforeEach(() => {
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);
    });

    it('shows type labels for each result', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke).mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('3 results found')).toBeInTheDocument();
      });

      // Filter buttons also say "Board", "News", "Files" — use getAllByText
      // and check we have at least 2 (1 filter + 1 result label)
      expect(screen.getAllByText('File').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Board').length).toBeGreaterThanOrEqual(2); // filter + result label
      expect(screen.getAllByText('News').length).toBeGreaterThanOrEqual(2); // filter + result label
    });

    it('shows server name on each result', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke).mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getAllByText('Test Server')).toHaveLength(2);
        expect(screen.getByText('Another Server')).toBeInTheDocument();
      });
    });

    it('formats file size correctly', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke).mockResolvedValueOnce(mockSearchResponse);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      const input = screen.getByPlaceholderText(/search servers/i);
      await user.type(input, 'test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('200.0 KB')).toBeInTheDocument();
      });
    });
  });

  describe('URL normalization', () => {
    it('works with URL that has no protocol', async () => {
      useAppStore.setState({
        mnemosyneBookmarks: [
          { id: MNEMOSYNE_ID, name: 'Test', url: 'mnemosyne.test:8980' },
        ],
      });

      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: 'http://mnemosyne.test:8980/api/v1/stats',
        });
      });
    });

    it('preserves https:// if already specified', async () => {
      useAppStore.setState({
        mnemosyneBookmarks: [
          { id: MNEMOSYNE_ID, name: 'Test', url: 'https://secure.test:8980' },
        ],
      });

      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      render(<MnemosyneWindow mnemosyneId={MNEMOSYNE_ID} />);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('mnemosyne_fetch', {
          url: 'https://secure.test:8980/api/v1/stats',
        });
      });
    });
  });
});
