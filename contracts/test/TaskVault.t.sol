// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TaskVault, ISwapRouter02, IWETH, IERC20} from "../src/TaskVault.sol";
import {MockERC20, MockWETH, MockRouter} from "./Mocks.sol";

contract TaskVaultTest is Test {
    TaskVault vault;
    MockWETH weth;
    MockERC20 usdc;
    MockRouter router;

    address owner = makeAddr("owner");
    uint256 execKey = 0xE1;
    uint256 policyKey = 0xA2;
    address exec;
    address policy;
    bytes32 constant HASH = keccak256("mandate-1");
    uint256 constant RATE = 2500e6; // 1 WETH = 2500 USDC

    function setUp() public {
        exec = vm.addr(execKey);
        policy = vm.addr(policyKey);
        weth = new MockWETH();
        usdc = new MockERC20("USD Coin", 6);
        router = new MockRouter(weth, usdc, RATE);
        vault = new TaskVault(
            owner,
            exec,
            policy,
            ISwapRouter02(address(router)),
            IWETH(address(weth)),
            IERC20(address(usdc)),
            500,
            _noInstall()
        );
        vm.deal(owner, 10 ether);
        vm.prank(owner);
        vault.deposit{value: 1 ether}();
        _install(0.1 ether, 0.5 ether, 300e6, 1000e6, 60, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 1);
    }

    function _noInstall() internal pure returns (TaskVault.Install memory) {
        return TaskVault.Install(bytes32(0), 0, 0, 0, TaskVault.Cap(0, 0), TaskVault.Cap(0, 0));
    }

    function _install(uint128 wTrade, uint128 wCum, uint128 uTrade, uint128 uCum, uint32 interval, uint64 expiry)
        internal
    {
        vm.prank(owner);
        vault.installMandate(HASH, 2, expiry, interval, TaskVault.Cap(wTrade, wCum), TaskVault.Cap(uTrade, uCum));
    }

    function _action(address tIn, address tOut, uint256 amountIn, uint256 minOut, uint64 nonce)
        internal
        view
        returns (TaskVault.Action memory)
    {
        return TaskVault.Action({
            tokenIn: tIn,
            tokenOut: tOut,
            amountIn: amountIn,
            minOut: minOut,
            nonce: nonce,
            deadline: uint64(block.timestamp + 120),
            mandateHash: HASH
        });
    }

    function _sign(TaskVault.Action memory a, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, vault.actionDigest(a));
        return abi.encodePacked(r, s, v);
    }

    function _swapWeth(uint256 amountIn, uint256 minOut) internal returns (uint256) {
        TaskVault.Action memory a = _action(address(weth), address(usdc), amountIn, minOut, vault.actionNonce());
        bytes memory sig = _sign(a, policyKey); // actionDigest is an external view: sign before pranking
        vm.prank(exec);
        return vault.executeSwap(a, sig);
    }

    // ── Happy path ─────────────────────────────────────────────────────────

    function test_swapInsideBoundaryMovesTokensIntoVault() public {
        uint256 out = _swapWeth(0.1 ether, 240e6);
        assertEq(out, 250e6);
        (uint256 w, uint256 u) = vault.balances();
        assertEq(w, 0.9 ether);
        assertEq(u, 250e6);
        assertEq(vault.actionNonce(), 1);
        assertEq(vault.spent(address(weth)), 0.1 ether);
    }

    function test_usdcToWethAlsoWorks() public {
        _swapWeth(0.1 ether, 0);
        vm.warp(block.timestamp + 61);
        TaskVault.Action memory a = _action(address(usdc), address(weth), 250e6, 0.09 ether, 1);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vault.executeSwap(a, sig);
        (uint256 w,) = vault.balances();
        assertEq(w, 1 ether);
    }

    // ── Every limit is enforced on-chain ───────────────────────────────────

    function test_revertsOverTradeCap() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.11 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.ExceedsTradeCap.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsOverCumulativeCap() public {
        for (uint256 i = 0; i < 5; i++) {
            _swapWeth(0.1 ether, 0);
            vm.warp(block.timestamp + 61);
        }
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 5);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.ExceedsCumulativeCap.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsDuringCooldown() public {
        _swapWeth(0.1 ether, 0);
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 1);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.Cooldown.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsAfterMandateExpiry() public {
        vm.warp(block.timestamp + 2 days);
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.MandateExpired.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsOnNonceReplay() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vault.executeSwap(a, sig);
        vm.warp(block.timestamp + 61);
        vm.prank(exec);
        vm.expectRevert(TaskVault.BadNonce.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsWhenActionApprovalExpired() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.warp(block.timestamp + 121);
        vm.prank(exec);
        vm.expectRevert(TaskVault.ActionExpired.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsForOtherAssets() public {
        MockERC20 other = new MockERC20("Other", 18);
        TaskVault.Action memory a = _action(address(weth), address(other), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.AssetNotAllowed.selector);
        vault.executeSwap(a, sig);
    }

    // ── Keys ───────────────────────────────────────────────────────────────

    function test_onlyExecutionSignerMayExecute() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(owner);
        vm.expectRevert(TaskVault.NotExecutionSigner.selector);
        vault.executeSwap(a, sig);
    }

    function test_rejectsActionSignedByWrongKeyOrTampered() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory wrong = _sign(a, execKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.BadPolicySignature.selector);
        vault.executeSwap(a, wrong);

        bytes memory sig = _sign(a, policyKey);
        a.minOut = 1; // any field change invalidates the approval
        vm.prank(exec);
        vm.expectRevert(TaskVault.BadPolicySignature.selector);
        vault.executeSwap(a, sig);
    }

    function test_executionSignerCannotWithdraw() public {
        vm.prank(exec);
        vm.expectRevert(TaskVault.NotOwner.selector);
        vault.withdrawEth(1 ether, payable(exec));
        vm.prank(policy);
        vm.expectRevert(TaskVault.NotOwner.selector);
        vault.withdrawUsdc(1, policy);
    }

    // ── Owner controls ─────────────────────────────────────────────────────

    function test_revokeStopsExecutionButOwnerStillWithdraws() public {
        vm.prank(owner);
        vault.revoke();
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.MandateInactive.selector);
        vault.executeSwap(a, sig);

        uint256 before = owner.balance;
        vm.prank(owner);
        vault.withdrawEth(1 ether, payable(owner));
        assertEq(owner.balance - before, 1 ether);
    }

    function test_newMandateResetsCountersAndOldApprovalsDie() public {
        _swapWeth(0.1 ether, 0);
        vm.prank(owner);
        vault.installMandate(
            keccak256("mandate-2"),
            3,
            uint64(block.timestamp + 1 days),
            0,
            TaskVault.Cap(1 ether, 1 ether),
            TaskVault.Cap(1, 1)
        );
        assertEq(vault.actionNonce(), 0);
        assertEq(vault.spent(address(weth)), 0);
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 0, 0); // still HASH (old mandate)
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.MandateMismatch.selector);
        vault.executeSwap(a, sig);
    }

    // ── Output must land in the vault ──────────────────────────────────────

    function test_revertsIfRouterDoesNotDeliverToVault() public {
        router.setSteal(true);
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 1, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert(TaskVault.InsufficientOutput.selector);
        vault.executeSwap(a, sig);
    }

    function test_revertsWhenQuoteWorseThanMinOut() public {
        TaskVault.Action memory a = _action(address(weth), address(usdc), 0.1 ether, 260e6, 0);
        bytes memory sig = _sign(a, policyKey);
        vm.prank(exec);
        vm.expectRevert("Too little received");
        vault.executeSwap(a, sig);
    }
}

contract TaskVaultInstallAtDeployTest is Test {
    function test_constructorInstallsMandateSoOneTxBindsIt() public {
        MockWETH weth = new MockWETH();
        MockERC20 usdc = new MockERC20("USD Coin", 6);
        MockRouter router = new MockRouter(weth, usdc, 2500e6);
        TaskVault vault = new TaskVault(
            address(this),
            address(1),
            address(2),
            ISwapRouter02(address(router)),
            IWETH(address(weth)),
            IERC20(address(usdc)),
            500,
            TaskVault.Install(
                keccak256("m"), 1, uint64(block.timestamp + 1), 0, TaskVault.Cap(1, 2), TaskVault.Cap(3, 4)
            )
        );
        (bytes32 hash,,, uint32 interval, bool active) = vault.mandate();
        assertEq(hash, keccak256("m"));
        assertTrue(active);
        assertEq(interval, 0);
        (uint128 maxTrade, uint128 maxCum) = vault.caps(address(usdc));
        assertEq(maxTrade, 3);
        assertEq(maxCum, 4);
    }
}
