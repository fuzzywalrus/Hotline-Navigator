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

  if (e.includes('Banned')) {
    return {
      category: 'auth',
      title: 'Banned',
      message: 'You have been banned from this server.',
      suggestion: 'Contact the server administrator.',
      rawError: e,
    };
  }

  if (e.includes('Server is full')) {
    return {
      category: 'auth',
      title: 'Server Full',
      message: 'The server has no available slots.',
      suggestion: 'Try again later.',
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

  if (e.includes('Download failed') || e.includes('Upload failed')) {
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
