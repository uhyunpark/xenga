// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SessionEscrow} from "../src/SessionEscrow.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SessionEscrowTest is Test {
    SessionEscrow public session;
    SessionEscrow public sessionImpl;
    MockUSDC public usdc;

    address public facilitator = makeAddr("facilitator");

    uint256 public buyerPk = 0xA11CE;
    address public buyer = vm.addr(buyerPk);

    address public seller = makeAddr("seller");

    uint256 constant DEPOSIT = 10_000_000; // 10 USDC
    uint256 constant DURATION = 1 hours;

    function setUp() public {
        usdc = new MockUSDC();
        sessionImpl = new SessionEscrow();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(sessionImpl),
            abi.encodeCall(SessionEscrow.initialize, (address(usdc), facilitator))
        );
        session = SessionEscrow(address(proxy));

        // Mint USDC to buyer
        usdc.mint(buyer, 100_000_000); // 100 USDC
    }

    // ──────────── Helper: ERC-3009 signature ────────────

    function _signReceiveAuth(
        uint256 signerPk,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 typeHash = keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
        bytes32 structHash = keccak256(abi.encode(typeHash, from, to, value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(signerPk, digest);
    }

    // ──────────── Helper: create session ────────────

    function _createSession() internal returns (uint256 sessionId) {
        vm.warp(100);

        bytes32 nonce = keccak256("session-nonce-1");
        (uint8 v, bytes32 r, bytes32 s) = _signReceiveAuth(
            buyerPk, buyer, address(session), DEPOSIT, 0, 200, nonce
        );

        sessionId = session.createSessionWithAuth(
            seller, DEPOSIT, DURATION,
            buyer, 0, 200, nonce, v, r, s
        );
    }

    // ──────────── Test: Create session ────────────

    function test_createSessionWithAuth() public {
        uint256 sessionId = _createSession();

        assertEq(sessionId, 1);
        assertEq(usdc.balanceOf(address(session)), DEPOSIT);

        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(s.buyer, buyer);
        assertEq(s.seller, seller);
        assertEq(s.depositAmount, DEPOSIT);
        assertEq(s.capturedAmount, 0);
        assertEq(uint256(s.state), uint256(SessionEscrow.SessionState.Active));
        assertEq(s.expiresAt, 100 + DURATION);
    }

    // ──────────── Test: Capture session ────────────

    function test_captureSession() public {
        uint256 sessionId = _createSession();
        uint256 captureAmount = 1_000_000; // 1 USDC

        vm.prank(facilitator);
        session.captureSession(sessionId, captureAmount);

        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(s.capturedAmount, captureAmount);
        assertEq(usdc.balanceOf(seller), captureAmount);
        assertEq(usdc.balanceOf(address(session)), DEPOSIT - captureAmount);
    }

    // ──────────── Test: Multiple captures ────────────

    function test_captureMultiple() public {
        uint256 sessionId = _createSession();

        vm.startPrank(facilitator);
        session.captureSession(sessionId, 1_000_000);
        session.captureSession(sessionId, 2_000_000);
        session.captureSession(sessionId, 500_000);
        vm.stopPrank();

        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(s.capturedAmount, 3_500_000);
        assertEq(usdc.balanceOf(seller), 3_500_000);
    }

    // ──────────── Test: Settle session ────────────

    function test_settleSession() public {
        uint256 sessionId = _createSession();

        // Capture some usage first
        vm.prank(facilitator);
        session.captureSession(sessionId, 3_000_000);

        // Settle with final capture
        vm.prank(facilitator);
        session.settleSession(sessionId, 1_000_000);

        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(uint256(s.state), uint256(SessionEscrow.SessionState.Settled));
        assertEq(s.capturedAmount, 4_000_000);

        // Seller got 4 USDC total, buyer refunded 6 USDC
        assertEq(usdc.balanceOf(seller), 4_000_000);
        assertEq(usdc.balanceOf(buyer), 100_000_000 - DEPOSIT + 6_000_000); // initial - deposit + refund
    }

    // ──────────── Test: Settle with zero final capture ────────────

    function test_settleSessionZeroFinal() public {
        uint256 sessionId = _createSession();

        vm.prank(facilitator);
        session.captureSession(sessionId, 5_000_000);

        vm.prank(facilitator);
        session.settleSession(sessionId, 0);

        assertEq(usdc.balanceOf(seller), 5_000_000);
        assertEq(usdc.balanceOf(buyer), 100_000_000 - DEPOSIT + 5_000_000);
    }

    // ──────────── Test: Reclaim expired ────────────

    function test_reclaimExpired() public {
        uint256 sessionId = _createSession();

        // Capture some usage
        vm.prank(facilitator);
        session.captureSession(sessionId, 2_000_000);

        // Warp past expiry
        vm.warp(100 + DURATION + 1);

        vm.prank(buyer);
        session.reclaimExpired(sessionId);

        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(uint256(s.state), uint256(SessionEscrow.SessionState.Expired));
        assertEq(usdc.balanceOf(buyer), 100_000_000 - DEPOSIT + 8_000_000); // refund 8 USDC
    }

    // ──────────── Test: Cannot capture exceed deposit ────────────

    function test_cannotCaptureExceedDeposit() public {
        uint256 sessionId = _createSession();

        vm.prank(facilitator);
        vm.expectRevert(SessionEscrow.CaptureExceedsDeposit.selector);
        session.captureSession(sessionId, DEPOSIT + 1);
    }

    // ──────────── Test: Cannot capture after settle ────────────

    function test_cannotCaptureAfterSettle() public {
        uint256 sessionId = _createSession();

        vm.prank(facilitator);
        session.settleSession(sessionId, 0);

        vm.prank(facilitator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SessionEscrow.InvalidState.selector,
                SessionEscrow.SessionState.Settled,
                SessionEscrow.SessionState.Active
            )
        );
        session.captureSession(sessionId, 1_000_000);
    }

    // ──────────── Test: Cannot reclaim before expiry ────────────

    function test_cannotReclaimBeforeExpiry() public {
        uint256 sessionId = _createSession();

        vm.prank(buyer);
        vm.expectRevert(SessionEscrow.SessionNotExpired.selector);
        session.reclaimExpired(sessionId);
    }

    // ──────────── Test: Only facilitator can capture ────────────

    function test_onlyFacilitatorCanCapture() public {
        uint256 sessionId = _createSession();

        vm.prank(seller);
        vm.expectRevert(SessionEscrow.NotFacilitator.selector);
        session.captureSession(sessionId, 1_000_000);
    }

    // ──────────── Test: Only buyer can reclaim ────────────

    function test_onlyBuyerCanReclaim() public {
        uint256 sessionId = _createSession();

        vm.warp(100 + DURATION + 1);

        vm.prank(seller);
        vm.expectRevert(SessionEscrow.NotBuyer.selector);
        session.reclaimExpired(sessionId);
    }

    // ──────────── Test: View functions ────────────

    function test_remainingBalance() public {
        uint256 sessionId = _createSession();

        assertEq(session.remainingBalance(sessionId), DEPOSIT);

        vm.prank(facilitator);
        session.captureSession(sessionId, 3_000_000);

        assertEq(session.remainingBalance(sessionId), 7_000_000);
    }

    function test_isExpired() public {
        uint256 sessionId = _createSession();

        assertFalse(session.isExpired(sessionId));

        vm.warp(100 + DURATION);
        assertTrue(session.isExpired(sessionId));
    }

    // ──────────── Fuzz: settle session ────────────

    function testFuzz_settleSession(uint256 captureAmount) public {
        uint256 sessionId = _createSession();

        captureAmount = bound(captureAmount, 0, DEPOSIT);

        vm.prank(facilitator);
        session.settleSession(sessionId, captureAmount);

        assertEq(usdc.balanceOf(seller), captureAmount);
        assertEq(usdc.balanceOf(buyer), 100_000_000 - DEPOSIT + (DEPOSIT - captureAmount));
        assertEq(usdc.balanceOf(address(session)), 0);
    }

    // ──────────── Test: Cannot create with zero amount ────────────

    function test_cannotCreateZeroAmount() public {
        vm.warp(100);
        bytes32 nonce = keccak256("zero-amount");
        (uint8 v, bytes32 r, bytes32 s) = _signReceiveAuth(
            buyerPk, buyer, address(session), 0, 0, 200, nonce
        );

        vm.expectRevert(SessionEscrow.InvalidAmount.selector);
        session.createSessionWithAuth(
            seller, 0, DURATION,
            buyer, 0, 200, nonce, v, r, s
        );
    }

    // ──────────── Test: Cannot create with zero duration ────────────

    function test_cannotCreateZeroDuration() public {
        vm.warp(100);
        bytes32 nonce = keccak256("zero-duration");
        (uint8 v, bytes32 r, bytes32 s) = _signReceiveAuth(
            buyerPk, buyer, address(session), DEPOSIT, 0, 200, nonce
        );

        vm.expectRevert(SessionEscrow.InvalidDuration.selector);
        session.createSessionWithAuth(
            seller, DEPOSIT, 0,
            buyer, 0, 200, nonce, v, r, s
        );
    }

    // ──────────── Test: Capture zero amount reverts ────────────

    function test_cannotCaptureZero() public {
        uint256 sessionId = _createSession();

        vm.prank(facilitator);
        vm.expectRevert(SessionEscrow.InvalidAmount.selector);
        session.captureSession(sessionId, 0);
    }

    // ──────────── Test: Set facilitator ────────────

    function test_setFacilitator() public {
        address newFacilitator = makeAddr("newFacilitator");
        session.setFacilitator(newFacilitator);
        assertEq(session.facilitator(), newFacilitator);
    }

    // ──────────── Test: UUPS Upgrade ────────────

    function test_upgradeByOwner() public {
        uint256 sessionId = _createSession();

        SessionEscrow newImpl = new SessionEscrow();
        session.upgradeToAndCall(address(newImpl), "");

        // Storage preserved
        SessionEscrow.Session memory s = session.getSession(sessionId);
        assertEq(s.buyer, buyer);
        assertEq(s.seller, seller);
        assertEq(s.depositAmount, DEPOSIT);
    }

    function test_upgradeNotOwner_reverts() public {
        SessionEscrow newImpl = new SessionEscrow();

        address nonOwner = makeAddr("nonOwner");
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, nonOwner));
        session.upgradeToAndCall(address(newImpl), "");
    }

    function test_initializeCannotBeCalledTwice() public {
        vm.expectRevert();
        session.initialize(address(usdc), facilitator);
    }
}
