import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import Linkify from './Linkify';
import MarkdownText from './MarkdownText';
import { usePreferencesStore } from '../../stores/preferencesStore';

function resetPreferences() {
  usePreferencesStore.setState({
    chatDisplayMode: 'discord',
    showInlineImages: false,
    showLinkPreviews: false,
    renderMarkdown: true,
  });
}

describe('chat remote media privacy guards', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(invoke).mockReset();
    resetPreferences();
  });

  it('does not force inline image loads in Discord mode', () => {
    const { container } = render(
      <Linkify text="https://attacker.test/beacon.png" hideImageUrls />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('External image')).toBeInTheDocument();
    expect(screen.getByText('attacker.test/beacon.png')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not auto-load markdown images unless inline previews are enabled', () => {
    const { container } = render(
      <MarkdownText text="![tracking beacon](http://attacker.test/beacon.png)" />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('tracking beacon')).toBeInTheDocument();
    expect(screen.getByText('attacker.test/beacon.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load image' })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('loads an image on demand when the user clicks Load image', async () => {
    vi.mocked(invoke).mockResolvedValue({
      bytesBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7QAAAAASUVORK5CYII=',
      mime: 'image/png',
    });

    const { container } = render(
      <Linkify text="https://attacker.test/beacon.png" hideImageUrls />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load image' }));

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:mock-url');
    expect(invoke).toHaveBeenCalledWith('fetch_external_image', {
      url: 'https://attacker.test/beacon.png',
    });
  });

  it('auto-loads markdown images when inline previews are enabled', async () => {
    usePreferencesStore.setState({ showInlineImages: true });
    vi.mocked(invoke).mockResolvedValue({
      bytesBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7QAAAAASUVORK5CYII=',
      mime: 'image/png',
    });

    const { container } = render(
      <MarkdownText text="![tracking beacon](http://attacker.test/beacon.png)" />,
    );

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:mock-url');
    expect(invoke).toHaveBeenCalledWith('fetch_external_image', {
      url: 'http://attacker.test/beacon.png',
    });
  });

  it('lets the per-image checkbox enable automatic external image loading', async () => {
    vi.mocked(invoke).mockResolvedValue({
      bytesBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7QAAAAASUVORK5CYII=',
      mime: 'image/png',
    });

    const { container } = render(
      <Linkify text="https://attacker.test/beacon.png" hideImageUrls />,
    );

    fireEvent.click(screen.getByLabelText('Always load external images'));

    await waitFor(() => expect(usePreferencesStore.getState().showInlineImages).toBe(true));
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:mock-url');
  });

  it('does not infinitely retry a failed auto-load', async () => {
    usePreferencesStore.setState({ showInlineImages: true });
    vi.mocked(invoke).mockRejectedValue('HTTP 404');

    render(
      <Linkify text="https://attacker.test/missing.png" hideImageUrls />,
    );

    await waitFor(() => expect(screen.getByText('Preview failed: HTTP 404')).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
