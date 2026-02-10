// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC3009
 * @notice Interface for ERC-3009: Transfer With Authorization
 * @dev Used by USDC for gasless transfers via signed authorizations
 */
interface IERC3009 {
    /**
     * @notice Execute a transfer with a signed authorization from the payer
     * @dev The caller (msg.sender) must be the `to` address — this prevents front-running
     * @param from          Payer's address (signer)
     * @param to            Payee's address (must be msg.sender)
     * @param value         Amount to transfer
     * @param validAfter    Unix timestamp after which the authorization is valid
     * @param validBefore   Unix timestamp before which the authorization is valid
     * @param nonce         Unique nonce for the authorization
     * @param v             ECDSA signature component v
     * @param r             ECDSA signature component r
     * @param s             ECDSA signature component s
     */
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @notice Execute a transfer with a signed authorization
     * @param from          Payer's address (signer)
     * @param to            Payee's address
     * @param value         Amount to transfer
     * @param validAfter    Unix timestamp after which the authorization is valid
     * @param validBefore   Unix timestamp before which the authorization is valid
     * @param nonce         Unique nonce for the authorization
     * @param v             ECDSA signature component v
     * @param r             ECDSA signature component r
     * @param s             ECDSA signature component s
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
