import { parseAbi } from 'viem';

export const bookAbi = parseAbi([
  'function orders(uint256) view returns (address owner, uint8 side, uint8 status, uint32 wrapperMask, uint64 deadline, bytes32 tickerId, uint128 amount, uint128 limit)',
  'function nextId() view returns (uint256)',
  'function fill(uint256 id, uint256 wrapperIdx, address router, bytes routeData)',
  'function registry() view returns (address)',
  'event OrderPlaced(uint256 indexed id, address indexed owner, bytes32 indexed tickerId, uint8 side, uint256 amount, uint256 limit, uint64 deadline, uint32 wrapperMask)',
  'event OrderFilled(uint256 indexed id, address indexed wrapper, uint256 tokenAmount, uint256 unitWad, uint256 shares, uint256 usdt, address router, address filler)',
  'event OrderCancelled(uint256 indexed id)',
  'error NotOpen()',
  'error Expired()',
  'error WrapperNotAllowed()',
  'error RouterNotAllowed()',
  'error UnitPaused()',
  'error ShareFloor(uint256 got, uint256 min)',
  'error SellFloor(uint256 gotUsdt, uint256 minUsdt)',
  'error RouteFailed()',
]);
