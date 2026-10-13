LIVE PROJECT LINK : https://equator-protocol.netlify.app/
**Network:** Solana Devnet
- **Program ID:** `BhsnWm7ZGmR4JmbyuzUYUQsJJqwFuahicQdCCNcYjFtm`
- **Solscan:** [View on Solana Explorer](https://explorer.solana.com/address/BhsnWm7ZGmR4JmbyuzUYUQsJJqwFuahicQdCCNcYjFtm?cluster=devnet)

# Equator Protocol

Equator Protocol is a decentralized, non-custodial milestone escrow program built on Solana using the Anchor framework. It enables trustless peer-to-peer contracting by programmatically locking client funds in smart contracts and releasing them to workers only when predefined, cryptographically verified milestones are fulfilled.

---

## The Problem

Traditional freelance platforms (Upwork, Fiverr) create unnecessary friction:
- **10%–20% Take Rates:** Heavy fees penalized on earnings.
- **Counterparty & Custodial Risk:** Platforms hold custody of funds, subjecting balances to freezes, multi-week clearing periods, and dispute bottlenecks.
- **Subjective Disputes:** Lack of cryptographic proof for completed deliverables.

---

## How Equator Solves It

1. **Non-Custodial PDA Vaults:** When a milestone starts, client funds lock into a deterministic Program Derived Address. No centralized party or middleman holds the private keys.
2. **Cryptographic Proof (SHA-256):** Contractors submit an immutable SHA-256 hash of their deliverable on-chain to verify completion before release.
3. **Atomic Settlement & Rent Refund:** When approved, payment releases to the contractor, the escrow account automatically closes, and 100% of the rent-exempt SOL is refunded to the client.
4. **Zero Platform Fee:** Sub-second finality with zero intermediary fee cuts.

---

## How to Test on Netlify

1. Switch your Phantom or Solflare wallet to **Devnet**.
2. Connect your wallet to the [Live Demo](https://equator-protocol.netlify.app).
3. **Client Flow:** Create an escrow by entering the contractor pubkey and funding the milestone.
4. **Contractor Flow:** Submit the SHA-256 hash of the deliverable.
5. **Release:** Approve the milestone to trigger immediate disbursement and automatic rent reclamation.
