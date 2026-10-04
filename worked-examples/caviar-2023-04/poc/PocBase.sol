// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "solmate/tokens/ERC721.sol";
import {RoyaltyRegistry} from "royalty-registry-solidity/RoyaltyRegistry.sol";

import "../../src/Factory.sol";
import "../../src/PrivatePool.sol";
import "../../src/EthRouter.sol";

// A collection whose royalty is set by its admin, as ERC-2981 allows.
// This is the only non-protocol contract in the PoCs.
contract RoyaltyCollection is ERC721 {
    address public immutable admin;
    uint256 public royaltyBps;

    constructor(address _admin) ERC721("Collection", "COL") {
        admin = _admin;
    }

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }

    function setRoyaltyBps(uint256 bps) external {
        require(msg.sender == admin, "not admin");
        royaltyBps = bps;
    }

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (admin, salePrice * royaltyBps / 10_000);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0x2a55205a || super.supportsInterface(id); // ERC-2981
    }

    function tokenURI(uint256) public pure override returns (string memory) {
        return "";
    }
}

// Deploys the real in-scope contracts the way the contest test fixture does,
// and creates pools through Factory.create as a user would.
abstract contract PocBase is Test {
    RoyaltyRegistry internal royaltyRegistry = new RoyaltyRegistry(address(0));
    EthRouter internal ethRouter = new EthRouter(address(royaltyRegistry));
    Factory internal factory = new Factory();
    address internal poolOwner = makeAddr("poolOwner");
    uint256 internal nextTokenId;

    constructor() {
        factory.setPrivatePoolImplementation(
            address(new PrivatePool(address(factory), address(royaltyRegistry), address(0)))
        );
    }

    // ETH pool with 5 NFTs and 10 ETH, priced at 2.5 ETH for the next NFT, no trading fee.
    function _createEthPool(RoyaltyCollection nft, uint56 changeFee, bool payRoyalties, bytes32 salt)
        internal
        returns (PrivatePool pool, uint256[] memory poolTokenIds)
    {
        poolTokenIds = new uint256[](5);
        for (uint256 i; i < 5; i++) {
            poolTokenIds[i] = nextTokenId++;
            nft.mint(poolOwner, poolTokenIds[i]);
        }
        vm.deal(poolOwner, 10 ether);
        vm.startPrank(poolOwner);
        nft.setApprovalForAll(address(factory), true);
        pool = factory.create{value: 10 ether}(
            address(0), address(nft), 10 ether, 5e18, changeFee, 0, bytes32(0), false, payRoyalties, salt, poolTokenIds, 10 ether
        );
        vm.stopPrank();
    }

    function _one(uint256 value) internal pure returns (uint256[] memory array) {
        array = new uint256[](1);
        array[0] = value;
    }

    function _noProof() internal pure returns (PrivatePool.MerkleMultiProof memory) {
        return PrivatePool.MerkleMultiProof(new bytes32[](0), new bool[](0));
    }
}
