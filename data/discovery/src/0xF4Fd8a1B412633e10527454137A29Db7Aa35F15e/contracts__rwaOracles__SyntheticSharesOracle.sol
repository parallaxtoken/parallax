// SPDX-License-Identifier: BUSL-1.1
/*

      ▄▄█████████▄
   ╓██▀└ ,╓▄▄▄, '▀██▄
  ██▀ ▄██▀▀╙╙▀▀██▄ └██µ           ,,       ,,      ,     ,,,            ,,,
 ██ ,██¬ ▄████▄  ▀█▄ ╙█▄      ▄███▀▀███▄   ███▄    ██  ███▀▀▀███▄    ▄███▀▀███,
██  ██ ╒█▀'   ╙█▌ ╙█▌ ██     ▐██      ███  █████,  ██  ██▌    └██▌  ██▌     └██▌
██ ▐█▌ ██      ╟█  █▌ ╟█     ██▌      ▐██  ██ └███ ██  ██▌     ╟██ j██       ╟██
╟█  ██ ╙██    ▄█▀ ▐█▌ ██     ╙██      ██▌  ██   ╙████  ██▌    ▄██▀  ██▌     ,██▀
 ██ "██, ╙▀▀███████████⌐      ╙████████▀   ██     ╙██  ███████▀▀     ╙███████▀`
  ██▄ ╙▀██▄▄▄▄▄,,,                ¬─                                    '─¬
   ╙▀██▄ '╙╙╙▀▀▀▀▀▀▀▀
      ╙▀▀██████R⌐

 */

pragma solidity 0.8.16;

import "contracts/rwaOracles/ISyntheticSharesOracle.sol";
import "contracts/external/openzeppelin/contracts/access/AccessControlEnumerable.sol";

/**
 * @title  SyntheticSharesOracle
 * @author Ondo Finance
 * @notice This contract stores synthetic shares multipliers (aka sValues) for Ondo Global Markets
 *         (GM) assets. This is intended to be combined with a stock price oracle to calculate the
 *         current GM asset price.
 *
 *         The contract supports regular, small shifts to sValue via submitUpdate, which constrains
 *         the sValue change within allowed drift bounds and enforces a cooldown period between
 *         updates. Larger sValue changes are supported via scheduleCorporateActionPause, which
 *         provides a mechanism to schedule large changes to the sValues. Additionally, scheduled
 *         corporate actions trigger a "pause" flag to be returned, indicating to oracles that
 *         further price updates should be paused until an Ondo operator has manually verified the
 *         price has stabilized and price updates are ready to resume.
 * @dev    All sValues are denominated in 18 decimals. For example, a multiplier of 1.25e18
 *         indicates the asset price is calculated as stockPrice * 1.25.
 */
contract SyntheticSharesOracle is
  ISyntheticSharesOracle,
  AccessControlEnumerable
{
  /// Basis points for percentage calculations
  uint256 private constant BASIS_POINTS = 10_000;

  /// Role that performs nominal updates within the drift window (e.g., 1% per 24 hours)
  bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

  /// Lower bound for the minimum pause duration, denoted in seconds
  uint256 public constant MIN_PAUSE_DURATION_LOWER_BOUND = 600;

  /// Minimum duration for a corporate action pause to be in effect, denoted in seconds
  uint256 public minimumPauseDuration;

  /// Asset configurations and current sValues
  mapping(address => Asset) public assetData;

  /**
   * @param admin                 The address granted the DEFAULT_ADMIN_ROLE
   * @param setter                The address granted the SETTER_ROLE
   * @param _minimumPauseDuration Minimum duration for a corporate action pause to be in
   *                              effect, denoted in seconds (e.g., 7200 for 2 hours)
   */
  constructor(address admin, address setter, uint256 _minimumPauseDuration) {
    if (admin == address(0) || setter == address(0)) revert ZeroAddress();

    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(SETTER_ROLE, setter);

    if (_minimumPauseDuration < MIN_PAUSE_DURATION_LOWER_BOUND)
      revert MinimumPauseDurationTooLow();
    minimumPauseDuration = _minimumPauseDuration;
  }

  /**
   * @notice Called by users to retrieve the current sValue (synthetic shares multiplier) for an
   *         asset
   * @param  asset  Contract address of the asset
   * @return sValue The current sValue (synthetic shares multiplier) of the asset, denoted
   *                in 18 decimals
   * @return paused True if the asset is currently paused for a corporate action, false otherwise
   * @dev    If the asset is not found, the function will revert.
   */
  function getSValue(
    address asset
  ) external view returns (uint128 sValue, bool paused) {
    return _getSValue(asset);
  }

  /**
   * @notice Called by users to retrieve the current sValue (synthetic shares multiplier) for a
   *         batch of assets
   * @param  assets  Array of contract addresses of assets
   * @return sValues Array of current sValues (synthetic shares multipliers) of the assets,
   *                 denoted in 18 decimals
   * @return paused  Array of pause states. True if the asset is currently paused for a corporate
   *                 action, false otherwise.
   * @dev    If an asset is not found, the function will revert.
   */
  function getSValueBatch(
    address[] calldata assets
  ) external view returns (uint128[] memory sValues, bool[] memory paused) {
    sValues = new uint128[](assets.length);
    paused = new bool[](assets.length);

    for (uint256 i = 0; i < assets.length; i++) {
      (sValues[i], paused[i]) = _getSValue(assets[i]);
    }
  }

  function _getSValue(
    address asset
  ) internal view returns (uint128 sValue, bool paused) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();

    sValue = a.sValue;
    paused = _isPauseActive(a);
  }

  /**
   * @notice Called by admins to add a new asset to the oracle. Emits an AssetAdded event.
   * @param  asset            Contract address of the asset to add
   * @param  initialSValue    The initial sValue (synthetic shares multiplier) of the asset, denoted
   *                          in 18 decimals
   * @param  allowedDriftBps  Amount the sValue can increase each drift period, denoted in basis
   *                          points (e.g., 100 for 1%)
   * @param  driftCooldown    Period in seconds until the sValue can be updated again, denoted in
   *                          seconds (e.g., 86400 for 24 hours)
   *
   * @dev    An allowedDriftBps of 0 disables the submitUpdate flow for this asset.
   */
  function addAsset(
    address asset,
    uint128 initialSValue,
    uint16 allowedDriftBps,
    uint48 driftCooldown
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (initialSValue == 0) revert InitialSValueMustBePositive();
    if (driftCooldown == 0) revert DriftCooldownPeriodMustBePositive();
    if (allowedDriftBps > BASIS_POINTS)
      revert AllowedDriftBpsCannotExceed100Percent();

    if (assetData[asset].sValue != 0) revert AssetAlreadyExists();

    assetData[asset] = Asset({
      sValue: initialSValue,
      lastUpdate: block.timestamp,
      pauseStartTime: 0,
      pendingSValue: 0,
      allowedDriftBps: allowedDriftBps,
      driftCooldown: driftCooldown
    });

    emit AssetAdded(asset, initialSValue, allowedDriftBps, driftCooldown);
  }

  /**
   * @notice Called by admins to remove an asset from the oracle. Emits an AssetRemoved event.
   * @param  asset Contract address of the asset to remove
   */
  function removeAsset(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (assetData[asset].sValue == 0) revert AssetNotFound();
    delete assetData[asset];
    emit AssetRemoved(asset);
  }

  /**
   * @notice Called by setters to submit a new sValue for an asset. Emits an SValueUpdated event.
   * @param  asset  Contract address of the asset
   * @param  sValue New sValue (synthetic shares multiplier) for the asset, denoted in 18 decimals
   * @dev    The new sValue must be greater than the current sValue. The maximum allowed drift is
   *         allowedDriftBps / 10_000.
   *
   *         If the drift exceeds the allowed rate, the function will revert.
   *         If an sValue was updated within the last driftCooldown seconds, the function will
   *         revert.
   *         If the asset is currently paused for a corporate action, the function will revert.
   *         However, if a corporate action is scheduled but not yet in effect, the update will be
   *         allowed.
   */
  function submitUpdate(
    address asset,
    uint128 sValue
  ) public onlyRole(SETTER_ROLE) {
    Asset storage a = assetData[asset];
    uint256 currentSValue = a.sValue;
    if (currentSValue == 0) revert AssetNotFound();

    if (_isPauseActive(a)) revert PausedForSpecialCorporateActionWindow();
    if (block.timestamp < a.lastUpdate + a.driftCooldown)
      revert SValueUpdatedTooRecently();
    if (uint256(sValue) <= currentSValue)
      revert NewSValueMustBeGreaterThanCurrent();

    // Drift check: do not allow changes exceeding allowedDriftBps / BASIS_POINTS
    uint256 allowedDelta = (currentSValue * a.allowedDriftBps) / BASIS_POINTS;
    uint256 maxAllowed = currentSValue + allowedDelta;
    if (uint256(sValue) > maxAllowed) revert DriftExceedsAllowedRate();

    a.sValue = sValue;
    a.lastUpdate = block.timestamp;

    emit SValueUpdated(asset, currentSValue, sValue);
  }

  /**
   * @notice Called by setters to submit a new sValue for a batch of assets. Emits an SValueUpdated
   *         event for each asset.
   * @param  assets  Array of contract addresses of assets
   * @param  sValues Array of new sValues (synthetic shares multipliers) for the assets, denoted in
   *                  18 decimals
   */
  function submitUpdateBatch(
    address[] calldata assets,
    uint128[] calldata sValues
  ) external onlyRole(SETTER_ROLE) {
    if (assets.length != sValues.length) revert LengthMismatch();
    for (uint256 i; i < assets.length; i++) {
      submitUpdate(assets[i], sValues[i]);
    }
  }

  /**
   * @notice Called by admins to schedule a corporate action pause for an asset. Emits a
   *         CorporateActionScheduled event.
   * @param  asset          Contract address of the asset
   * @param  sValue         New sValue (synthetic shares multiplier) for the asset, denoted in
   *                        18 decimals (must be nonzero)
   * @param  pauseStartTime Start time of the corporate action pause
   * @dev    The pause window is considered in effect after the pause start time has passed.
   *         If the pause start time is 0, it is treated as starting now.
   *         If the pause start time is in the past, it will be rejected.
   *
   *         Note that the "pausing" has no onchain effect; this is simply a way to signal to users
   *         to pause further updates until the corporate action is applied.
   *
   *         Call unpause to apply the pendingSValue and clear the pause.
   */
  function scheduleCorporateActionPause(
    address asset,
    uint128 sValue,
    uint256 pauseStartTime
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();
    if (sValue == 0) revert PendingSValueMustBePositive();

    if (_isPauseActive(a)) {
      revert CannotSchedulePauseWhileActive();
    }

    // Handle zero pause start time as "start now"
    uint256 effectivePauseTime = pauseStartTime == 0
      ? block.timestamp
      : pauseStartTime;

    // Revert if pause time is in the past
    if (effectivePauseTime < block.timestamp) {
      revert PauseStartTimeInPast();
    }

    a.pauseStartTime = effectivePauseTime;
    a.pendingSValue = sValue;

    emit CorporateActionScheduled(asset, sValue, effectivePauseTime);
  }

  /**
   * @notice Called by admins to unpause an asset. Emits a CorporateActionApplied event.
   * @param  asset Contract address of the asset
   * @dev    Once called, the pending sValue is applied and the pause is considered to be ended.
   *         Internally, the pauseStartTime and pendingSValue are reset to 0.
   */
  function unpause(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();
    if (a.pauseStartTime == 0) revert NoPauseScheduled();
    if (block.timestamp < a.pauseStartTime) revert PauseNotYetStarted();

    if (block.timestamp < a.pauseStartTime + minimumPauseDuration)
      revert MinimumPauseDurationNotMet();

    emit CorporateActionApplied(asset, a.sValue, a.pendingSValue);

    // Apply pending S value and unpause the asset
    a.sValue = a.pendingSValue;
    a.lastUpdate = block.timestamp;
    a.pendingSValue = 0;
    a.pauseStartTime = 0;
  }

  /**
   * @notice Called by admins to cancel a scheduled corporate action pause for an asset. Emits a
   *         CorporateActionCancelled event.
   * @param  asset Contract address of the asset
   * @dev    Internally, the pauseStartTime and pendingSValue are reset to 0.
   */
  function cancelScheduledPause(
    address asset
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();
    if (a.pauseStartTime == 0) revert NoPauseScheduled();

    if (_isPauseActive(a)) {
      revert CannotCancelPauseWhileActive();
    }

    a.pauseStartTime = 0;
    a.pendingSValue = 0;

    emit CorporateActionCancelled(asset);
  }

  /**
   * @notice Called by admins to abort an active pause. Emits a CorporateActionCancelled event.
   * @param  asset Contract address of the asset
   * @dev    This function cancels a pause that is currently active, resetting the pauseStartTime
   *         and pendingSValue to 0. The previously scheduled sValue is discarded.
   */
  function abortPause(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();
    if (a.pauseStartTime == 0) revert NoPauseScheduled();

    if (!_isPauseActive(a)) {
      revert CannotAbortInactivePause();
    }

    a.pauseStartTime = 0;
    a.pendingSValue = 0;

    emit CorporateActionCancelled(asset);
  }

  /**
   * @notice Called by admins to adjust an active pause. Emits a CorporateActionScheduled event.
   * @param  asset  Contract address of the asset
   * @param  sValue New sValue (synthetic shares multiplier) for the asset, denoted in 18 decimals
   * @dev    This function modifies a pause that is currently active, updating the pendingSValue
   *         and fast-forwarding the pauseStartTime to now to ensure the minimumPauseDuration is
   *         respected.
   */
  function adjustPause(
    address asset,
    uint128 sValue
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];
    if (a.sValue == 0) revert AssetNotFound();
    if (a.pauseStartTime == 0) revert NoPauseScheduled();
    if (sValue == 0) revert PendingSValueMustBePositive();

    if (!_isPauseActive(a)) {
      revert CannotAdjustInactivePause();
    }

    // Fast-forward pause start time to now to ensure minimumPauseDuration is respected
    a.pauseStartTime = block.timestamp;
    a.pendingSValue = sValue;

    emit CorporateActionScheduled(asset, sValue, block.timestamp);
  }

  /**
   * @notice Called by admins to set drift parameters for an asset. Emits a
   *         DriftParametersUpdated event.
   * @param  asset           Contract address of the asset
   * @param  allowedDriftBps Amount the sValue can increase each drift period, denoted in basis
   *                         points (e.g., 100 for 1%)
   * @param  driftCooldown   Period in seconds until the sValue can be updated again, denoted in
   *                         seconds (e.g., 86400 for 24 hours)
   */
  function setDriftParameters(
    address asset,
    uint16 allowedDriftBps,
    uint48 driftCooldown
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    Asset storage a = assetData[asset];

    if (a.sValue == 0) revert AssetNotFound();
    if (allowedDriftBps > BASIS_POINTS)
      revert AllowedDriftBpsCannotExceed100Percent();
    if (driftCooldown == 0) revert DriftCooldownPeriodMustBePositive();

    emit DriftParametersUpdated(
      asset,
      a.allowedDriftBps,
      allowedDriftBps,
      a.driftCooldown,
      driftCooldown
    );

    a.allowedDriftBps = allowedDriftBps;
    a.driftCooldown = driftCooldown;
  }

  /**
   * @notice Called by admins to set the minimum duration for a corporate action pause to be in
   *         effect. Emits a MinimumPauseDurationUpdated event.
   * @param  _minimumPauseDuration Minimum duration for a corporate action pause to be in
   *                               effect, denoted in seconds (e.g., 7200 for 2 hours)
   */
  function setMinimumPauseDuration(
    uint256 _minimumPauseDuration
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    if (_minimumPauseDuration < MIN_PAUSE_DURATION_LOWER_BOUND)
      revert MinimumPauseDurationTooLow();
    emit MinimumPauseDurationUpdated(
      minimumPauseDuration,
      _minimumPauseDuration
    );
    minimumPauseDuration = _minimumPauseDuration;
  }

  function _isPauseActive(Asset storage a) internal view returns (bool) {
    return a.pauseStartTime > 0 && block.timestamp >= a.pauseStartTime;
  }
}
