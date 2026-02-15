// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title SessionEscrow
 * @notice Authorize-once, use-many session escrow for high-frequency micropayments
 * @dev Implements Issue #834 pattern: 1 signature for N API calls
 *
 * Flow:
 *   1. Buyer signs ERC-3009 authorization, deposits USDC into session
 *   2. Facilitator tracks off-chain usage per request
 *   3. Facilitator calls captureSession() to batch-settle used amounts
 *   4. settleSession() finalizes: captures remaining + refunds unused
 *   5. reclaimExpired() safety valve if facilitator disappears
 */
contract SessionEscrow is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    // ──────────────────────────── Types ────────────────────────────

    enum SessionState {
        None,
        Active,
        Settled,
        Expired
    }

    struct Session {
        address buyer;
        address seller;
        uint256 depositAmount;
        uint256 capturedAmount;
        uint256 createdAt;
        uint256 expiresAt;
        SessionState state;
    }

    // ──────────────────────────── State ────────────────────────────

    IERC20 public immutable usdc;
    address public facilitator;

    uint256 public nextSessionId = 1;
    mapping(uint256 => Session) public sessions;

    // ──────────────────────────── Events ───────────────────────────

    event SessionCreated(
        uint256 indexed sessionId,
        address indexed buyer,
        address seller,
        uint256 amount,
        uint256 expiresAt
    );
    event SessionCaptured(uint256 indexed sessionId, uint256 captureAmount, uint256 totalCaptured);
    event SessionSettled(uint256 indexed sessionId, uint256 capturedTotal, uint256 refundAmount);
    event SessionReclaimed(uint256 indexed sessionId, uint256 refundAmount);
    event FacilitatorChanged(address indexed oldFacilitator, address indexed newFacilitator);

    // ──────────────────────────── Errors ───────────────────────────

    error InvalidAmount();
    error InvalidAddress();
    error InvalidState(SessionState current, SessionState expected);
    error NotBuyer();
    error NotFacilitator();
    error SessionNotExpired();
    error CaptureExceedsDeposit();
    error InvalidDuration();

    // ──────────────────────────── Constructor ──────────────────────

    constructor(address _usdc, address _facilitator) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        facilitator = _facilitator;
    }

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyFacilitator() {
        if (msg.sender != facilitator) revert NotFacilitator();
        _;
    }

    modifier inState(uint256 sessionId, SessionState expected) {
        if (sessions[sessionId].state != expected) {
            revert InvalidState(sessions[sessionId].state, expected);
        }
        _;
    }

    // ──────────────────────── Create Session ───────────────────────

    /**
     * @notice Create session with gasless ERC-3009 deposit
     * @param seller Address of the service provider
     * @param amount Total deposit amount (max budget for the session)
     * @param duration Session duration in seconds
     */
    function createSessionWithAuth(
        address seller,
        uint256 amount,
        uint256 duration,
        // ERC-3009 params
        address from,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused returns (uint256 sessionId) {
        if (amount == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidDuration();
        if (seller == address(0) || from == address(0)) revert InvalidAddress();
        if (from == seller) revert InvalidAddress();

        // Execute ERC-3009 receiveWithAuthorization
        IERC3009(address(usdc)).receiveWithAuthorization(
            from, address(this), amount, validAfter, validBefore, authNonce, v, r, s
        );

        sessionId = nextSessionId++;
        sessions[sessionId] = Session({
            buyer: from,
            seller: seller,
            depositAmount: amount,
            capturedAmount: 0,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            state: SessionState.Active
        });

        emit SessionCreated(sessionId, from, seller, amount, block.timestamp + duration);
    }

    // ──────────────────────── Capture & Settle ────────────────────

    /**
     * @notice Facilitator captures usage (can be called multiple times)
     * @dev Transfers captured amount directly to seller
     */
    function captureSession(uint256 sessionId, uint256 amount)
        external
        onlyFacilitator
        inState(sessionId, SessionState.Active)
    {
        if (amount == 0) revert InvalidAmount();

        Session storage s = sessions[sessionId];
        if (s.capturedAmount + amount > s.depositAmount) revert CaptureExceedsDeposit();

        s.capturedAmount += amount;
        usdc.safeTransfer(s.seller, amount);

        emit SessionCaptured(sessionId, amount, s.capturedAmount);
    }

    /**
     * @notice Finalize session: capture remaining usage + refund unused
     * @param finalCaptureAmount Last batch of usage to capture (can be 0)
     */
    function settleSession(uint256 sessionId, uint256 finalCaptureAmount)
        external
        onlyFacilitator
        inState(sessionId, SessionState.Active)
    {
        Session storage s = sessions[sessionId];
        if (s.capturedAmount + finalCaptureAmount > s.depositAmount) revert CaptureExceedsDeposit();

        s.capturedAmount += finalCaptureAmount;
        s.state = SessionState.Settled;

        if (finalCaptureAmount > 0) {
            usdc.safeTransfer(s.seller, finalCaptureAmount);
        }
        uint256 refund = s.depositAmount - s.capturedAmount;
        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }

        emit SessionSettled(sessionId, s.capturedAmount, refund);
    }

    // ──────────────────────── Safety Valve ─────────────────────────

    /**
     * @notice Buyer reclaims uncaptured funds after session expires
     * @dev Safety valve if facilitator disappears
     */
    function reclaimExpired(uint256 sessionId) external inState(sessionId, SessionState.Active) {
        Session storage s = sessions[sessionId];
        if (block.timestamp < s.expiresAt) revert SessionNotExpired();
        if (msg.sender != s.buyer) revert NotBuyer();

        uint256 refund = s.depositAmount - s.capturedAmount;
        s.state = SessionState.Expired;

        if (refund > 0) {
            usdc.safeTransfer(s.buyer, refund);
        }

        emit SessionReclaimed(sessionId, refund);
    }

    // ──────────────────────── View Functions ──────────────────────

    function getSession(uint256 sessionId) external view returns (Session memory) {
        return sessions[sessionId];
    }

    function remainingBalance(uint256 sessionId) external view returns (uint256) {
        Session storage s = sessions[sessionId];
        return s.depositAmount - s.capturedAmount;
    }

    function isExpired(uint256 sessionId) external view returns (bool) {
        return sessions[sessionId].state == SessionState.Active
            && block.timestamp >= sessions[sessionId].expiresAt;
    }

    // ──────────────────────── Admin ───────────────────────────────

    function setFacilitator(address _facilitator) external onlyOwner {
        address old = facilitator;
        facilitator = _facilitator;
        emit FacilitatorChanged(old, _facilitator);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
