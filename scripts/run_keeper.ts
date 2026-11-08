// Local launcher: loads .env.local, then starts the keeper loop and its status server.
import '../scripts/mainnet/lib';
await import('../services/keeper/src/index');
