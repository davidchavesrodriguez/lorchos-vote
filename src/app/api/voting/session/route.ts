import {
  createVotingSession,
  createVotingSessionId,
  serializeLegacyVotingSessionCookieDeletion,
  serializeVotingSessionCookie,
} from '@/lib/voting-session';
import {
  exchangeVotingToken,
  hasValidVotingTokenStructure,
} from '@/lib/voting-session-exchange';
import { getVotingAppOrigin } from '@/lib/voting-url';

const MAXIMUM_REQUEST_BYTES = 1_024;
const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

function jsonResponse(
  status: string,
  responseStatus: number,
  sessionId?: string,
): Response {
  return Response.json(
    sessionId ? { status, sessionId } : { status },
    { status: responseStatus, headers: RESPONSE_HEADERS },
  );
}

function hasExpectedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!origin || !host) {
    return false;
  }

  try {
    const expectedOrigin = getVotingAppOrigin();
    const suppliedOrigin = new URL(origin);
    const expectedHost = new URL(expectedOrigin).host;

    return (
      suppliedOrigin.origin === expectedOrigin &&
      host.toLowerCase() === expectedHost.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasExpectedOrigin(request)) {
    return jsonResponse('invalidRequest', 403);
  }

  const contentLength = Number(request.headers.get('content-length'));

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAXIMUM_REQUEST_BYTES
  ) {
    return jsonResponse('invalidRequest', 413);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse('invalidRequest', 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Object.keys(body).length !== 1 ||
    !('token' in body) ||
    !hasValidVotingTokenStructure(body.token)
  ) {
    return jsonResponse('invalid', 400);
  }

  try {
    const credentialId = await exchangeVotingToken(body.token);
    body = null;

    if (!credentialId) {
      return jsonResponse('invalid', 401);
    }

    const sessionId = createVotingSessionId();
    const response = jsonResponse('success', 200, sessionId);
    response.headers.append(
      'Set-Cookie',
      serializeVotingSessionCookie(
        sessionId,
        createVotingSession(sessionId, credentialId),
      ),
    );
    response.headers.append(
      'Set-Cookie',
      serializeLegacyVotingSessionCookieDeletion(),
    );

    return response;
  } catch (error) {
    body = null;
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Voting session exchange failed (${errorName})`);
    return jsonResponse('unavailable', 503);
  }
}
