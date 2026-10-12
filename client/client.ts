import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

// Setup Accounts
const provider = pg.program.provider;
const client = pg.wallet.keypair;
const contractor = Keypair.generate();

console.log("==========================================");
console.log("   EQUATOR PROTOCOL - FULL LIFECYCLE DEMO ");
console.log("==========================================");
console.log("Client:", client.publicKey.toBase58());
console.log("Contractor:", contractor.publicKey.toBase58());

// Module 10: Multi-Stage Milestone Suffix Preset
const invoiceId = "INV-2026-DEMO_M1";
const amount = new anchor.BN(50_000_000); // 50 tokens (6 decimals)
const timeoutSeconds = new anchor.BN(300); // 5 minutes

// Module 3: Sandbox-safe 32-byte deliverable hash (Anchor built-in SHA-256)
const sampleWork = "Equator Protocol Core Settler Specification v1.0";
const hashHex = anchor.utils.sha256.hash(sampleWork);
const deliverableHash = Array.from(Buffer.from(hashHex, "hex"));

// Derive PDAs
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), client.publicKey.toBuffer(), Buffer.from(invoiceId)],
  pg.program.programId
);

const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), escrowPda.toBuffer()],
  pg.program.programId
);

console.log("\nDerived Escrow PDA:", escrowPda.toBase58());
console.log("Derived Vault PDA:", vaultPda.toBase58());

// Setup SPL Token Mint & ATAs
console.log("\n[Setup] Creating Mock Token Mint & Accounts...");
const mint = await createMint(
  pg.connection,
  client,
  client.publicKey,
  null,
  6
);

const clientAta = await getOrCreateAssociatedTokenAccount(
  pg.connection,
  client,
  mint,
  client.publicKey
);

const contractorAta = await getOrCreateAssociatedTokenAccount(
  pg.connection,
  client,
  mint,
  contractor.publicKey
);

// Mint 100 tokens to Client
await mintTo(
  pg.connection,
  client,
  mint,
  clientAta.address,
  client.publicKey,
  100_000_000
);
console.log("Minted 100 Mock-USDC to Client ATA:", clientAta.address.toBase58());

// --- MODULE 1: Initialize Escrow ---
console.log("\n[M1] Initializing Escrow...");
const initTx = await pg.program.methods
  .initializeEscrow(invoiceId, amount, timeoutSeconds)
  .accounts({
    client: client.publicKey,
    contractor: contractor.publicKey,
    mint: mint,
    escrowState: escrowPda,
    vault: vaultPda,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();
console.log("Escrow Initialized TX:", `https://explorer.solana.com/tx/${initTx}?cluster=devnet`);

// --- MODULE 2: Fund Escrow ---
console.log("\n[M2] Funding Escrow Vault...");
const fundTx = await pg.program.methods
  .fundEscrow()
  .accounts({
    client: client.publicKey,
    escrowState: escrowPda,
    clientTokenAccount: clientAta.address,
    vault: vaultPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log("Escrow Vault Funded TX:", `https://explorer.solana.com/tx/${fundTx}?cluster=devnet`);

// --- MODULE 3: Submit Deliverable Hash ---
console.log("\n[M3] Contractor submitting SHA-256 fingerprint...");
const submitTx = await pg.program.methods
  .submitDeliverable(deliverableHash)
  .accounts({
    contractor: contractor.publicKey,
    escrowState: escrowPda,
  })
  .signers([contractor])
  .rpc();
console.log("Deliverable Submitted TX:", `https://explorer.solana.com/tx/${submitTx}?cluster=devnet`);

// --- MODULE 4: Release Milestone & Reclaim Rent ---
console.log("\n[M4] Client Approving & Releasing Funds to Contractor...");
const releaseTx = await pg.program.methods
  .releaseMilestone()
  .accounts({
    client: client.publicKey,
    contractor: contractor.publicKey,
    escrowState: escrowPda,
    contractorTokenAccount: contractorAta.address,
    vault: vaultPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log("Milestone Settled & Vault Closed TX:", `https://explorer.solana.com/tx/${releaseTx}?cluster=devnet`);

console.log("\n==========================================");
console.log("   ALL 4 CORE TRANSACTIONS CONFIRMED!     ");
console.log("==========================================");