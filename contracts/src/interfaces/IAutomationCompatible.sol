// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Chainlink Automation Compatible Interface
 * @notice Minimal interface for Chainlink Automation (formerly Keepers)
 */
interface AutomationCompatibleInterface {
    /**
     * @notice Called by Chainlink nodes to check if upkeep is needed
     * @param checkData Arbitrary data passed from the registration
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Data to pass to performUpkeep
     */
    function checkUpkeep(bytes calldata checkData)
        external
        view
        returns (bool upkeepNeeded, bytes memory performData);

    /**
     * @notice Called by Chainlink nodes when upkeep is needed
     * @param performData Data returned by checkUpkeep
     */
    function performUpkeep(bytes calldata performData) external;
}
