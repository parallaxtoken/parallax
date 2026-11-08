// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// bStocks: ERC-8056 scaled UI amount token with a pause manager.
interface IBStock {
    function uiMultiplier() external view returns (uint256);
    function pauseManager() external view returns (address);
}

/// Ondo GM token: no unit on the token, a pause manager only.
interface IOndoToken {
    function tokenPauseManager() external view returns (address);
}

/// Ondo SyntheticSharesOracle.
interface ISyntheticSharesOracle {
    function getSValue(address asset) external view returns (uint128 sValue, bool paused);
}

interface IPauseManager {
    function isTokenPaused(address token) external view returns (bool);
}

/// xStocks (BackedAutoFeeToken): rebasing balance, already denominated in share units.
interface IXStock {
    function isPaused() external view returns (bool);
}
