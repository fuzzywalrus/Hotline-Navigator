import { usePreferencesStore } from '../../stores/preferencesStore';

export default function SoundSettingsTab() {
  const {
    playSounds,
    playChatSound,
    playFileTransferCompleteSound,
    playPrivateMessageSound,
    playJoinSound,
    playLeaveSound,
    playLoggedInSound,
    playErrorSound,
    playServerMessageSound,
    playNewNewsSound,
    setPlaySounds,
    setPlayChatSound,
    setPlayFileTransferCompleteSound,
    setPlayPrivateMessageSound,
    setPlayJoinSound,
    setPlayLeaveSound,
    setPlayLoggedInSound,
    setPlayErrorSound,
    setPlayServerMessageSound,
    setPlayNewNewsSound,
  } = usePreferencesStore();

  return (
    <div className="p-6 space-y-6">
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={playSounds}
            onChange={(e) => setPlaySounds(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Enable Sounds
          </span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
          Master toggle for all sound effects
        </p>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Sound Effects
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playChatSound}
              onChange={(e) => setPlayChatSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Chat Messages
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playFileTransferCompleteSound}
              onChange={(e) => setPlayFileTransferCompleteSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              File Transfer Complete
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playPrivateMessageSound}
              onChange={(e) => setPlayPrivateMessageSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Private Messages
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playJoinSound}
              onChange={(e) => setPlayJoinSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Join
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playLeaveSound}
              onChange={(e) => setPlayLeaveSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Leave
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playLoggedInSound}
              onChange={(e) => setPlayLoggedInSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Logged In
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playErrorSound}
              onChange={(e) => setPlayErrorSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Error
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playServerMessageSound}
              onChange={(e) => setPlayServerMessageSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              Server Broadcast
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={playNewNewsSound}
              onChange={(e) => setPlayNewNewsSound(e.target.checked)}
              disabled={!playSounds}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={`text-sm ${!playSounds ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
              New News
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

