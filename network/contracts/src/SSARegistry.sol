// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SSARegistry
/// @notice Optional public registry for SSA-compatible agents.
/// @dev The registry does NOT custody agent state, keys, or memory. The EVM wallet
///      that calls register() is the public network identity for that registration.
contract SSARegistry {
    struct Agent {
        string ssaId;
        bytes32 identityHash;
        string identityPublicKey;
        string metadataURI;
        uint64 registeredAt;
    }

    mapping(address => Agent) private _agents;
    uint256 public totalRegistered;

    event SSARegistered(
        address indexed wallet,
        bytes32 indexed identityHash,
        string ssaId,
        string identityPublicKey,
        string metadataURI,
        uint64 registeredAt
    );

    error AlreadyRegistered();
    error EmptySSAId();
    error EmptyIdentityKey();
    error FieldTooLong();
    error NotRegistered();

    function register(
        string calldata ssaId,
        string calldata identityPublicKey,
        string calldata metadataURI
    ) external {
        if (_agents[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        if (bytes(ssaId).length == 0) revert EmptySSAId();
        if (bytes(identityPublicKey).length == 0) revert EmptyIdentityKey();

        if (
            bytes(ssaId).length > 160 ||
            bytes(identityPublicKey).length > 256 ||
            bytes(metadataURI).length > 512
        ) revert FieldTooLong();

        bytes32 identityHash = keccak256(bytes(identityPublicKey));
        uint64 registeredAt = uint64(block.timestamp);

        _agents[msg.sender] = Agent({
            ssaId: ssaId,
            identityHash: identityHash,
            identityPublicKey: identityPublicKey,
            metadataURI: metadataURI,
            registeredAt: registeredAt
        });

        unchecked {
            totalRegistered += 1;
        }

        emit SSARegistered(
            msg.sender,
            identityHash,
            ssaId,
            identityPublicKey,
            metadataURI,
            registeredAt
        );
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _agents[wallet].registeredAt != 0;
    }

    function getAgent(address wallet)
        external
        view
        returns (
            string memory ssaId,
            bytes32 identityHash,
            string memory identityPublicKey,
            string memory metadataURI,
            uint64 registeredAt
        )
    {
        Agent storage agent = _agents[wallet];
        if (agent.registeredAt == 0) revert NotRegistered();
        return (
            agent.ssaId,
            agent.identityHash,
            agent.identityPublicKey,
            agent.metadataURI,
            agent.registeredAt
        );
    }
}
