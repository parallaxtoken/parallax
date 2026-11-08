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

export const registryAbi = parseAbi(['function wrapperCount(bytes32) view returns (uint256)', 'function isRouter(address) view returns (bool)']);

export const v3QuoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
export const v3FactoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
export const v3RouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);
export const v2RouterAbi = parseAbi([
  'function getAmountsOut(uint256,address[]) view returns (uint256[])',
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)',
]);
export const v2FactoryAbi = parseAbi(['function getPair(address,address) view returns (address)']);

export const PANCAKE = {
  V3_FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  V3_QUOTER: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
  V3_ROUTER: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  V2_FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  V2_ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
} as const;
export const V3_FEES = [100, 500, 2500, 10000] as const;
