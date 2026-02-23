// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AutomationCompatibleInterface} from "./interfaces/IAutomationCompatible.sol";
import {EscrowVault} from "./EscrowVault.sol";

/**
 * @title AutoReleaseKeeper
 * @notice Chainlink Automation compatible contract for auto-releasing timed-out escrows
 * @dev Checks a batch of escrow IDs and auto-releases those that have passed their release window
 */
contract AutoReleaseKeeper is AutomationCompatibleInterface, Ownable {
    EscrowVault public immutable vault;
    uint256 public maxBatchSize;
    address public forwarder;

    uint256 public constant MAX_BATCH_SIZE_LIMIT = 100;

    error NotForwarder();
    error InvalidBatchSize();

    event MaxBatchSizeUpdated(uint256 oldSize, uint256 newSize);

    constructor(address _vault, uint256 _maxBatchSize) Ownable(msg.sender) {
        vault = EscrowVault(_vault);
        maxBatchSize = _maxBatchSize;
    }

    /**
     * @notice Check which escrows are ready for auto-release
     * @dev checkData encodes (uint256 startId, uint256 endId) range to scan
     */
    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        (uint256 startId, uint256 endId) = abi.decode(checkData, (uint256, uint256));

        uint256[] memory releasable = new uint256[](maxBatchSize);
        uint256 count = 0;

        for (uint256 i = startId; i <= endId && count < maxBatchSize; i++) {
            if (vault.isReleasable(i)) {
                releasable[count] = i;
                count++;
            }
        }

        if (count > 0) {
            // Trim array to actual size
            uint256[] memory toRelease = new uint256[](count);
            for (uint256 j = 0; j < count; j++) {
                toRelease[j] = releasable[j];
            }
            return (true, abi.encode(toRelease));
        }

        return (false, "");
    }

    /**
     * @notice Auto-release all escrows in the batch
     */
    function performUpkeep(bytes calldata performData) external override {
        if (forwarder != address(0) && msg.sender != forwarder) {
            revert NotForwarder();
        }

        uint256[] memory escrowIds = abi.decode(performData, (uint256[]));

        for (uint256 i = 0; i < escrowIds.length; i++) {
            // Skip if no longer releasable (state changed between check and perform)
            try vault.autoRelease(escrowIds[i]) {} catch {}
        }
    }

    function setForwarder(address _forwarder) external onlyOwner {
        forwarder = _forwarder;
    }

    function setMaxBatchSize(uint256 newSize) external onlyOwner {
        if (newSize == 0 || newSize > MAX_BATCH_SIZE_LIMIT) revert InvalidBatchSize();
        emit MaxBatchSizeUpdated(maxBatchSize, newSize);
        maxBatchSize = newSize;
    }
}
