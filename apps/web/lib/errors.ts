import { decodeErrorResult, parseAbi } from 'viem';
import { dec } from './format';

const abi = parseAbi([
  'error NotOwner()',
  'error NotOpen()',
  'error Expired()',
  'error BadParams()',
  'error WrapperNotAllowed()',
  'error RouterNotAllowed()',
  'error UnitPaused()',
  'error ShareFloor(uint256 got, uint256 min)',
  'error SellFloor(uint256 gotUsdt, uint256 minUsdt)',
  'error RouteFailed()',
  'error TokenIsUsdt()',
]);

/** Turns a contract revert into the sentence a first-time buyer can act on. */
export function explainRevert(data: `0x${string}` | undefined, fallback = 'The transaction would fail.'): string {
  if (!data || data === '0x') return fallback;
  try {
    const e = decodeErrorResult({ abi, data });
    switch (e.errorName) {
      case 'ShareFloor': {
        const [got, min] = e.args as [bigint, bigint];
        return `This would have given you ${dec(got.toString(), 4)} shares; you asked for at least ${dec(min.toString(), 4)}.`;
      }
      case 'SellFloor': {
        const [got, min] = e.args as [bigint, bigint];
        return `This sale would have paid ${dec(got.toString(), 2)} USDT; your floor is ${dec(min.toString(), 2)} USDT.`;
      }
      case 'UnitPaused': return 'The issuer has paused this token for a corporate action. Nothing was sent.';
      case 'NotOpen': return 'This order is no longer open: it was filled or cancelled.';
      case 'Expired': return 'This order has expired.';
      case 'WrapperNotAllowed': return 'That wrapper is not allowed for this order.';
      case 'RouterNotAllowed': return 'That route is not on the allowlist.';
      case 'NotOwner': return 'Only the order owner can do that.';
      default: return `The contract refused: ${e.errorName}.`;
    }
  } catch {
    return fallback;
  }
}
