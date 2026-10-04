// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./PocBase.sol";

// Judged finding M-02: "EthRouter can't perform multiple changes".
// EthRouter.change forwards the full msg.value to every pool in the loop. After the first pool
// keeps its fee, the router no longer holds msg.value, so the second forward cannot be funded.
// This is the one judged finding a Slither detector (msg-value-loop) stated directly.
contract M02_RouterMultiChange is PocBase {
    RoyaltyCollection internal nft;
    address internal user = makeAddr("user");
    PrivatePool internal poolA;
    PrivatePool internal poolB;
    uint256[] internal idsA;
    uint256[] internal idsB;

    function setUp() public {
        nft = new RoyaltyCollection(address(this));
        (poolA, idsA) = _createEthPool(nft, 25, false, "m02-a");
        (poolB, idsB) = _createEthPool(nft, 25, false, "m02-b");
        nft.mint(user, 100);
        nft.mint(user, 101);
        vm.deal(user, 1 ether);
        vm.prank(user);
        nft.setApprovalForAll(address(ethRouter), true);
    }

    function _change(PrivatePool pool, uint256 give, uint256 take) internal view returns (EthRouter.Change memory) {
        return EthRouter.Change(
            payable(address(pool)), address(nft), _one(give), _one(give), _noProof(),
            new IStolenNftOracle.Message[](0), _one(take), _one(take), _noProof()
        );
    }

    // Control: one change through the router works and costs exactly the 0.0025 ETH fee.
    function test_M02_control_singleChangeSucceeds() public {
        EthRouter.Change[] memory changes = new EthRouter.Change[](1);
        changes[0] = _change(poolA, 100, idsA[0]);

        vm.prank(user);
        ethRouter.change{value: 0.005 ether}(changes, 0);

        assertEq(nft.ownerOf(idsA[0]), user);
        assertEq(user.balance, 1 ether - 0.0025 ether);
    }

    function test_M02_twoChangesAlwaysRevert() public {
        EthRouter.Change[] memory changes = new EthRouter.Change[](2);
        changes[0] = _change(poolA, 100, idsA[0]);
        changes[1] = _change(poolB, 101, idsB[0]);

        // Measured: reverts with exactly enough ETH for both fees, and with a large surplus.
        vm.startPrank(user);
        vm.expectRevert();
        ethRouter.change{value: 0.005 ether}(changes, 0);
        vm.expectRevert();
        ethRouter.change{value: 1 ether}(changes, 0);
        vm.stopPrank();

        assertEq(nft.ownerOf(100), user, "nothing changed hands");
        assertEq(user.balance, 1 ether);
    }
}
