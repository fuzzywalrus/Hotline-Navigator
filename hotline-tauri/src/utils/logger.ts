type LogCategory =
  | 'Chat'
  | 'Users'
  | 'Files'
  | 'Transfer'
  | 'News'
  | 'Board'
  | 'Connection'
  | 'Banner'
  | 'Agreement'
  | 'Permissions'
  | 'Protocol'
  | 'HOPE';

const isDev = import.meta.env.DEV;

export function log(category: LogCategory, message: string, ...data: unknown[]): void {
  if (!isDev) return;
  if (data.length > 0) {
    console.log(`[${category}]`, message, ...data);
  } else {
    console.log(`[${category}]`, message);
  }
}

export function error(category: LogCategory, message: string, ...data: unknown[]): void {
  if (data.length > 0) {
    console.error(`[${category}]`, message, ...data);
  } else {
    console.error(`[${category}]`, message);
  }
}
