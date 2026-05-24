import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('[ClínicaFlow API] Fatal error during startup:', err);
  process.exit(1);
});
