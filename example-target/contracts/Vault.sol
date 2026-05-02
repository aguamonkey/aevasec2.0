// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function setOwner(address nextOwner) external {
        require(msg.sender == owner, "not owner");
        owner = nextOwner;
    }

    function emergencySweep(address payable recipient, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        require(address(this).balance >= amount, "insufficient");
        recipient.transfer(amount);
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        ok;
    }
}
