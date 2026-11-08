// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ParallaxBook} from "../src/ParallaxBook.sol";
import {WrapperRegistry} from "../src/WrapperRegistry.sol";
import {IWrapperRegistry} from "../src/interfaces/IWrapperRegistry.sol";

interface IPancakeSmartRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IUiToken {
    function uiMultiplier() external view returns (uint256);
    function pauseManager() external view returns (address);
}

/// Shared fixture: BSC mainnet fork, the NVDA wrappers from data/discovery/e1_wrapper_map.json, the
/// PancakeSwap v3 SmartRouter, and a user with USDT.
abstract contract Base is Test {
    address internal constant USDT_ADDR = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant PCS_ROUTER = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4;
    address internal constant ONDO_ORACLE = 0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e;
    // data/discovery/e1_wrapper_map.json
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant NVDAON = 0xA9eE28C80f960B889dFbd1902055218cBa016F75;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    uint24 internal constant FEE_NVDAB = 500;

    bytes32 internal immutable NVDA = keccak256("NVDA");

    WrapperRegistry internal registry;
    ParallaxBook internal book;
    IERC20 internal usdt = IERC20(USDT_ADDR);

    address internal user = makeAddr("user");
    address internal keeper = makeAddr("keeper");
    address internal attacker = makeAddr("attacker");

    function setUp() public virtual {
        vm.createSelectFork(vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed1.defibit.io")));
        registry = new WrapperRegistry(address(this), ONDO_ORACLE, keccak256("test"));
        registry.addWrapper(NVDA, NVDAB, IWrapperRegistry.Issuer.BSTOCKS, false, keccak256("e1"));
        registry.addWrapper(NVDA, NVDAON, IWrapperRegistry.Issuer.ONDO, false, keccak256("e1"));
        registry.addWrapper(NVDA, NVDAX, IWrapperRegistry.Issuer.XSTOCKS, false, keccak256("e1"));
        registry.setRouter(PCS_ROUTER, true, keccak256("pancake-v3-smart-router"));
        book = new ParallaxBook(usdt, registry);

        deal(USDT_ADDR, user, 1_000_000 ether);
        vm.prank(user);
        usdt.approve(address(book), type(uint256).max);
    }

    function _route(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeCall(
            IPancakeSmartRouter.exactInputSingle,
            (IPancakeSmartRouter.ExactInputSingleParams(tokenIn, tokenOut, fee, recipient, amountIn, 0, 0))
        );
    }

    function _buyRoute(uint256 usdtIn) internal view returns (bytes memory) {
        return _route(USDT_ADDR, NVDAB, FEE_NVDAB, address(book), usdtIn);
    }

    /// Quote in share-equivalents by performing the swap on a snapshot, then reverting it.
    function _quoteShares(uint256 usdtIn) internal returns (uint256 shares) {
        uint256 snap = vm.snapshotState();
        deal(USDT_ADDR, address(this), usdtIn);
        usdt.approve(PCS_ROUTER, usdtIn);
        uint256 tokens = IPancakeSmartRouter(PCS_ROUTER).exactInputSingle(
            IPancakeSmartRouter.ExactInputSingleParams(USDT_ADDR, NVDAB, FEE_NVDAB, address(this), usdtIn, 0, 0)
        );
        shares = (tokens * IUiToken(NVDAB).uiMultiplier()) / 1e18;
        vm.revertToState(snap);
    }

    function _placeBuy(uint256 usdtIn, uint256 minShares) internal returns (uint256 id) {
        vm.prank(user);
        id = book.placeBuy(NVDA, uint128(usdtIn), uint128(minShares), uint64(block.timestamp + 1 days), 7);
    }
}
