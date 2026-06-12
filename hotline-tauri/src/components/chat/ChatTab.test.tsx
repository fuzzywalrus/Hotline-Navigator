import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import ChatTab from './ChatTab';
import { fireTauriEvent } from '../../test/setup';

const SERVER_ID = 'test-server';

function renderChatTab() {
  return render(
    <ChatTab
      serverId={SERVER_ID}
      serverName="Test Server"
      messages={[]}
      message=""
      sending={false}
      onMessageChange={() => {}}
      onSendMessage={() => {}}
    />,
  );
}

const attachButton = () =>
  screen.queryByTitle('Attach image') ??
  screen.queryByTitle('Your account does not have permission to send images');

describe('ChatTab inline-media status', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('shows an enabled attach button when the probe grants send rights', async () => {
    vi.mocked(invoke).mockResolvedValue({ serverSupports: true, canSend: true });

    renderChatTab();

    await waitFor(() => expect(attachButton()).toBeEnabled());
    expect(invoke).toHaveBeenCalledWith('get_inline_media_status', { serverId: SERVER_ID });
  });

  it('disables the attach button when the account lacks the privilege', async () => {
    vi.mocked(invoke).mockResolvedValue({ serverSupports: true, canSend: false });

    renderChatTab();

    await waitFor(() => expect(attachButton()).toBeDisabled());
  });

  it('hides the attach button entirely when the server lacks inline media', async () => {
    vi.mocked(invoke).mockResolvedValue({ serverSupports: false, canSend: false });

    renderChatTab();

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(attachButton()).toBeNull();
  });

  it('flips the attach button live on an inline-media-status event', async () => {
    vi.mocked(invoke).mockResolvedValue({ serverSupports: true, canSend: false });

    renderChatTab();
    await waitFor(() => expect(attachButton()).toBeDisabled());

    fireTauriEvent(`inline-media-status-${SERVER_ID}`, {
      serverSupports: true,
      canSend: true,
    });

    await waitFor(() => expect(attachButton()).toBeEnabled());
  });

  it('lets a live event win over a slower, staler probe result', async () => {
    // The probe resolves only when we say so — after the event has arrived.
    let resolveProbe!: (status: { serverSupports: boolean; canSend: boolean }) => void;
    vi.mocked(invoke).mockReturnValue(
      new Promise((resolve) => {
        resolveProbe = resolve;
      }),
    );

    renderChatTab();

    // The listener registers before the probe is issued, so an early event
    // must not be lost…
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    fireTauriEvent(`inline-media-status-${SERVER_ID}`, {
      serverSupports: true,
      canSend: true,
    });
    await waitFor(() => expect(attachButton()).toBeEnabled());

    // …and the stale snapshot resolving afterwards must not clobber it.
    resolveProbe({ serverSupports: true, canSend: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(attachButton()).toBeEnabled();
  });
});
