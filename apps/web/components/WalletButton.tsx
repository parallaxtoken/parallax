'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Power } from 'lucide-react';
import { useDisconnect } from 'wagmi';

export function WalletButton() {
  const { disconnect } = useDisconnect();
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        if (!mounted) return <span className="skeleton inline-block h-9 w-32" aria-hidden />;
        if (!account || !chain) {
          return (
            <button onClick={openConnectModal} className="rounded-[14px] bg-[#F4EFE5] px-4 py-2 text-sm font-medium text-[#16130E] transition hover:-translate-y-0.5">
              <span className="max-[380px]:hidden">Connect wallet</span>
              <span className="min-[381px]:hidden">Connect</span>
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button onClick={openChainModal} className="rounded-[14px] bg-gross px-4 py-2 text-sm font-medium text-white">
              Switch to BNB Chain
            </button>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-2 rounded-[12px] bg-white/10 px-3 py-1.5 font-mono text-xs text-[#F4EFE5]">
              <span className="size-2 rounded-full bg-net" aria-hidden />
              {account.displayName}
            </span>
            <button onClick={() => disconnect()} className="grid size-9 place-items-center rounded-[12px] bg-white/10 text-[#F4EFE5] transition hover:bg-white/20" aria-label="Disconnect wallet">
              <Power size={16} />
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
