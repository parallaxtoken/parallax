// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IWrapperRegistry {
    enum Issuer {
        BSTOCKS,
        ONDO,
        XSTOCKS
    }

    struct Wrapper {
        address token;
        Issuer issuer;
        bool instantOnly;
        bool active;
    }

    function wrapperCount(bytes32 tickerId) external view returns (uint256);

    function wrapperAt(bytes32 tickerId, uint256 index) external view returns (Wrapper memory);

    function isRouter(address router) external view returns (bool);

    /// Shares per one raw token unit (WAD), read from the issuer unit source in this call.
    function sharesPerToken(address token) external view returns (uint256);

    /// True when the issuer unit source or pause manager reports a pause for this token.
    function isPaused(address token) external view returns (bool);
}
