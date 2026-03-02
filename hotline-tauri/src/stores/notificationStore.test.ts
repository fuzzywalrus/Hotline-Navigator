import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore, showNotification } from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useNotificationStore.setState({
      activeNotifications: [],
      notificationHistory: [],
      maxHistorySize: 100,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a notification', () => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      message: 'Test message',
    });

    const state = useNotificationStore.getState();
    expect(state.activeNotifications).toHaveLength(1);
    expect(state.activeNotifications[0].message).toBe('Test message');
    expect(state.activeNotifications[0].type).toBe('info');
  });

  it('adds to history when adding a notification', () => {
    useNotificationStore.getState().addNotification({
      type: 'success',
      message: 'Test',
    });

    expect(useNotificationStore.getState().notificationHistory).toHaveLength(1);
  });

  it('auto-removes notification after duration', () => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      message: 'Auto-dismiss',
      duration: 3000,
    });

    expect(useNotificationStore.getState().activeNotifications).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(useNotificationStore.getState().activeNotifications).toHaveLength(0);
  });

  it('removes a specific notification', () => {
    useNotificationStore.getState().addNotification({
      type: 'info',
      message: 'First',
      duration: 0,
    });
    useNotificationStore.getState().addNotification({
      type: 'info',
      message: 'Second',
      duration: 0,
    });

    const state = useNotificationStore.getState();
    expect(state.activeNotifications).toHaveLength(2);

    state.removeNotification(state.activeNotifications[0].id);
    expect(useNotificationStore.getState().activeNotifications).toHaveLength(1);
    expect(useNotificationStore.getState().activeNotifications[0].message).toBe('Second');
  });

  it('clears all active notifications', () => {
    useNotificationStore.getState().addNotification({ type: 'info', message: 'A', duration: 0 });
    useNotificationStore.getState().addNotification({ type: 'info', message: 'B', duration: 0 });

    useNotificationStore.getState().clearActiveNotifications();
    expect(useNotificationStore.getState().activeNotifications).toHaveLength(0);
  });

  it('clears history', () => {
    useNotificationStore.getState().addNotification({ type: 'info', message: 'A' });
    useNotificationStore.getState().clearHistory();
    expect(useNotificationStore.getState().notificationHistory).toHaveLength(0);
  });

  it('enforces max history size', () => {
    useNotificationStore.getState().setMaxHistorySize(3);

    for (let i = 0; i < 5; i++) {
      useNotificationStore.getState().addNotification({
        type: 'info',
        message: `Message ${i}`,
      });
    }

    expect(useNotificationStore.getState().notificationHistory).toHaveLength(3);
  });

  it('clamps max history size between 10 and 1000', () => {
    useNotificationStore.getState().setMaxHistorySize(5);
    expect(useNotificationStore.getState().maxHistorySize).toBe(10);

    useNotificationStore.getState().setMaxHistorySize(5000);
    expect(useNotificationStore.getState().maxHistorySize).toBe(1000);
  });
});

describe('showNotification helpers', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      activeNotifications: [],
      notificationHistory: [],
      maxHistorySize: 100,
    });
  });

  it('showNotification.success creates a success notification', () => {
    showNotification.success('Done!', 'Success');
    const n = useNotificationStore.getState().activeNotifications[0];
    expect(n.type).toBe('success');
    expect(n.message).toBe('Done!');
    expect(n.title).toBe('Success');
  });

  it('showNotification.error creates an error with longer duration', () => {
    showNotification.error('Failed');
    const n = useNotificationStore.getState().activeNotifications[0];
    expect(n.type).toBe('error');
    expect(n.duration).toBe(7000);
  });

  it('showNotification.warning creates a warning notification', () => {
    showNotification.warning('Careful', 'Warning', 4000, 'TestServer');
    const n = useNotificationStore.getState().activeNotifications[0];
    expect(n.type).toBe('warning');
    expect(n.serverName).toBe('TestServer');
  });
});
