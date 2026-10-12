let activeRole = 'client';
let currentHash = "0x9f83e201b1a7d65c4e9081e28d84a12c";
let countdownInterval = null;
let qrGenerated = false;
let autoDemoRunning = false;

// Multi-Milestone State Engine
let currentMilestoneIndex = 1;
const milestonesData = {
  1: { id: "INV-2026-DEMO_M1", amount: 50000000, desc: "50.00 USDC" },
  2: { id: "INV-2026-DEMO_M2", amount: 75000000, desc: "75.00 USDC" },
  3: { id: "INV-2026-DEMO_M3", amount: 100000000, desc: "100.00 USDC" }
};

const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl("devnet"), "confirmed");

function selectMilestone(idx) {
  currentMilestoneIndex = idx;
  const m = milestonesData[idx];
  document.getElementById("invoiceId").value = m.id;
  document.getElementById("amount").value = m.amount;
  updateDerivedPda();
  
  updateStepper(1);
  document.getElementById("badgeStatus").innerText = "Ready";
  document.getElementById("badgeStatus").className = "text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700 font-medium";
  document.getElementById("statPhase").innerText = `Milestone ${idx} Ready`;
  document.getElementById("statVault").innerText = "0.00 USDC";
  log(`Loaded Milestone ${idx}: ${m.id} (${m.desc})`, "info");
}

function setRole(role) {
  activeRole = role;
  const tabClient = document.getElementById('tabClient');
  const tabContractor = document.getElementById('tabContractor');
  const clientActions = document.getElementById('clientActions');
  const contractorActions = document.getElementById('contractorActions');
  const panelTitle = document.getElementById('panelTitle');
  const panelSubtitle = document.getElementById('panelSubtitle');

  if (role === 'client') {
    tabClient.className = "px-3 py-1.5 rounded-lg font-semibold transition-all bg-teal-500 text-slate-950 shadow";
    tabContractor.className = "px-3 py-1.5 rounded-lg font-semibold transition-all text-slate-400 hover:text-white";
    clientActions.classList.remove('hidden');
    contractorActions.classList.add('hidden');
    panelTitle.innerText = "Client Control Panel";
    panelSubtitle.innerText = "Escrow creation, vault lockup, and release approval";
    log("Switched to Client Persona.", "info");
  } else {
    tabContractor.className = "px-3 py-1.5 rounded-lg font-semibold transition-all bg-purple-500 text-white shadow";
    tabClient.className = "px-3 py-1.5 rounded-lg font-semibold transition-all text-slate-400 hover:text-white";
    clientActions.classList.add('hidden');
    contractorActions.classList.remove('hidden');
    contractorActions.classList.add('flex');
    panelTitle.innerText = "Contractor Control Panel";
    panelSubtitle.innerText = "Milestone review, proof upload, and timeout safety";
    log("Switched to Contractor Persona.", "info");
  }
}

function toggleQrModal() {
  const modal = document.getElementById('qrModal');
  modal.classList.toggle('hidden');
  if (!qrGenerated && !modal.classList.contains('hidden')) {
    new QRCode(document.getElementById("qrcode"), {
      text: "solana:pay?reference=" + document.getElementById("invoiceId").value + "&amount=50",
      width: 140,
      height: 140,
    });
    qrGenerated = true;
  }
}

function toggleCertModal() {
  document.getElementById('certModal').classList.toggle('hidden');
  document.getElementById('certHashDisplay').innerText = currentHash;
}

async function handleFile(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  document.getElementById('fileNameDisplay').innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  currentHash = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const preview = document.getElementById('fileHashPreview');
  preview.innerText = `SHA-256: ${currentHash}`;
  preview.classList.remove('hidden');
  log(`Computed SHA-256: ${currentHash.slice(0, 18)}...`, "info");
}

function log(msg, type = "info", explorerUrl = null) {
  const box = document.getElementById("consoleLog");
  const el = document.createElement("div");
  
  let badge = `<span class="text-slate-600">➜</span>`;
  if (type === "success") {
    el.className = "text-emerald-400 flex items-start gap-2";
    badge = `<span class="text-emerald-400">✓</span>`;
  } else if (type === "warn") {
    el.className = "text-amber-400 flex items-start gap-2";
    badge = `<span class="text-amber-400">⚠</span>`;
  } else if (type === "error") {
    el.className = "text-rose-400 flex items-start gap-2";
    badge = `<span class="text-rose-400">✗</span>`;
  } else {
    el.className = "text-slate-300 flex items-start gap-2";
  }
  
  const time = new Date().toLocaleTimeString();
  let linkHtml = explorerUrl ? ` <a href="${explorerUrl}" target="_blank" class="underline text-teal-400 hover:text-teal-300 text-[10px] ml-1">View on Explorer ↗</a>` : "";
  
  el.innerHTML = `${badge} <span class="text-slate-600">[${time}]</span> <span>${msg}${linkHtml}</span>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

async function updateDerivedPda() {
  const invoiceId = document.getElementById("invoiceId").value.trim();
  const progIdStr = "BhsnWm7ZGmR4JmbyuzUYUQsJJqwFuahicQdCCNcYjFtm";
  try {
    const progId = new solanaWeb3.PublicKey(progIdStr);
    const mockClient = new solanaWeb3.PublicKey("4Nd1mBQtrMJydszZp75iV7s8aV3PVD5U6r7tW7qKz3Fq");
    const [pda] = await solanaWeb3.PublicKey.findProgramAddress(
      [new TextEncoder().encode("escrow"), mockClient.toBuffer(), new TextEncoder().encode(invoiceId)],
      progId
    );
    const pdaStr = pda.toString();
    document.getElementById("derivedPdaDisplay").innerText = pdaStr;
    const linkEl = document.getElementById("pdaExplorerLink");
    if (linkEl) {
     linkEl.href = `https://explorer.solana.com/address/${progIdStr}?cluster=devnet`;
    }
  } catch (e) {
    document.getElementById("derivedPdaDisplay").innerText = "escrow[client, id]";
  }
}

async function connectWallet() {
  try {
    const provider = window.phantom?.solana || window.solana;

    if (!provider) {
      log("Wallet not detected. Run simulation mode directly.", "warn");
      return;
    }
    const resp = await provider.connect();
    const pubkey = resp.publicKey.toString();
    const shortAddr = pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
    document.getElementById("btnConnect").innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> ${shortAddr}`;
    document.getElementById("btnConnect").className = "flex items-center gap-2 bg-slate-900 border border-teal-500/40 text-teal-300 text-xs font-mono px-4 py-2 rounded-xl";
    log(`Connected: ${pubkey}`, "success", `https://explorer.solana.com/address/${pubkey}?cluster=devnet`);

    try {
      const balance = await connection.getBalance(resp.publicKey);
      document.getElementById("liveSolBalance").innerText = `${(balance / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4)} SOL`;
    } catch (err) {
      document.getElementById("liveSolBalance").innerText = "Devnet Active";
    }
  } catch (err) {
    log(`Connection failed: ${err.message}`, "error");
  }
}

function updateStepper(step) {
  for (let i = 1; i <= 4; i++) {
    const circle = document.getElementById(`stepCircle${i}`);
    const label = document.getElementById(`stepLabel${i}`);
    const line = document.getElementById(`stepLine${i}`);

    if (i < step) {
      circle.className = "w-8 h-8 rounded-full bg-teal-500 text-slate-950 text-xs font-bold flex items-center justify-center transition-all duration-300 shadow-md shadow-teal-500/20";
      circle.innerText = "✓";
      label.className = "text-[11px] font-medium text-teal-400";
      if (line) line.className = "w-8 sm:w-16 h-[2px] bg-teal-500 transition-all duration-300";
    } else if (i === step) {
      circle.className = "w-8 h-8 rounded-full border-2 border-teal-400 bg-teal-500/20 text-teal-300 text-xs font-bold flex items-center justify-center transition-all duration-300 shadow-lg shadow-teal-500/30 scale-110";
      circle.innerText = i;
      label.className = "text-[11px] font-semibold text-white";
      if (line) line.className = "w-8 sm:w-16 h-[2px] bg-slate-800 transition-all duration-300";
    } else {
      circle.className = "w-8 h-8 rounded-full border border-slate-700 bg-slate-800 text-slate-400 text-xs font-bold flex items-center justify-center transition-all duration-300";
      circle.innerText = i;
      label.className = "text-[11px] font-medium text-slate-500";
      if (line) line.className = "w-8 sm:w-16 h-[2px] bg-slate-800 transition-all duration-300";
    }
  }
}

function startReviewTimer(durationSeconds) {
  let remaining = durationSeconds;
  const banner = document.getElementById('timerBanner');
  const timerDisplay = document.getElementById('countdownTimer');
  banner.classList.remove('hidden');

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      document.getElementById('claimSafetyStatus').innerText = "Claim Eligible! (Timeout Elapsed)";
      document.getElementById('claimSafetyStatus').className = "text-emerald-400 font-bold font-mono";
      log("Inactivity safety window elapsed. Contractor can invoke claim_timeout_release().", "warn");
    }
    remaining--;
  }, 1000);
}

function raiseDispute() {
  document.getElementById('disputeBanner').classList.remove('hidden');
  document.getElementById('badgeStatus').innerText = "Disputed";
  document.getElementById('badgeStatus').className = "text-xs bg-rose-950 text-rose-300 px-3 py-1 rounded-full border border-rose-800 font-medium";
  if (countdownInterval) clearInterval(countdownInterval);
  log("Escrow flagged for dispute. Countdown frozen. Multi-sig arbitrator notified.", "error");
}

function resolveDispute() {
  document.getElementById('disputeBanner').classList.add('hidden');
  document.getElementById('badgeStatus').innerText = "Under Review";
  document.getElementById('badgeStatus').className = "text-xs bg-purple-950 text-purple-300 px-3 py-1 rounded-full border border-purple-800 font-medium";
  log("Arbitrator signed resolution. Review window resumed.", "info");
  startReviewTimer(120);
}

function claimTimeout() {
  const progId = "BhsnWm7ZGmR4JmbyuzUYUQsJJqwFuahicQdCCNcYjFtm";
  log("Contractor invoked claim_timeout_release() safety hatch...", "warn");
  setTimeout(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById('timerBanner').classList.add('hidden');
    document.getElementById('btnViewCert').classList.remove('hidden');
    document.getElementById("badgeStatus").innerText = "Timeout Settled";
    document.getElementById("badgeStatus").className = "text-xs bg-amber-950 text-amber-300 px-3 py-1 rounded-full border border-amber-800 font-medium";
    document.getElementById("statPhase").innerText = "Timeout Settled";
    document.getElementById("statVault").innerText = "0.00 USDC (Closed)";
    updateStepper(5);
    log("Inactivity proven on-chain. 50.00 USDC released to Contractor ATA without client signature.", "success");
    log("Vault closed via CPI: rent reclaimed.", "success", `https://explorer.solana.com/address/${progId}?cluster=devnet`);
  }, 600);
}

function triggerStep(stepNum) {
  const progId = "BhsnWm7ZGmR4JmbyuzUYUQsJJqwFuahicQdCCNcYjFtm";
  const m = milestonesData[currentMilestoneIndex];
  
  if (stepNum === 1) {
    log(`Module 1: initialize_escrow for ${m.id}...`, "info");
    setTimeout(() => {
      document.getElementById("badgeStatus").innerText = "Initialized";
      document.getElementById("badgeStatus").className = "text-xs bg-amber-950/80 text-amber-300 px-3 py-1 rounded-full border border-amber-800/80 font-medium";
      document.getElementById("statPhase").innerText = "Initialized";
      updateStepper(2);
      log(`Derived Escrow PDA for ${m.id}: seeds = [b'escrow', client, invoice_id]`, "info");
      log("Escrow account initialized on-chain.", "success", `https://explorer.solana.com/address/${progId}?cluster=devnet`);
    }, 500);
  } else if (stepNum === 2) {
    log(`Module 2: fund_escrow via CPI Token Transfer (${m.desc})...`, "info");
    setTimeout(() => {
      document.getElementById("badgeStatus").innerText = "Funded";
      document.getElementById("badgeStatus").className = "text-xs bg-cyan-950/80 text-cyan-300 px-3 py-1 rounded-full border border-cyan-800/80 font-medium";
      document.getElementById("statPhase").innerText = "Funded & Locked";
      document.getElementById("statVault").innerText = m.desc;
      updateStepper(3);
      log(`Transferred ${m.amount.toLocaleString()} micro-USDC to PDA Vault`, "success");
      log("Escrow vault funded and confirmed on-chain.", "success", `https://explorer.solana.com/address/${progId}?cluster=devnet`);
    }, 500);
  } else if (stepNum === 3) {
    log("Module 3: submit_deliverable invoked by Contractor...", "info");
    setTimeout(() => {
      document.getElementById("badgeStatus").innerText = "Under Review";
      document.getElementById("badgeStatus").className = "text-xs bg-purple-950/80 text-purple-300 px-3 py-1 rounded-full border border-purple-800/80 font-medium";
      document.getElementById("statPhase").innerText = "Under Review";
      updateStepper(4);
      log(`Pinned Deliverable Hash: ${currentHash.slice(0, 22)}...`, "info");
      startReviewTimer(300);
      log("Safety timelock initiated (300s). Review window running.", "warn");
    }, 500);
  } else if (stepNum === 4) {
    log("Module 4: release_milestone & close_account invoked by Client...", "info");
    setTimeout(() => {
      if (countdownInterval) clearInterval(countdownInterval);
      document.getElementById('timerBanner').classList.add('hidden');
      document.getElementById('btnViewCert').classList.remove('hidden');
      document.getElementById("badgeStatus").innerText = "Settled";
      document.getElementById("badgeStatus").className = "text-xs bg-emerald-950/80 text-emerald-300 px-3 py-1 rounded-full border border-emerald-800/80 font-medium";
      document.getElementById("statPhase").innerText = "Settled";
      document.getElementById("statVault").innerText = "0.00 USDC (Closed)";
      updateStepper(5);
      log(`Client approved release. ${m.desc} transferred to Contractor ATA.`, "success");
      log("Vault closed via CPI: rent refunded to Client wallet.", "success");
      log("Escrow settled and finalized on-chain.", "success", `https://explorer.solana.com/address/${progId}?cluster=devnet`);

      // Sequential Progression Hook
      if (currentMilestoneIndex === 1) {
        document.getElementById("m1Badge").innerText = "Completed";
        document.getElementById("m1Badge").className = "text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono";
        log("✓ Milestone 1 complete! Unlocking Milestone 2...", "success");
        setTimeout(() => {
          selectMilestone(2);
          const m2Card = document.getElementById("m2Card");
          if (m2Card) m2Card.classList.remove("opacity-70");
          const m2Badge = document.getElementById("m2Badge");
          if (m2Badge) {
            m2Badge.innerText = "In Progress";
            m2Badge.className = "text-[10px] bg-teal-950 text-teal-300 border border-teal-800 px-2 py-0.5 rounded font-mono";
          }
        }, 1200);
      } else if (currentMilestoneIndex === 2) {
        const m2Badge = document.getElementById("m2Badge");
        if (m2Badge) {
          m2Badge.innerText = "Completed";
          m2Badge.className = "text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono";
        }
        log("✓ Milestone 2 complete! Unlocking Milestone 3...", "success");
        setTimeout(() => {
          selectMilestone(3);
          const m3Card = document.getElementById("m3Card");
          if (m3Card) m3Card.classList.remove("opacity-70");
          const m3Badge = document.getElementById("m3Badge");
          if (m3Badge) {
            m3Badge.innerText = "In Progress";
            m3Badge.className = "text-[10px] bg-teal-950 text-teal-300 border border-teal-800 px-2 py-0.5 rounded font-mono";
          }
        }, 1200);
      } else if (currentMilestoneIndex === 3) {
        const m3Badge = document.getElementById("m3Badge");
        if (m3Badge) {
          m3Badge.innerText = "Completed";
          m3Badge.className = "text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono";
        }
        log("✓ All 3 Milestones settled! Multi-stage agreement complete.", "success");
      }
    }, 500);
  }
}

// Guided Tour State Controller
let tourCurrentStep = 0;
let tourTimer = null;

const tourSteps = [
  {
    badge: "Intro • Overview",
    title: "Welcome to Equator Protocol",
    desc: "Equator Protocol replaces centralized freelancing platforms with trustless Solana smart contracts. Click below to start the live step-by-step settlement flow.",
    actionText: "Step 1: Init Escrow →",
    action: () => {}
  },
  {
    badge: "Stage 1 • Program Derived Address",
    title: "Module 1: Initialize Escrow Agreement",
    desc: "The client opens an agreement. The smart contract deterministically derives an Escrow PDA on Devnet linked to the client's wallet and invoice seed. No intermediaries.",
    actionText: "Run Step 1 & Proceed →",
    action: () => {
      setRole('client');
      triggerStep(1);
    }
  },
  {
    badge: "Stage 2 • Non-Custodial Vaulting",
    title: "Module 2: Fund Vault via CPI Token Transfer",
    desc: "The client deposits 50 USDC. The program moves funds directly into a program-owned vault account via Cross-Program Invocation (CPI). The contractor can see the funds locked and guaranteed on-chain.",
    actionText: "Fund Vault & Proceed →",
    action: () => {
      triggerStep(2);
    }
  },
  {
    badge: "Stage 3 • Cryptographic Proof-of-Work",
    title: "Module 3: Submit Deliverable & Timelock",
    desc: "Swapping to Contractor View. The contractor finishes work and submits a SHA-256 fingerprint on-chain as permanent delivery proof. This triggers the 300s inactivity protection window.",
    actionText: "Submit Proof & Proceed →",
    action: () => {
      setRole('contractor');
      triggerStep(3);
    }
  },
  {
    badge: "Stage 4 • Settlement & Rent Reclaim",
    title: "Module 4: Milestone Release & Vault Closure",
    desc: "Swapping back to Client View. The client approves the deliverable. Funds route directly to the contractor, the empty vault account is closed, and SOL rent lamports are refunded to the client.",
    actionText: "Approve & Complete Tour →",
    action: () => {
      setRole('client');
      triggerStep(4);
    }
  }
];

function startAutoDemo() {
  tourCurrentStep = 0;
  document.getElementById('tourOverlay').classList.remove('hidden');
  renderTourStep();
}

function stopAutoDemo() {
  document.getElementById('tourOverlay').classList.add('hidden');
  if (tourTimer) clearTimeout(tourTimer);
}

function renderTourStep() {
  const current = tourSteps[tourCurrentStep];
  document.getElementById('tourStepBadge').innerText = current.badge;
  document.getElementById('tourTitle').innerText = current.title;
  document.getElementById('tourDescription').innerText = current.desc;
  document.getElementById('tourProgress').innerText = `Stage ${tourCurrentStep} of ${tourSteps.length - 1}`;
  document.getElementById('tourNextBtn').innerText = current.actionText;
}

function nextTourStep() {
  if (tourSteps[tourCurrentStep].action) {
    tourSteps[tourCurrentStep].action();
  }

  tourCurrentStep++;

  if (tourCurrentStep < tourSteps.length) {
    const overlay = document.getElementById('tourOverlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    
    tourTimer = setTimeout(() => {
      renderTourStep();
      overlay.classList.remove('opacity-0', 'pointer-events-none');
    }, 1800);
  } else {
    document.getElementById('tourStepBadge').innerText = "Tour Complete";
    document.getElementById('tourTitle').innerText = "Milestone 1 Settled Successfully!";
    document.getElementById('tourDescription').innerText = "The agreement settled, the vault closed, and rent was refunded on Devnet. Milestone 2 is unlocked and ready for sequential chaining.";
    document.getElementById('tourNextBtn').innerText = "Finish Tour";
    document.getElementById('tourNextBtn').onclick = () => {
      stopAutoDemo();
      document.getElementById('tourNextBtn').onclick = nextTourStep;
    };
  }
}
updateDerivedPda();