export type ErrorCategory =
  | 'dns'
  | 'timeout'
  | 'refused'
  | 'tls'
  | 'protocol'
  | 'auth'
  | 'transfer'
  | 'cancelled'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  title: string;
  message: string;
  suggestion: string;
  rawError: string;
}

export function classifyError(rawError: string): ClassifiedError {
  const e = String(rawError);

  if (e.includes('cancelled')) {
    return {
      category: 'cancelled',
      title: 'Cancelled',
      message: 'The connection attempt was cancelled.',
      suggestion: '',
      rawError: e,
    };
  }

  if (e.includes('Cannot connect to tracker') || (e.includes('tracker') && !e.includes('Failed to connect to tracker'))) {
    return {
      category: 'protocol',
      title: 'Wrong Connection Type',
      message: 'This is a tracker, not a server.',
      suggestion: 'Click on the tracker to expand it and browse its servers.',
      rawError: e,
    };
  }

  if (e.includes('nodename nor servname provided') || e.includes('not known') || e.includes('Name or service not known')) {
    return {
      category: 'dns',
      title: 'Server Not Found',
      message: 'The server address could not be resolved.',
      suggestion: 'Check the address for typos and make sure you have an internet connection.',
      rawError: e,
    };
  }

  if (e.includes('Connection refused') || e.includes('connection refused')) {
    return {
      category: 'refused',
      title: 'Connection Refused',
      message: 'The server refused the connection.',
      suggestion: 'The server may be offline or the port may be incorrect.',
      rawError: e,
    };
  }

  if (e.includes('timed out') || e.includes('timeout') || e.includes('Timed Out')) {
    return {
      category: 'timeout',
      title: 'Connection Timed Out',
      message: 'The server did not respond in time.',
      suggestion: 'The server may be down or unreachable. Check your connection and try again.',
      rawError: e,
    };
  }

  if (e.includes('TLS handshake') || e.includes('tls handshake')) {
    return {
      category: 'tls',
      title: 'TLS Error',
      message: 'Could not establish a secure connection.',
      suggestion: 'Try toggling TLS off, or check that the server supports encrypted connections.',
      rawError: e,
    };
  }

  if (e.includes('Invalid handshake') || e.includes('early eof') || e.includes('Handshake failed') || e.includes('tracker magic')) {
    return {
      category: 'protocol',
      title: 'Protocol Error',
      message: 'The server did not respond with a valid Hotline protocol.',
      suggestion: 'This may be a tracker — try expanding it instead of connecting. Or the server may be running a different service on this port.',
      rawError: e,
    };
  }

  if (e.includes('Banned') || e.includes('banned from')) {
    return {
      category: 'auth',
      title: 'Banned',
      message: 'You have been banned from this server.',
      suggestion: 'Contact the server administrator.',
      rawError: e,
    };
  }

  if (e.includes('Server is full') || e.includes('maximum user limit')) {
    return {
      category: 'auth',
      title: 'Server Full',
      message: 'The server has no available slots.',
      suggestion: 'Try again later.',
      rawError: e,
    };
  }

  if (e.includes('Already logged in')) {
    return {
      category: 'auth',
      title: 'Already Connected',
      message: 'You are already connected to this server.',
      suggestion: 'Disconnect your other session first, or try a different account.',
      rawError: e,
    };
  }

  if (e.includes('Access denied') || e.includes('lack the required permissions')) {
    return {
      category: 'auth',
      title: 'Access Denied',
      message: 'You do not have permission to perform this action.',
      suggestion: 'Contact the server administrator to request access.',
      rawError: e,
    };
  }

  if (e.includes('Invalid login') || e.includes('rejected login') || e.includes('Login failed')) {
    return {
      category: 'auth',
      title: 'Login Rejected',
      message: 'The server rejected the login credentials.',
      suggestion: 'Check your username and password in the bookmark settings.',
      rawError: e,
    };
  }

  if (e.includes('File or folder not found') || e.includes('FileNotFound')) {
    return {
      category: 'transfer',
      title: 'File Not Found',
      message: 'The requested file or folder does not exist on the server.',
      suggestion: 'The file may have been moved or deleted. Refresh the file list.',
      rawError: e,
    };
  }

  if (e.includes('File is in use')) {
    return {
      category: 'transfer',
      title: 'File In Use',
      message: 'The file is currently being accessed by another user.',
      suggestion: 'Wait a moment and try again.',
      rawError: e,
    };
  }

  if (e.includes('Disk is full') || e.includes('disk is full')) {
    return {
      category: 'transfer',
      title: 'Disk Full',
      message: 'The server has run out of disk space.',
      suggestion: 'Contact the server administrator.',
      rawError: e,
    };
  }

  if (e.includes('refused private messages') || e.includes('MsgRefused')) {
    return {
      category: 'auth',
      title: 'Message Refused',
      message: 'The recipient has refused private messages.',
      suggestion: 'This user has private messages disabled.',
      rawError: e,
    };
  }

  if (e.includes('News database is full') || e.includes('NewsFull')) {
    return {
      category: 'protocol',
      title: 'News Full',
      message: 'The server news database cannot accept more posts.',
      suggestion: 'Contact the server administrator.',
      rawError: e,
    };
  }

  if (e.includes('Download failed') || e.includes('Upload failed') || e.includes('File transfer failed')) {
    return {
      category: 'transfer',
      title: 'Transfer Failed',
      message: 'The file transfer could not be completed.',
      suggestion: 'Try the transfer again. The server may have disconnected.',
      rawError: e,
    };
  }

  // Extract useful detail from "Failed to connect: ..." wrapper if present
  const connectMatch = e.match(/Failed to connect: (.+)/);
  const detail = connectMatch?.[1] || '';

  return {
    category: 'unknown',
    title: 'Connection Failed',
    message: detail
      ? `An error occurred: ${detail}`
      : 'An unexpected error occurred.',
    suggestion: 'Try again. If the problem persists, check the server address and port.',
    rawError: e,
  };
}
