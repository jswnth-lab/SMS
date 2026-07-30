import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth';
import inviteRoutes from './invites';
import meRoutes from './me';

const app = new Hono();

// Dev CORS: the web app and Expo's web dev server run on different
// origins/ports than the API. `credentials: true` is what lets the
// browser actually send/receive the better-auth session cookie
// cross-origin - the bearer-token path from mobile doesn't need cookies
// at all, but the web app does.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim());
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// better-auth handles its own routing under /api/auth/* (sign-up, sign-in,
// sign-out, session, etc.) - see src/auth.ts for the adapter/config.
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Invite-only registration: admin creates an invite, invitee redeems it.
app.route('/', inviteRoutes);

// GET /me: who am I, and which school(s)/role(s) do I belong to.
app.route('/', meRoutes);

app.get('/', (c) => c.json({ message: 'Hello from API' }));

export default app;
