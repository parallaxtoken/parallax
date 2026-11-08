// The wallet SDK probes IndexedDB while the server renders client components. That is a browser-only
// API: the rejection is expected and harmless on the server, and must not take the function down.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (/indexedDB/i.test(msg)) return;
    console.error('unhandledRejection', msg);
  });
}
