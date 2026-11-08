/**SPDX-License-Identifier: BUSL-1.1

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

interface ISyntheticSharesOracle {
  /**
   * @notice Asset struct
   * @param  sValue          The current sValue of the asset
   * @param  pendingSValue   The pending sValue of the asset, if a corporate action is scheduled
   * @param  lastUpdate      The last time the asset was updated
   * @param  pauseStartTime  The start time of the pause window, if a corporate action is scheduled
   * @param  allowedDriftBps The drift denoted in basis points (e.g., 100 for 1%)
   * @param  driftCooldown   The time required to wait before updating the sValue again, denoted in
   *                         seconds (e.g., 86400 for 24 hours)
   * @dev    pendingSValue and pauseStartTime will be set to 0 if no corporate action is scheduled.
   */
  struct Asset {
    uint128 sValue;
    uint128 pendingSValue;
    uint256 lastUpdate;
    uint256 pauseStartTime;
    uint16 allowedDriftBps;
    uint48 driftCooldown;
  }

  /**
   * @notice Drift parameters updated event
   * @param  asset              Contract address of the asset
   * @param  oldAllowedDriftBps Old drift denoted in basis points (e.g., 100 for 1%)
   * @param  newAllowedDriftBps New drift denoted in basis points (e.g., 100 for 1%)
   * @param  oldDriftCooldown   Old time required to wait before updating the sValue again, denoted
   *                            in seconds (e.g., 86400 for 24 hours)
   * @param  newDriftCooldown   New time required to wait before updating the sValue again, denoted
   *                            in seconds (e.g., 86400 for 24 hours)
   */
  event DriftParametersUpdated(
    address indexed asset,
    uint256 oldAllowedDriftBps,
    uint256 newAllowedDriftBps,
    uint256 oldDriftCooldown,
    uint256 newDriftCooldown
  );

  /**
   * @notice Minimum pause duration updated event
   * @param  oldDuration Old minimum pause duration
   * @param  newDuration New minimum pause duration
   * @dev    The duration is denoted in seconds.
   */
  event MinimumPauseDurationUpdated(uint256 oldDuration, uint256 newDuration);

  /**
   * @notice SValue updated event
   * @param  asset     Contract address of the asset
   * @param  oldSValue Old sValue (synthetic shares multiplier) for the asset, denoted in 18
   *                   decimals.
   * @param  newSValue New sValue (synthetic shares multiplier) for the asset, denoted in 18
   *                   decimals.
   */
  event SValueUpdated(
    address indexed asset,
    uint256 oldSValue,
    uint256 newSValue
  );

  /**
   * @notice Corporate action scheduled event
   * @param  asset          Contract address of the asset
   * @param  sValue         Scheduled sValue (synthetic shares multiplier) for the asset, denoted in
   *                        18 decimals.
   * @param  pauseStartTime Start time of the corporate action pause
   * @dev    The pause window is considered in effect after the pause start time.
   *         Note that the "pausing" has no onchain effect; this is simply a way to signal to the
   *         offchain oracle to pause further updates until the corporate action is applied.
   */
  event CorporateActionScheduled(
    address indexed asset,
    uint128 sValue,
    uint256 pauseStartTime
  );

  /**
   * @notice Corporate action applied event
   * @param  asset     Contract address of the asset
   * @param  oldSValue Old sValue (synthetic shares multiplier) for the asset, denoted in 18
   *                   decimals.
   * @param  newSValue New sValue (synthetic shares multiplier) for the asset, denoted in 18
   *                   decimals.
   */
  event CorporateActionApplied(
    address indexed asset,
    uint128 oldSValue,
    uint128 newSValue
  );

  /**
   * @notice Corporate action cancelled event
   * @param  asset Contract address of the asset
   */
  event CorporateActionCancelled(address indexed asset);

  /**
   * @notice Asset added event
   * @param  asset           Contract address of the asset
   * @param  initialSValue   Initial sValue (synthetic shares multiplier) for the asset, denoted in
   *                         18 decimals.
   * @param  allowedDriftBps Amount the sValue can increase each drift period, denoted in basis
   *                         points (e.g., 100 for 1%)
   * @param  driftCooldown   Time required to wait before updating the sValue again, denoted in
   *                         seconds (e.g., 86400 for 24 hours)
   */
  event AssetAdded(
    address indexed asset,
    uint256 initialSValue,
    uint256 allowedDriftBps,
    uint256 driftCooldown
  );

  /**
   * @notice Asset removed event
   * @param  asset Contract address of the asset
   */
  event AssetRemoved(address indexed asset);

  /// Error emitted when attempting to access an asset that does not exist
  error AssetNotFound();

  /// Error emitted when the initial sValue is zero
  error InitialSValueMustBePositive();

  /// Error emitted when the drift cooldown period is zero
  error DriftCooldownPeriodMustBePositive();

  /// Error emitted when the allowed drift basis points exceeds 100%
  error AllowedDriftBpsCannotExceed100Percent();

  /// Error emitted when attempting to add an asset that already exists
  error AssetAlreadyExists();

  /// Error emitted when attempting to schedule a pause with a zero pending sValue
  error PendingSValueMustBePositive();

  /// Error emitted when the pause time is in the past
  error PauseStartTimeInPast();

  /// Error emitted when attempting to update an asset during a corporate action pause
  error PausedForSpecialCorporateActionWindow();

  /// Error emitted when attempting to update sValue before the cooldown period has elapsed
  error SValueUpdatedTooRecently();

  /// Error emitted when the new sValue is not greater than the current sValue
  error NewSValueMustBeGreaterThanCurrent();

  /// Error emitted when the sValue change exceeds the allowed drift rate
  error DriftExceedsAllowedRate();

  /// Error emitted when the length of assets array does not match the length of sValues array
  error LengthMismatch();

  /// Error emitted when attempting to cancel a pause that is not scheduled
  error NoPauseScheduled();

  /// Error emitted when attempting to unpause before the pause start time
  error PauseNotYetStarted();

  /// Error emitted when attempting to unpause before the minimum pause duration has elapsed
  error MinimumPauseDurationNotMet();

  /// Error emitted when attempting to set minimum pause duration to less than the lower bound
  error MinimumPauseDurationTooLow();

  /// Error emitted when attempting to schedule a pause while a pause is already active
  error CannotSchedulePauseWhileActive();

  /// Error emitted when attempting to cancel a pause while a pause is already active
  error CannotCancelPauseWhileActive();

  /// Error emitted when attempting to abort a pause that is not active
  error CannotAbortInactivePause();

  /// Error emitted when attempting to adjust a pause that is not active
  error CannotAdjustInactivePause();

  /// Error emitted when attempting to create a synthetic shares oracle with a zero address
  error ZeroAddress();

  function getSValue(
    address asset
  ) external view returns (uint128 sValue, bool paused);

  function getSValueBatch(
    address[] calldata assets_
  ) external view returns (uint128[] memory sValues, bool[] memory paused);
}
