// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Base, IPancakeSmartRouter} from "./Base.t.sol";
import {ParallaxBook} from "../src/ParallaxBook.sol";
import {WrapperRegistry} from "../src/WrapperRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Random sequences of place / cancel / fill / replay. T2, T6 and T8 must hold after every call.
contract Handler is Test {
    address internal constant USDT_ADDR = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant PCS_ROUTER = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4;
    address internal constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    uint24 internal constant FEE = 500;

    ParallaxBook public immutable book;
    WrapperRegistry public immutable registry;
    address public immutable user;
    bytes32 internal immutable NVDA = keccak256("NVDA");

    uint256[] public ids;
    mapping(uint256 => bool) public everFilled;
    uint256 public fills;
    uint256 public refusals;
    uint256 public violations;

    constructor(ParallaxBook b, WrapperRegistry r, address u) {
        book = b;
        registry = r;
        user = u;
    }

    function place(uint256 payRaw, uint256 floorRaw) external {
        uint256 pay = bound(payRaw, 5 ether, 200 ether);
        uint256 floorShares = bound(floorRaw, 1, 1 ether);
        vm.prank(user);
        ids.push(book.placeBuy(NVDA, uint128(pay), uint128(floorShares), uint64(block.timestamp + 1 days), 7));
    }

    function cancel(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(user);
        try book.cancel(ids[seed % ids.length]) {} catch {}
    }

    function fill(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        (,, uint8 status,,,, uint128 pay, uint128 limit) = book.orders(id);
        uint256 tokBefore = IERC20(NVDAB).balanceOf(user);
        bytes memory data = abi.encodeCall(
            IPancakeSmartRouter.exactInputSingle,
            (IPancakeSmartRouter.ExactInputSingleParams(USDT_ADDR, NVDAB, FEE, address(book), pay, 0, 0))
        );
        try book.fill(id, 0, PCS_ROUTER, data) {
            fills++;
            if (everFilled[id] || status != 0) violations++; // T8: exactly once, only from open
            everFilled[id] = true;
            uint256 shares = ((IERC20(NVDAB).balanceOf(user) - tokBefore) * registry.sharesPerToken(NVDAB)) / 1e18;
            if (shares < limit) violations++; // T2
        } catch {
            refusals++;
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }
}

contract ParallaxInvariants is StdInvariant, Base {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(book, registry, user);
        targetContract(address(handler));
    }

    function invariant_bookHoldsNothing() public view {
        assertEq(usdt.balanceOf(address(book)), 0, "usdt residual");
        assertEq(IERC20(NVDAB).balanceOf(address(book)), 0, "token residual");
    }

    function invariant_floorAndExactlyOnce() public view {
        assertEq(handler.violations(), 0, "T2 / T8 violated");
    }
}
