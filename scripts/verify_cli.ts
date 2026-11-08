import './mainnet/lib';
process.argv.splice(2, 0);
await import('../packages/verify/src/cli');
