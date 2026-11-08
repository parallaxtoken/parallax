// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IWrapperRegistry} from "./interfaces/IWrapperRegistry.sol";
import {IBStock, IOndoToken, ISyntheticSharesOracle, IPauseManager, IXStock} from "./interfaces/IUnitSources.sol";

/// @title WrapperRegistry
/// @notice Owner-curated map of tokenized-stock wrappers per ticker, with the on-chain unit readers that
///         turn a raw token amount into share-equivalents. Every change carries a provenance hash.
contract WrapperRegistry is IWrapperRegistry, Ownable2Step {
    uint256 internal constant WAD = 1e18;

    ISyntheticSharesOracle public ondoOracle;
    mapping(bytes32 tickerId => Wrapper[]) private _wrappers;
    mapping(address token => Issuer) public issuerOf;
    mapping(address token => bool) public known;
    mapping(address router => bool) public isRouter;

    event WrapperAdded(
        bytes32 indexed tickerId, address indexed token, Issuer issuer, bool instantOnly, bytes32 provenance
    );
    event WrapperActive(bytes32 indexed tickerId, address indexed token, bool active, bytes32 provenance);
    event RouterSet(address indexed router, bool allowed, bytes32 provenance);
    event OracleSet(address indexed oracle, bytes32 provenance);

    error UnknownWrapper();
    error DuplicateWrapper();
    error ZeroAddress();
    error UnitUnreadable(address token);

    constructor(address owner_, address ondoOracle_, bytes32 provenance) Ownable(owner_) {
        ondoOracle = ISyntheticSharesOracle(ondoOracle_);
        emit OracleSet(ondoOracle_, provenance);
    }

    // ------------------------------------------------------------------ curation

    function setOracle(address oracle, bytes32 provenance) external onlyOwner {
        if (oracle == address(0)) revert ZeroAddress();
        ondoOracle = ISyntheticSharesOracle(oracle);
        emit OracleSet(oracle, provenance);
    }

    function addWrapper(bytes32 tickerId, address token, Issuer issuer, bool instantOnly, bytes32 provenance)
        external
        onlyOwner
    {
        if (token == address(0)) revert ZeroAddress();
        if (known[token]) revert DuplicateWrapper();
        known[token] = true;
        issuerOf[token] = issuer;
        _wrappers[tickerId].push(Wrapper({token: token, issuer: issuer, instantOnly: instantOnly, active: true}));
        emit WrapperAdded(tickerId, token, issuer, instantOnly, provenance);
    }

    function setWrapperActive(bytes32 tickerId, uint256 index, bool active, bytes32 provenance) external onlyOwner {
        Wrapper storage w = _wrappers[tickerId][index];
        w.active = active;
        emit WrapperActive(tickerId, w.token, active, provenance);
    }

    function setRouter(address router, bool allowed, bytes32 provenance) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        isRouter[router] = allowed;
        emit RouterSet(router, allowed, provenance);
    }

    // ------------------------------------------------------------------ views

    function wrapperCount(bytes32 tickerId) external view returns (uint256) {
        return _wrappers[tickerId].length;
    }

    function wrapperAt(bytes32 tickerId, uint256 index) external view returns (Wrapper memory) {
        return _wrappers[tickerId][index];
    }

    /// @inheritdoc IWrapperRegistry
    function sharesPerToken(address token) public view returns (uint256 unit) {
        if (!known[token]) revert UnknownWrapper();
        Issuer i = issuerOf[token];
        if (i == Issuer.BSTOCKS) {
            unit = IBStock(token).uiMultiplier();
        } else if (i == Issuer.ONDO) {
            (uint128 s,) = ondoOracle.getSValue(token);
            unit = s;
        } else {
            unit = WAD; // xStocks balances are already share units
        }
        if (unit == 0) revert UnitUnreadable(token);
    }

    /// @inheritdoc IWrapperRegistry
    function isPaused(address token) public view returns (bool) {
        if (!known[token]) revert UnknownWrapper();
        Issuer i = issuerOf[token];
        if (i == Issuer.BSTOCKS) {
            return IPauseManager(IBStock(token).pauseManager()).isTokenPaused(token);
        }
        if (i == Issuer.ONDO) {
            (, bool oraclePaused) = ondoOracle.getSValue(token);
            if (oraclePaused) return true;
            return IPauseManager(IOndoToken(token).tokenPauseManager()).isTokenPaused(token);
        }
        return IXStock(token).isPaused();
    }
}
