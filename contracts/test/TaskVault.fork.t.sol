// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TaskVault, ISwapRouter02, IWETH, IERC20} from "../src/TaskVault.sol";

/// @dev Runs only with --fork-url <sepolia>: a real swap through Uniswap V3 SwapRouter02.
contract TaskVaultForkTest is Test {
    ISwapRouter02 constant ROUTER = ISwapRouter02(0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E);
    IWETH constant WETH = IWETH(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14);
    IERC20 constant USDC = IERC20(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);

    function test_realSepoliaSwapInsideBoundary() public {
        if (block.chainid != 11155111) return; // not a Sepolia fork: skip
        address owner = makeAddr("owner");
        uint256 execKey = 0xE1;
        uint256 policyKey = 0xA2;
        TaskVault vault = new TaskVault(
            owner,
            vm.addr(execKey),
            vm.addr(policyKey),
            ROUTER,
            WETH,
            USDC,
            500,
            TaskVault.Install(bytes32(0), 0, 0, 0, TaskVault.Cap(0, 0), TaskVault.Cap(0, 0))
        );
        vm.deal(owner, 1 ether);
        vm.startPrank(owner);
        vault.deposit{value: 0.05 ether}();
        vault.installMandate(
            keccak256("m"),
            2,
            uint64(block.timestamp + 1 days),
            0,
            TaskVault.Cap(0.02 ether, 0.05 ether),
            TaskVault.Cap(100e6, 200e6)
        );
        vm.stopPrank();

        TaskVault.Action memory a = TaskVault.Action({
            tokenIn: address(WETH),
            tokenOut: address(USDC),
            amountIn: 0.01 ether,
            minOut: 1e6, // pool price × 0.01 ETH is ~25 USDC; a loose floor keeps the test robust
            nonce: 0,
            deadline: uint64(block.timestamp + 120),
            mandateHash: keccak256("m")
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(policyKey, vault.actionDigest(a));
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(vm.addr(execKey));
        uint256 out = vault.executeSwap(a, sig);
        (uint256 w, uint256 u) = vault.balances();
        assertEq(w, 0.04 ether);
        assertEq(u, out);
        assertGt(out, 1e6);
        emit log_named_uint("USDC out for 0.01 WETH (6dp)", out);
    }
}
