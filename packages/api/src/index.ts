import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.json({ message: 'Hello from API' }));

export default app;
