// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProxyVault {
    address public owner;
    address public implementation;

    constructor(address initialImplementation) {
        owner = msg.sender;
        implementation = initialImplementation;
    }

    function setImplementation(address nextImplementation) external {
        require(msg.sender == owner, "not owner");
        implementation = nextImplementation;
    }

    function execute(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "not owner");

        (bool ok, bytes memory result) = implementation.delegatecall(data);
        require(ok, "delegatecall failed");
        return result;
    }
}
