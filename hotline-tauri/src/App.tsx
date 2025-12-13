import { useAppStore } from './stores/appStore';
import TrackerWindow from './components/tracker/TrackerWindow';
import ServerWindow from './components/server/ServerWindow';
import { useDarkMode } from './hooks/useDarkMode';

function App() {
  // Initialize dark mode management
  useDarkMode();
  
  const { focusedServer, serverInfo, setFocusedServer } = useAppStore();

  const currentServer = focusedServer ? serverInfo.get(focusedServer) : null;

  return (
    <div className="h-screen w-screen bg-gray-100 dark:bg-gray-900">
      {/* Main tracker window */}
      {!focusedServer && <TrackerWindow />}

      {/* Server window */}
      {focusedServer && currentServer && (
        <ServerWindow
          serverId={focusedServer}
          serverName={currentServer.name}
          onClose={() => setFocusedServer(null)}
        />
      )}
    </div>
  );
}

export default App;
