// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./PocBase.sol";
import {IERC3156FlashBorrower} from "openzeppelin/interfaces/IERC3156FlashBorrower.sol";

// Judged finding M-03: "Flash loan fee is incorrect in Private Pool contract".
// changeFee is documented as 4-decimal fixed point ("0.0025 ETH = 25"). changeFeeQuote scales it
// by 10^(18-4). flashFee returns the raw number, so the flash fee is charged in wei.
contract Borrower is IERC3156FlashBorrower {
    function onFlashLoan(address, address token, uint256, uint256, bytes calldata) external returns (bytes32) {
        ERC721(token).setApprovalForAll(msg.sender, true);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

contract M03_FlashFee is PocBase {
    function test_M03_flashLoanChargesWeiInsteadOfScaledFee() public {
        RoyaltyCollection nft = new RoyaltyCollection(address(this));
        (PrivatePool pool, uint256[] memory ids) = _createEthPool(nft, 25, false, "m03");

        (uint256 changeFeeForOneNft,) = pool.changeFeeQuote(1e18);
        assertEq(changeFeeForOneNft, 0.0025 ether, "the documented meaning of changeFee = 25");
        assertEq(pool.flashFee(address(nft), ids[0]), 25, "flash fee is the unscaled number");

        // Measured: a flash loan of a pool NFT goes through for 25 wei, 10^14 times less than documented.
        Borrower borrower = new Borrower();
        uint256 poolBefore = address(pool).balance;
        pool.flashLoan{value: 25}(borrower, address(nft), ids[0], "");
        assertEq(address(pool).balance - poolBefore, 25, "pool earned 25 wei");
        assertEq(nft.ownerOf(ids[0]), address(pool));
    }
}
