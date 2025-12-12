import UserIcon from './UserIcon';

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
}

export default function UserList({ users, unreadCounts, onUserClick }: UserListProps) {
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
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 py-1 px-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={`Click to view user info${user.isAdmin ? ' (Admin)' : ''}${user.isIdle ? ' (Idle)' : ''}`}
          >
            <UserIcon iconId={user.iconId} size={16} />
            <span className={`truncate flex-1 ${user.isIdle ? 'opacity-60 italic' : ''}`}>
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
