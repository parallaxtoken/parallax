// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base, IUiToken, IPancakeSmartRouter} from "./Base.t.sol";
import {ParallaxBook} from "../src/ParallaxBook.sol";
import {IWrapperRegistry} from "../src/interfaces/IWrapperRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPm {
    function isTokenPaused(address token) external view returns (bool);
}

/// Naive token-denominated order used as the baseline for test_unitJump: it only checks raw tokens.
contract TokenFloorBaseline {
    function fill(address router, bytes calldata data, address token, uint256 minTokens) external returns (uint256 got) {
        uint256 b = IERC20(token).balanceOf(address(this));
        (bool ok,) = router.call(data);
        require(ok, "route");
        got = IERC20(token).balanceOf(address(this)) - b;
        require(got >= minTokens, "token floor");
    }
}

contract ParallaxBookTest is Base {
    // ---------------------------------------------------------------- happy path

    function test_buyFills() public {
        uint256 pay = 50 ether;
        uint256 expected = _quoteShares(pay);
        uint256 id = _placeBuy(pay, (expected * 995) / 1000);

        uint256 userUsdt = usdt.balanceOf(user);
        vm.prank(keeper);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));

        (,, uint8 status,,,,,) = book.orders(id);
        assertEq(status, 1, "filled");
        assertEq(userUsdt - usdt.balanceOf(user), pay, "spent exactly pay");
        uint256 got = IERC20(NVDAB).balanceOf(user);
        assertGt(got, 0, "owner holds tokens");
        assertGe((got * IUiToken(NVDAB).uiMultiplier()) / 1e18, (expected * 995) / 1000, "shares >= floor");
        _assertBookEmpty();
    }

    // ---------------------------------------------------------------- T2 share floor

    function test_shareFloorRevert() public {
        uint256 pay = 50 ether;
        uint256 expected = _quoteShares(pay);
        uint256 id = _placeBuy(pay, expected * 2); // impossible floor
        vm.expectPartialRevert(ParallaxBook.ShareFloor.selector);
        vm.prank(keeper);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
        (,, uint8 status,,,,,) = book.orders(id);
        assertEq(status, 0, "still open after revert");
    }

    // ---------------------------------------------------------------- break suite

    /// Unit falls (reverse split or fee): raw tokens look fine, share-equivalents do not.
    function test_unitJump() public {
        uint256 pay = 50 ether;
        uint256 expected = _quoteShares(pay);
        uint256 id = _placeBuy(pay, (expected * 995) / 1000);

        // Token-denominated baseline built on the same route would pass.
        TokenFloorBaseline base = new TokenFloorBaseline();
        deal(USDT_ADDR, address(base), pay);
        vm.prank(address(base));
        usdt.approve(PCS_ROUTER, pay);
        uint256 snap = vm.snapshotState();
        uint256 baselineGot = base.fill(
            PCS_ROUTER, _route(USDT_ADDR, NVDAB, FEE_NVDAB, address(base), pay), NVDAB, 1
        );
        assertGt(baselineGot, 0, "baseline fills on raw tokens");
        vm.revertToState(snap);

        // Drop the multiplier tenfold in storage: slot 1 of the proxy is the active multiplier.
        bytes32 slot = bytes32(uint256(1));
        uint256 current = uint256(vm.load(NVDAB, slot));
        assertEq(current, IUiToken(NVDAB).uiMultiplier(), "slot layout assumption");
        vm.store(NVDAB, slot, bytes32(current / 10));

        vm.expectPartialRevert(ParallaxBook.ShareFloor.selector);
        vm.prank(keeper);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
    }

    function test_corporatePauseBStock() public {
        uint256 id = _placeBuy(50 ether, 1);
        address pm = IUiToken(NVDAB).pauseManager();
        vm.mockCall(pm, abi.encodeCall(IPm.isTokenPaused, (NVDAB)), abi.encode(true));
        vm.expectRevert(ParallaxBook.UnitPaused.selector);
        vm.prank(keeper);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(50 ether));
    }

    function test_corporatePauseOndoOracle() public {
        vm.prank(user);
        uint256 id = book.placeBuy(NVDA, 50 ether, 1, uint64(block.timestamp + 1 days), 2); // ONDO only
        vm.mockCall(
            ONDO_ORACLE, abi.encodeWithSignature("getSValue(address)", NVDAON), abi.encode(uint128(1.0017e18), true)
        );
        vm.expectRevert(ParallaxBook.UnitPaused.selector);
        vm.prank(keeper);
        book.fill(id, 1, PCS_ROUTER, _route(USDT_ADDR, NVDAON, 10000, address(book), 50 ether));
    }

    function test_maliciousRecipient() public {
        uint256 pay = 50 ether;
        uint256 id = _placeBuy(pay, 1);
        bytes memory evil = _route(USDT_ADDR, NVDAB, FEE_NVDAB, attacker, pay);
        vm.expectPartialRevert(ParallaxBook.ShareFloor.selector);
        vm.prank(attacker);
        book.fill(id, 0, PCS_ROUTER, evil);
        assertEq(IERC20(NVDAB).balanceOf(attacker), 0, "attacker received nothing");
    }

    function test_sandwich() public {
        uint256 pay = 50 ether;
        uint256 expected = _quoteShares(pay);
        uint256 id = _placeBuy(pay, (expected * 999) / 1000); // tight floor: 10 bps

        // attacker pushes the pool price with a very large buy before the fill
        uint256 push = 20_000 ether;
        deal(USDT_ADDR, attacker, push);
        vm.startPrank(attacker);
        usdt.approve(PCS_ROUTER, push);
        IPancakeSmartRouter(PCS_ROUTER).exactInputSingle(
            IPancakeSmartRouter.ExactInputSingleParams(USDT_ADDR, NVDAB, FEE_NVDAB, attacker, push, 0, 0)
        );
        vm.stopPrank();

        vm.expectPartialRevert(ParallaxBook.ShareFloor.selector);
        vm.prank(attacker);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
    }

    function test_replay() public {
        uint256 pay = 20 ether;
        uint256 id = _placeBuy(pay, 1);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
        vm.expectRevert(ParallaxBook.NotOpen.selector);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
    }

    function test_unlistedRouter() public {
        uint256 id = _placeBuy(20 ether, 1);
        vm.expectRevert(ParallaxBook.RouterNotAllowed.selector);
        book.fill(id, 0, address(0xBEEF), _buyRoute(20 ether));
    }

    function test_wrongWrapper() public {
        vm.prank(user);
        uint256 id = book.placeBuy(NVDA, 20 ether, 1, uint64(block.timestamp + 1 days), 2); // ONDO only
        vm.expectRevert(ParallaxBook.WrapperNotAllowed.selector);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(20 ether)); // index 0 is bStocks
    }

    function test_instantOnlyExcluded() public {
        registry.setWrapperActive(NVDA, 0, false, keccak256("deactivate"));
        uint256 id = _placeBuy(20 ether, 1);
        vm.expectRevert(ParallaxBook.WrapperNotAllowed.selector);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(20 ether));
    }

    function test_expiredAndCancel() public {
        uint256 id = _placeBuy(20 ether, 1);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(ParallaxBook.Expired.selector);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(20 ether));

        uint256 id2 = _placeBuy(20 ether, 1);
        vm.prank(attacker);
        vm.expectRevert(ParallaxBook.NotOwner.selector);
        book.cancel(id2);
        vm.prank(user);
        book.cancel(id2);
        vm.expectRevert(ParallaxBook.NotOpen.selector);
        book.fill(id2, 0, PCS_ROUTER, _buyRoute(20 ether));
    }

    // ---------------------------------------------------------------- T6 no residual (fuzz)

    function testFuzz_noResidual(uint256 payRaw) public {
        uint256 pay = bound(payRaw, 5 ether, 2_000 ether);
        uint256 id = _placeBuy(pay, 1);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
        _assertBookEmpty();
    }

    /// T3: the only inputs of fill are id, index, router, data. Moving the unit source changes the outcome.
    function test_keeperCannotPassUnit() public {
        bytes4 sel = ParallaxBook.fill.selector;
        assertEq(sel, bytes4(keccak256("fill(uint256,uint256,address,bytes)")), "no unit argument");

        uint256 pay = 50 ether;
        uint256 expected = _quoteShares(pay);
        uint256 id = _placeBuy(pay, (expected * 995) / 1000);
        vm.store(NVDAB, bytes32(uint256(1)), bytes32(uint256(IUiToken(NVDAB).uiMultiplier()) / 2));
        vm.expectPartialRevert(ParallaxBook.ShareFloor.selector);
        book.fill(id, 0, PCS_ROUTER, _buyRoute(pay));
    }

    // ---------------------------------------------------------------- sell side (T2b)

    function _userHoldsNvdab(uint256 usdtIn) internal returns (uint256 tokens) {
        vm.startPrank(user);
        usdt.approve(PCS_ROUTER, usdtIn);
        tokens = IPancakeSmartRouter(PCS_ROUTER).exactInputSingle(
            IPancakeSmartRouter.ExactInputSingleParams(USDT_ADDR, NVDAB, FEE_NVDAB, user, usdtIn, 0, 0)
        );
        IERC20(NVDAB).approve(address(book), type(uint256).max);
        vm.stopPrank();
    }

    function test_sellFills() public {
        uint256 tokens = _userHoldsNvdab(500 ether);
        uint256 unit = IUiToken(NVDAB).uiMultiplier();
        uint256 sharesToSell = (tokens * unit) / 1e18 / 2;
        uint256 floor = 100 ether; // 100 USDT per share, far below market
        vm.prank(user);
        uint256 id = book.placeSell(NVDA, uint128(sharesToSell), uint128(floor), uint64(block.timestamp + 1 days), 7);

        uint256 tokensIn = (sharesToSell * 1e18 + unit - 1) / unit;
        uint256 usdtBefore = usdt.balanceOf(user);
        book.fill(id, 0, PCS_ROUTER, _route(NVDAB, USDT_ADDR, FEE_NVDAB, address(book), tokensIn));
        assertGt(usdt.balanceOf(user) - usdtBefore, (sharesToSell * floor) / 1e18, "paid above floor");
        _assertBookEmpty();
    }

    function test_sellFloorRevert() public {
        uint256 tokens = _userHoldsNvdab(500 ether);
        uint256 unit = IUiToken(NVDAB).uiMultiplier();
        uint256 sharesToSell = (tokens * unit) / 1e18 / 2;
        vm.prank(user);
        uint256 id =
            book.placeSell(NVDA, uint128(sharesToSell), uint128(10_000 ether), uint64(block.timestamp + 1 days), 7);
        uint256 tokensIn = (sharesToSell * 1e18 + unit - 1) / unit;
        vm.expectPartialRevert(ParallaxBook.SellFloor.selector);
        book.fill(id, 0, PCS_ROUTER, _route(NVDAB, USDT_ADDR, FEE_NVDAB, address(book), tokensIn));
    }

    // ---------------------------------------------------------------- helpers

    function _assertBookEmpty() internal view {
        assertEq(usdt.balanceOf(address(book)), 0, "usdt residual");
        assertEq(IERC20(NVDAB).balanceOf(address(book)), 0, "token residual");
    }
}
