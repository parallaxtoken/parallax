// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IWrapperRegistry} from "./interfaces/IWrapperRegistry.sol";

/// @title ParallaxBook
/// @notice Standing orders for tokenized stocks, enforced in shares. The owner signs a limit once; anyone may
///         fill it through an allowlisted router; the contract reads the wrapper unit itself in the fill
///         transaction and reverts if fewer share-equivalents (buy) or less USDT per share (sell) arrive.
///         Wrappers quote. Shares decide.
contract ParallaxBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;

    enum Side {
        BUY,
        SELL
    }

    uint8 internal constant OPEN = 0;
    uint8 internal constant FILLED = 1;
    uint8 internal constant CANCELLED = 2;

    struct Order {
        address owner;
        Side side;
        uint8 status;
        uint32 wrapperMask; // bit i allows IWrapperRegistry.Issuer(i)
        uint64 deadline;
        bytes32 tickerId;
        uint128 amount; // BUY: USDT in; SELL: shares to sell (WAD)
        uint128 limit; // BUY: minimum share-equivalents out (WAD); SELL: minimum USDT per share (WAD)
    }

    IERC20 public immutable USDT;
    IWrapperRegistry public immutable registry;

    mapping(uint256 id => Order) public orders;
    uint256 public nextId;

    event OrderPlaced(
        uint256 indexed id,
        address indexed owner,
        bytes32 indexed tickerId,
        Side side,
        uint256 amount,
        uint256 limit,
        uint64 deadline,
        uint32 wrapperMask
    );
    event OrderFilled(
        uint256 indexed id,
        address indexed wrapper,
        uint256 tokenAmount,
        uint256 unitWad,
        uint256 shares,
        uint256 usdt,
        address router,
        address filler
    );
    event OrderCancelled(uint256 indexed id);

    error NotOwner();
    error NotOpen();
    error Expired();
    error BadParams();
    error WrapperNotAllowed();
    error RouterNotAllowed();
    error UnitPaused();
    error ShareFloor(uint256 got, uint256 min);
    error SellFloor(uint256 gotUsdt, uint256 minUsdt);
    error RouteFailed();
    error TokenIsUsdt();

    constructor(IERC20 usdt, IWrapperRegistry registry_) {
        USDT = usdt;
        registry = registry_;
    }

    // ------------------------------------------------------------------ owner actions

    /// @param payAmount USDT to spend (18 decimals on BSC)
    /// @param minShares minimum share-equivalents to receive, WAD
    function placeBuy(bytes32 tickerId, uint128 payAmount, uint128 minShares, uint64 deadline, uint32 wrapperMask)
        external
        returns (uint256 id)
    {
        if (payAmount == 0 || minShares == 0 || wrapperMask == 0 || deadline <= block.timestamp) revert BadParams();
        if (registry.wrapperCount(tickerId) == 0) revert BadParams();
        id = _store(Side.BUY, tickerId, payAmount, minShares, deadline, wrapperMask);
    }

    /// @param shares share-equivalents to sell (WAD)
    /// @param minUsdtPerShare per-share USDT floor (WAD)
    function placeSell(bytes32 tickerId, uint128 shares, uint128 minUsdtPerShare, uint64 deadline, uint32 wrapperMask)
        external
        returns (uint256 id)
    {
        if (shares == 0 || minUsdtPerShare == 0 || wrapperMask == 0 || deadline <= block.timestamp) revert BadParams();
        if (registry.wrapperCount(tickerId) == 0) revert BadParams();
        id = _store(Side.SELL, tickerId, shares, minUsdtPerShare, deadline, wrapperMask);
    }

    function cancel(uint256 id) external {
        Order storage o = orders[id];
        if (o.owner != msg.sender) revert NotOwner();
        if (o.status != OPEN) revert NotOpen();
        o.status = CANCELLED;
        emit OrderCancelled(id);
    }

    // ------------------------------------------------------------------ fill

    /// @notice Anyone may fill. The unit is read here from the registry, never passed in.
    /// @param wrapperIdx index in the registry list for the order ticker
    /// @param router allowlisted router that will be called with routeData
    /// @param routeData calldata for the router; output must be sent to address(this)
    function fill(uint256 id, uint256 wrapperIdx, address router, bytes calldata routeData) external nonReentrant {
        Order storage o = orders[id];
        if (o.status != OPEN) revert NotOpen();
        if (block.timestamp > o.deadline) revert Expired();

        IWrapperRegistry.Wrapper memory w = registry.wrapperAt(o.tickerId, wrapperIdx);
        if (!w.active || w.instantOnly || (o.wrapperMask & (uint32(1) << uint8(w.issuer))) == 0) {
            revert WrapperNotAllowed();
        }
        if (!registry.isRouter(router)) revert RouterNotAllowed();
        if (w.token == address(USDT)) revert TokenIsUsdt();
        if (registry.isPaused(w.token)) revert UnitPaused();

        o.status = FILLED; // effects before interactions (T8)
        uint256 unit = registry.sharesPerToken(w.token); // T3: read in this transaction

        if (o.side == Side.BUY) {
            _fillBuy(id, o, w.token, unit, router, routeData);
        } else {
            _fillSell(id, o, w.token, unit, router, routeData);
        }
    }

    // ------------------------------------------------------------------ internals

    function _store(Side side, bytes32 tickerId, uint128 amount, uint128 limit, uint64 deadline, uint32 mask)
        internal
        returns (uint256 id)
    {
        id = nextId++;
        orders[id] = Order({
            owner: msg.sender,
            side: side,
            status: OPEN,
            wrapperMask: mask,
            deadline: deadline,
            tickerId: tickerId,
            amount: amount,
            limit: limit
        });
        emit OrderPlaced(id, msg.sender, tickerId, side, amount, limit, deadline, mask);
    }

    function _fillBuy(uint256 id, Order storage o, address token, uint256 unit, address router, bytes calldata data)
        internal
    {
        address owner = o.owner;
        uint256 pay = o.amount;
        uint256 usdtBefore = USDT.balanceOf(address(this));
        uint256 tokBefore = IERC20(token).balanceOf(address(this));

        USDT.safeTransferFrom(owner, address(this), pay);
        USDT.forceApprove(router, pay);
        _call(router, data);
        USDT.forceApprove(router, 0);

        uint256 tokensOut = IERC20(token).balanceOf(address(this)) - tokBefore;
        uint256 shares = (tokensOut * unit) / WAD; // T1: share-equivalents, never raw tokens
        if (shares < o.limit) revert ShareFloor(shares, o.limit); // T2

        IERC20(token).safeTransfer(owner, tokensOut); // T7: owner is the only recipient
        uint256 leftover = USDT.balanceOf(address(this)) - usdtBefore;
        if (leftover != 0) USDT.safeTransfer(owner, leftover);

        emit OrderFilled(id, token, tokensOut, unit, shares, pay - leftover, router, msg.sender);
    }

    function _fillSell(uint256 id, Order storage o, address token, uint256 unit, address router, bytes calldata data)
        internal
    {
        address owner = o.owner;
        // tokens needed to deliver `shares` share-equivalents, rounded up so the owner never sells fewer shares
        uint256 tokensIn = (uint256(o.amount) * WAD + unit - 1) / unit;
        uint256 usdtBefore = USDT.balanceOf(address(this));
        uint256 tokBefore = IERC20(token).balanceOf(address(this));

        IERC20(token).safeTransferFrom(owner, address(this), tokensIn);
        IERC20(token).forceApprove(router, tokensIn);
        _call(router, data);
        IERC20(token).forceApprove(router, 0);

        uint256 usdtOut = USDT.balanceOf(address(this)) - usdtBefore;
        uint256 minUsdt = (uint256(o.amount) * o.limit) / WAD;
        if (usdtOut < minUsdt) revert SellFloor(usdtOut, minUsdt); // T2b

        USDT.safeTransfer(owner, usdtOut);
        uint256 tokLeft = IERC20(token).balanceOf(address(this)) - tokBefore;
        uint256 sold = tokensIn - tokLeft;
        if (tokLeft != 0) IERC20(token).safeTransfer(owner, tokLeft);

        emit OrderFilled(id, token, sold, unit, (sold * unit) / WAD, usdtOut, router, msg.sender);
    }

    function _call(address router, bytes calldata data) internal {
        (bool ok,) = router.call(data);
        if (!ok) revert RouteFailed();
    }
}
