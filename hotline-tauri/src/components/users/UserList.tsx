import UserIcon, { UserBanner } from './UserIcon';

interface User {
  userId: number;
  userName: string;
  iconId: number;
  flags: number;
  isAdmin: boolean;
  isIdle: boolean;
}

interface UserListProps {
  users: User[];
  unreadCounts: Map<number, number>;
  onUserClick: (user: User) => void;
  onUserRightClick?: (user: User, event: React.MouseEvent) => void;
  onOpenMessageDialog?: (user: User) => void;
}

export default function UserList({ users, unreadCounts, onUserClick, onUserRightClick }: UserListProps) {
  return (
    <div className="p-2">
      <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 px-2">
        Users ({users.length})
      </h2>
      <div className="space-y-1">
        {users.map((user) => (
          <div
            key={user.userId}
            onClick={() => onUserClick(user)}
            onContextMenu={(e) => onUserRightClick?.(user, e)}
            className={`relative flex items-center gap-2 text-sm py-1 px-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors overflow-hidden ${
              user.isIdle
                ? 'opacity-50 text-gray-500 dark:text-gray-500'
                : user.isAdmin
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
            }`}
            title={`Click to message${user.isAdmin ? ' (Admin)' : ''}${user.isIdle ? ' (Idle)' : ''} | Right-click for menu`}
          >
            <UserBanner iconId={user.iconId} />
            <UserIcon iconId={user.iconId} size={16} />
            <span className={`truncate flex-1 ${user.isIdle ? 'italic' : ''}`}>
              {user.userName}
            </span>
            {user.isAdmin && (
              <div className="bg-yellow-500 text-white text-xs font-bold rounded px-1" title="Admin">
                A
              </div>
            )}
            {unreadCounts.get(user.userId) ? (
              <div className="bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCounts.get(user.userId)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
