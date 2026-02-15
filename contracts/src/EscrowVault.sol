// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title EscrowVault
 * @notice x402-compatible escrow contract for USDC payments
 * @dev Supports gasless deposits via ERC-3009 receiveWithAuthorization
 *
 * State Machine:
 *   None → Active → Completed (buyer release)
 *                 → AutoReleased (timeout)
 *                 → Disputed → Resolved (arbiter split)
 *                 → Refunded (seller voluntary / arbiter)
 */
contract EscrowVault is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    // ──────────────────────────── Types ────────────────────────────

    enum EscrowState {
        None,
        Active,
        DeliveryConfirmed,
        Completed,
        AutoReleased,
        Disputed,
        Resolved,
        Refunded
    }

    struct Escrow {
        bytes32 orderId;
        address buyer;
        address seller;
        uint256 amount;
        string serviceType;
        EscrowState state;
        uint256 createdAt;
        uint256 releaseWindow; // seconds from creation for auto-release
        uint256 deliveryConfirmedAt;
        uint256 disputeWindow; // seconds from delivery confirmation for disputes
    }

    // ──────────────────────────── State ────────────────────────────

    IERC20 public immutable usdc;
    address public arbiter;

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) public escrows;

    uint256 public constant DEFAULT_DISPUTE_WINDOW = 3 days;

    struct Stats {
        uint256 totalEscrows;
        uint256 totalAmount;
        uint256 completedCount;    // releaseFunds + autoRelease
        uint256 completedAmount;
        uint256 disputedCount;
        uint256 disputedAmount;
        uint256 resolvedCount;
        uint256 refundedCount;
        uint256 refundedAmount;
    }

    mapping(address => Stats) public sellerStats;
    mapping(address => Stats) public buyerStats;
    mapping(string => Stats) public serviceStats;

    // ──────────────────────────── Events ───────────────────────────

    event EscrowCreated(
        uint256 indexed escrowId,
        bytes32 indexed orderId,
        address indexed buyer,
        address seller,
        uint256 amount,
        string serviceType
    );
    event DeliveryConfirmed(uint256 indexed escrowId);
    event EscrowReleased(uint256 indexed escrowId, address releasedBy);
    event EscrowAutoReleased(uint256 indexed escrowId);
    event EscrowDisputed(uint256 indexed escrowId, address disputedBy);
    event DisputeResolved(uint256 indexed escrowId, uint256 buyerAmount, uint256 sellerAmount);
    event EscrowRefunded(uint256 indexed escrowId);
    event ArbiterChanged(address indexed oldArbiter, address indexed newArbiter);

    // ──────────────────────────── Errors ───────────────────────────

    error InvalidAmount();
    error InvalidAddress();
    error InvalidState(EscrowState current, EscrowState expected);
    error NotBuyer();
    error NotSeller();
    error NotArbiter();
    error NotAuthorized();
    error ReleaseWindowNotPassed();
    error DisputeWindowExpired();
    error DisputeWindowActive();
    error DisputeWindowNotStarted();
    error InvalidPercentage();
    error ReleaseWindowTooShort();

    // ──────────────────────────── Constructor ──────────────────────

    constructor(address _usdc, address _arbiter) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        arbiter = _arbiter;
    }

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyBuyer(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].buyer) revert NotBuyer();
        _;
    }

    modifier onlySeller(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].seller) revert NotSeller();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert NotArbiter();
        _;
    }

    modifier inState(uint256 escrowId, EscrowState expected) {
        if (escrows[escrowId].state != expected) {
            revert InvalidState(escrows[escrowId].state, expected);
        }
        _;
    }

    // ──────────────────────── Create Escrow ───────────────────────

    /**
     * @notice Create escrow via ERC-3009 gasless deposit (receiveWithAuthorization)
     * @dev The buyer signs an EIP-712 authorization off-chain; the operator submits the tx
     */
    function createEscrowWithAuth(
        bytes32 orderId,
        address seller,
        uint256 amount,
        string calldata serviceType,
        uint256 releaseWindow,
        // ERC-3009 params
        address from,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused returns (uint256 escrowId) {
        if (amount == 0) revert InvalidAmount();
        if (seller == address(0) || from == address(0)) revert InvalidAddress();

        // Execute ERC-3009 receiveWithAuthorization: transfers USDC from buyer to this contract
        IERC3009(address(usdc)).receiveWithAuthorization(from, address(this), amount, validAfter, validBefore, authNonce, v, r, s);

        escrowId = _createEscrow(orderId, from, seller, amount, serviceType, releaseWindow);
    }

    /**
     * @notice Create escrow via standard approve + transferFrom
     * @dev Buyer must have approved this contract for `amount`
     */
    function createEscrow(
        bytes32 orderId,
        address seller,
        uint256 amount,
        string calldata serviceType,
        uint256 releaseWindow
    ) external whenNotPaused returns (uint256 escrowId) {
        if (amount == 0) revert InvalidAmount();
        if (seller == address(0)) revert InvalidAddress();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        escrowId = _createEscrow(orderId, msg.sender, seller, amount, serviceType, releaseWindow);
    }

    function _createEscrow(
        bytes32 orderId,
        address buyer,
        address seller,
        uint256 amount,
        string calldata serviceType,
        uint256 releaseWindow
    ) internal returns (uint256 escrowId) {
        if (buyer == seller) revert InvalidAddress();
        if (releaseWindow < DEFAULT_DISPUTE_WINDOW) revert ReleaseWindowTooShort();

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            orderId: orderId,
            buyer: buyer,
            seller: seller,
            amount: amount,
            serviceType: serviceType,
            state: EscrowState.Active,
            createdAt: block.timestamp,
            releaseWindow: releaseWindow,
            deliveryConfirmedAt: 0,
            disputeWindow: DEFAULT_DISPUTE_WINDOW
        });

        sellerStats[seller].totalEscrows++;
        sellerStats[seller].totalAmount += amount;
        buyerStats[buyer].totalEscrows++;
        buyerStats[buyer].totalAmount += amount;
        serviceStats[serviceType].totalEscrows++;
        serviceStats[serviceType].totalAmount += amount;

        emit EscrowCreated(escrowId, orderId, buyer, seller, amount, serviceType);
    }

    // ──────────────────────── Lifecycle ────────────────────────────

    /**
     * @notice Seller confirms delivery — starts dispute window
     */
    function confirmDelivery(uint256 escrowId) external onlySeller(escrowId) inState(escrowId, EscrowState.Active) {
        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.DeliveryConfirmed;
        e.deliveryConfirmedAt = block.timestamp;

        emit DeliveryConfirmed(escrowId);
    }

    /**
     * @notice Buyer releases funds to seller (can be called in Active or DeliveryConfirmed state)
     */
    function releaseFunds(uint256 escrowId) external onlyBuyer(escrowId) {
        Escrow storage e = escrows[escrowId];
        if (e.state != EscrowState.Active && e.state != EscrowState.DeliveryConfirmed) {
            revert InvalidState(e.state, EscrowState.Active);
        }

        e.state = EscrowState.Completed;

        sellerStats[e.seller].completedCount++;
        sellerStats[e.seller].completedAmount += e.amount;
        buyerStats[e.buyer].completedCount++;
        buyerStats[e.buyer].completedAmount += e.amount;
        serviceStats[e.serviceType].completedCount++;
        serviceStats[e.serviceType].completedAmount += e.amount;

        usdc.safeTransfer(e.seller, e.amount);

        emit EscrowReleased(escrowId, msg.sender);
    }

    /**
     * @notice Auto-release after release window has passed
     * @dev Anyone can call this after the timeout.
     *      For Active state: requires releaseWindow + disputeWindow to give buyer dispute opportunity.
     *      For DeliveryConfirmed state: requires releaseWindow passed AND dispute window expired.
     */
    function autoRelease(uint256 escrowId) external whenNotPaused {
        Escrow storage e = escrows[escrowId];
        if (e.state != EscrowState.Active && e.state != EscrowState.DeliveryConfirmed) {
            revert InvalidState(e.state, EscrowState.Active);
        }

        if (e.state == EscrowState.Active) {
            // For Active state, extend the window by disputeWindow to give buyer dispute opportunity
            if (block.timestamp < e.createdAt + e.releaseWindow + e.disputeWindow) {
                revert ReleaseWindowNotPassed();
            }
        } else {
            // DeliveryConfirmed state
            if (block.timestamp < e.createdAt + e.releaseWindow) {
                revert ReleaseWindowNotPassed();
            }
            if (block.timestamp < e.deliveryConfirmedAt + e.disputeWindow) {
                revert DisputeWindowActive();
            }
        }

        e.state = EscrowState.AutoReleased;

        sellerStats[e.seller].completedCount++;
        sellerStats[e.seller].completedAmount += e.amount;
        buyerStats[e.buyer].completedCount++;
        buyerStats[e.buyer].completedAmount += e.amount;
        serviceStats[e.serviceType].completedCount++;
        serviceStats[e.serviceType].completedAmount += e.amount;

        usdc.safeTransfer(e.seller, e.amount);

        emit EscrowAutoReleased(escrowId);
    }

    /**
     * @notice Buyer disputes — allowed from both Active and DeliveryConfirmed states
     * @dev For DeliveryConfirmed: must be within disputeWindow of delivery confirmation.
     *      For Active: must be within the extended window period (releaseWindow - disputeWindow to releaseWindow + disputeWindow).
     */
    function dispute(uint256 escrowId) external onlyBuyer(escrowId) {
        Escrow storage e = escrows[escrowId];

        if (e.state == EscrowState.DeliveryConfirmed) {
            if (block.timestamp > e.deliveryConfirmedAt + e.disputeWindow) {
                revert DisputeWindowExpired();
            }
        } else if (e.state == EscrowState.Active) {
            // For Active state, buyer can dispute in the extended window period
            if (block.timestamp < e.createdAt + e.releaseWindow - e.disputeWindow) {
                revert DisputeWindowNotStarted();
            }
            if (block.timestamp > e.createdAt + e.releaseWindow + e.disputeWindow) {
                revert DisputeWindowExpired();
            }
        } else {
            revert InvalidState(e.state, EscrowState.Active);
        }

        e.state = EscrowState.Disputed;

        sellerStats[e.seller].disputedCount++;
        sellerStats[e.seller].disputedAmount += e.amount;
        buyerStats[e.buyer].disputedCount++;
        buyerStats[e.buyer].disputedAmount += e.amount;
        serviceStats[e.serviceType].disputedCount++;
        serviceStats[e.serviceType].disputedAmount += e.amount;

        emit EscrowDisputed(escrowId, msg.sender);
    }

    /**
     * @notice Arbiter resolves dispute by splitting funds
     * @param buyerPct Percentage (0–100) to return to buyer
     */
    function resolveDispute(uint256 escrowId, uint256 buyerPct)
        external
        onlyArbiter
        inState(escrowId, EscrowState.Disputed)
    {
        if (buyerPct > 100) revert InvalidPercentage();

        Escrow storage e = escrows[escrowId];
        e.state = EscrowState.Resolved;

        sellerStats[e.seller].resolvedCount++;
        buyerStats[e.buyer].resolvedCount++;
        serviceStats[e.serviceType].resolvedCount++;

        uint256 buyerAmount = (e.amount * buyerPct) / 100;
        uint256 sellerAmount = e.amount - buyerAmount;

        if (buyerAmount > 0) {
            usdc.safeTransfer(e.buyer, buyerAmount);
        }
        if (sellerAmount > 0) {
            usdc.safeTransfer(e.seller, sellerAmount);
        }

        emit DisputeResolved(escrowId, buyerAmount, sellerAmount);
    }

    /**
     * @notice Refund buyer — seller voluntarily or arbiter-initiated
     */
    function refund(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.seller && msg.sender != arbiter) revert NotAuthorized();
        if (e.state != EscrowState.Active && e.state != EscrowState.DeliveryConfirmed && e.state != EscrowState.Disputed) {
            revert InvalidState(e.state, EscrowState.Active);
        }

        e.state = EscrowState.Refunded;

        sellerStats[e.seller].refundedCount++;
        sellerStats[e.seller].refundedAmount += e.amount;
        buyerStats[e.buyer].refundedCount++;
        buyerStats[e.buyer].refundedAmount += e.amount;
        serviceStats[e.serviceType].refundedCount++;
        serviceStats[e.serviceType].refundedAmount += e.amount;

        usdc.safeTransfer(e.buyer, e.amount);

        emit EscrowRefunded(escrowId);
    }

    // ──────────────────────── Pausable ──────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────── View Functions ──────────────────────

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function isReleasable(uint256 escrowId) external view returns (bool) {
        Escrow storage e = escrows[escrowId];
        if (e.state == EscrowState.Active) {
            // For Active state, require releaseWindow + disputeWindow
            if (block.timestamp < e.createdAt + e.releaseWindow + e.disputeWindow) {
                return false;
            }
            return true;
        } else if (e.state == EscrowState.DeliveryConfirmed) {
            if (block.timestamp < e.createdAt + e.releaseWindow) {
                return false;
            }
            if (block.timestamp < e.deliveryConfirmedAt + e.disputeWindow) {
                return false;
            }
            return true;
        }
        return false;
    }

    function getSellerStats(address seller) external view returns (Stats memory) {
        return sellerStats[seller];
    }

    function getBuyerStats(address buyer) external view returns (Stats memory) {
        return buyerStats[buyer];
    }

    function getServiceTypeStats(string calldata serviceType) external view returns (Stats memory) {
        return serviceStats[serviceType];
    }

    // ──────────────────────── Admin ───────────────────────────────

    function setArbiter(address _arbiter) external onlyOwner {
        address oldArbiter = arbiter;
        arbiter = _arbiter;
        emit ArbiterChanged(oldArbiter, _arbiter);
    }
}
