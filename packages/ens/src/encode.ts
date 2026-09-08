import { namehash, toHex } from "viem";
import { packetToBytes } from "viem/ens";

/**
 * TRAP #5: the resolver `authorize*` family takes a DNS-encoded name
 * (`bytes dnsName`) while `setText` / `text` take a namehash (`bytes32 node`).
 * Mixing them produces confusing reverts. These two helpers exist so every
 * call site picks the right encoding and the trap is visible in review —
 * never inline `packetToBytes` or `namehash` anywhere else.
 */

/** For resolver `authorize*` functions (`bytes dnsName`). */
export const dnsName = (name: string): `0x${string}` => toHex(packetToBytes(name));

/** For resolver `setText` / `text` (`bytes32 node`). */
export const node = (name: string): `0x${string}` => namehash(name);
