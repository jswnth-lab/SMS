import { serve } from '@hono/node-server';
import app from './index';

const port = parseInt(process.env.API_PORT || '3001', 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`🚀 API running at http://localhost:${info.port}`);
  }
);
