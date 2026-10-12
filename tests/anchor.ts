import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";

// Setup Provider & Accounts
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
const amount = new anchor.BN(10_000_000); // 10 units
const timeoutSeconds = new anchor.BN(300); // 5 minutes

// Deliverable SHA-256 fingerprint (Pure 32-byte array)
const deliverableHash = new Array(32).fill(42);

// Standard SPL Token Program ID
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Derive Escrow PDA
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), client.publicKey.toBuffer(), Buffer.from(invoiceId)],
  pg.program.programId
);

// Derive Vault PDA
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), escrowPda.toBuffer()],
  pg.program.programId
);

console.log("\nDerived Escrow PDA:", escrowPda.toBase58());
console.log("Derived Vault PDA:", vaultPda.toBase58());

// Setup Mock Mint & Token Accounts manually via SystemProgram/Token instructions
const mintKeypair = Keypair.generate();
const clientTokenKeypair = Keypair.generate();
const contractorTokenKeypair = Keypair.generate();

console.log("\n[Setup] Allocating Mock Mint & Token Accounts...");

const rentExemptMint = await pg.connection.getMinimumBalanceForRentExemption(82);
const rentExemptAccount = await pg.connection.getMinimumBalanceForRentExemption(165);

const setupTx = new Transaction();

// 1. Create Mint Account
setupTx.add(
  SystemProgram.createAccount({
    fromPubkey: client.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    lamports: rentExemptMint,
    space: 82,
    programId: TOKEN_PROGRAM_ID,
  })
);

// Initialize Mint Instruction (Tag 0: InitializeMint)
const initMintData = Buffer.alloc(67);
initMintData.writeUInt8(0, 0); // Instruction 0 = InitializeMint
initMintData.writeUInt8(6, 1); // Decimals = 6
client.publicKey.toBuffer().copy(initMintData, 2); // Mint Authority
initMintData.writeUInt8(0, 34); // Freeze Authority Option = None

setupTx.add({
  keys: [
    { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ],
  programId: TOKEN_PROGRAM_ID,
  data: initMintData,
});

// 2. Create Client Token Account
setupTx.add(
  SystemProgram.createAccount({
    fromPubkey: client.publicKey,
    newAccountPubkey: clientTokenKeypair.publicKey,
    lamports: rentExemptAccount,
    space: 165,
    programId: TOKEN_PROGRAM_ID,
  })
);

// Initialize Client Token Account (Tag 1: InitializeAccount)
setupTx.add({
  keys: [
    { pubkey: clientTokenKeypair.publicKey, isSigner: false, isWritable: true },
    { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: false },
    { pubkey: client.publicKey, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ],
  programId: TOKEN_PROGRAM_ID,
  data: Buffer.from([1]),
});

// 3. Create Contractor Token Account
setupTx.add(
  SystemProgram.createAccount({
    fromPubkey: client.publicKey,
    newAccountPubkey: contractorTokenKeypair.publicKey,
    lamports: rentExemptAccount,
    space: 165,
    programId: TOKEN_PROGRAM_ID,
  })
);

// Initialize Contractor Token Account
setupTx.add({
  keys: [
    { pubkey: contractorTokenKeypair.publicKey, isSigner: false, isWritable: true },
    { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: false },
    { pubkey: contractor.publicKey, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ],
  programId: TOKEN_PROGRAM_ID,
  data: Buffer.from([1]),
});

// 4. Mint 100 Tokens to Client Account (Tag 7: MintTo)
const mintToData = Buffer.alloc(9);
mintToData.writeUInt8(7, 0); // Instruction 7 = MintTo
mintToData.writeBigUInt64LE(BigInt(100_000_000), 1); // 100 units

setupTx.add({
  keys: [
    { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
    { pubkey: clientTokenKeypair.publicKey, isSigner: false, isWritable: true },
    { pubkey: client.publicKey, isSigner: true, isWritable: false },
  ],
  programId: TOKEN_PROGRAM_ID,
  data: mintToData,
});

await anchor.web3.sendAndConfirmTransaction(pg.connection, setupTx, [
  client,
  mintKeypair,
  clientTokenKeypair,
  contractorTokenKeypair,
]);

console.log("Mock Mint & Token Accounts Created Successfully!");

// --- MODULE 1: Initialize Escrow ---
console.log("\n[M1] Initializing Escrow...");
const initTx = await pg.program.methods
  .initializeEscrow(invoiceId, amount, timeoutSeconds)
  .accounts({
    client: client.publicKey,
    contractor: contractor.publicKey,
    mint: mintKeypair.publicKey,
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
    clientTokenAccount: clientTokenKeypair.publicKey,
    vault: vaultPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log("Escrow Vault Funded TX:", `https://explorer.solana.com/tx/${fundTx}?cluster=devnet`);

// --- MODULE 3: Submit Deliverable Hash ---
console.log("\n[M3] Contractor submitting Deliverable Hash...");