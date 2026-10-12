use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod equator_protocol {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        invoice_id: String,
        amount: u64,
        timeout_seconds: i64,
    ) -> Result<()> {
        require!(invoice_id.len() <= 32, EscrowError::InvoiceIdTooLong);
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(timeout_seconds > 0, EscrowError::InvalidTimeout);

        let escrow = &mut ctx.accounts.escrow_state;
        escrow.client = ctx.accounts.client.key();
        escrow.contractor = ctx.accounts.contractor.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.invoice_id = invoice_id;
        escrow.amount = amount;
        escrow.deliverable_hash = [0u8; 32];
        escrow.submission_timestamp = 0;
        escrow.timeout_seconds = timeout_seconds;
        escrow.status = EscrowStatus::Initialized;
        escrow.bump = ctx.bumps.escrow_state;
        escrow.vault_bump = ctx.bumps.vault;

        msg!("Escrow Initialized for Invoice: {}", escrow.invoice_id);
        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        require!(
            escrow.status == EscrowStatus::Initialized,
            EscrowError::InvalidStatus
        );

        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.client_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.client.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, escrow.amount)?;

        escrow.status = EscrowStatus::Funded;
        msg!("Escrow Funded with {} micro-USDC", escrow.amount);
        Ok(())
    }

    pub fn submit_deliverable(
        ctx: Context<SubmitDeliverable>,
        deliverable_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        require!(
            escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatus
        );

        let clock = Clock::get()?;
        escrow.deliverable_hash = deliverable_hash;
        escrow.submission_timestamp = clock.unix_timestamp;
        escrow.status = EscrowStatus::Submitted;

        msg!(
            "Deliverable submitted at timestamp: {}",
            escrow.submission_timestamp
        );
        Ok(())
    }

    pub fn release_milestone(ctx: Context<ReleaseMilestone>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        require!(
            escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );

        let client_key = escrow.client;
        let invoice_bytes = escrow.invoice_id.as_bytes();
        let seeds = &[
            b"escrow",
            client_key.as_ref(),
            invoice_bytes,
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.contractor_token_account.to_account_info(),
                authority: escrow.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, ctx.accounts.vault.amount)?;

        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.client.to_account_info(),
                authority: escrow.to_account_info(),
            },
            signer,
        );
        token::close_account(close_ctx)?;

        escrow.status = EscrowStatus::Released;
        msg!("Escrow released via client approval");
        Ok(())
    }

    pub fn claim_timeout_release(ctx: Context<ClaimTimeoutRelease>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        require!(
            escrow.status == EscrowStatus::Submitted,
            EscrowError::InvalidStatus
        );

        let clock = Clock::get()?;
        let elapsed = clock.unix_timestamp - escrow.submission_timestamp;
        require!(
            elapsed >= escrow.timeout_seconds,
            EscrowError::TimeoutNotElapsed
        );

        let client_key = escrow.client;
        let invoice_bytes = escrow.invoice_id.as_bytes();
        let seeds = &[
            b"escrow",
            client_key.as_ref(),
            invoice_bytes,
            &[escrow.bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.contractor_token_account.to_account_info(),
                authority: escrow.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, ctx.accounts.vault.amount)?;

        let close_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.client.to_account_info(),
                authority: escrow.to_account_info(),
            },
            signer,
        );
        token::close_account(close_ctx)?;

        escrow.status = EscrowStatus::Released;
        msg!("Escrow released automatically via timeout expiration");
        Ok(())
    }

    pub fn cancel_refund(ctx: Context<CancelRefund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_state;
        require!(
            escrow.status == EscrowStatus::Initialized || escrow.status == EscrowStatus::Funded,
            EscrowError::CannotCancel
        );

        if escrow.status == EscrowStatus::Funded && ctx.accounts.vault.amount > 0 {
            let client_key = escrow.client;
            let invoice_bytes = escrow.invoice_id.as_bytes();
            let seeds = &[
                b"escrow",
                client_key.as_ref(),
                invoice_bytes,
                &[escrow.bump],
            ];
            let signer = &[&seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.client_token_account.to_account_info(),
                    authority: escrow.to_account_info(),
                },
                signer,
            );
            token::transfer(transfer_ctx, ctx.accounts.vault.amount)?;

            let close_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: ctx.accounts.vault.to_account_info(),
                    destination: ctx.accounts.client.to_account_info(),
                    authority: escrow.to_account_info(),
                },
                signer,
            );
            token::close_account(close_ctx)?;
        }

        escrow.status = EscrowStatus::Cancelled;
        msg!("Escrow cancelled and refunded");
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(invoice_id: String)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: The contractor's public key
    pub contractor: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = client,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", client.key().as_ref(), invoice_id.as_bytes()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        init,
        payer = client,
        token::mint = mint,
        token::authority = escrow_state,
        seeds = [b"vault", escrow_state.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    #[account(
        mut,
        constraint = client_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
        constraint = client_token_account.owner == client.key() @ EscrowError::Unauthorized
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SubmitDeliverable<'info> {
    pub contractor: Signer<'info>,
    #[account(
        mut,
        has_one = contractor @ EscrowError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: Contractor receives funds
    #[account(mut, address = escrow_state.contractor @ EscrowError::Unauthorized)]
    pub contractor: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    #[account(
        mut,
        constraint = contractor_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
        constraint = contractor_token_account.owner == escrow_state.contractor @ EscrowError::Unauthorized
    )]
    pub contractor_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimTimeoutRelease<'info> {
    #[account(mut)]
    pub contractor: Signer<'info>,
    /// CHECK: Client receives refunded rent from closing the vault
    #[account(mut, address = escrow_state.client)]
    pub client: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = contractor @ EscrowError::Unauthorized,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    #[account(
        mut,
        constraint = contractor_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
        constraint = contractor_token_account.owner == contractor.key() @ EscrowError::Unauthorized
    )]
    pub contractor_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelRefund<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        has_one = vault @ EscrowError::InvalidVault,
    )]
    pub escrow_state: Account<'info, EscrowState>,
    #[account(
        mut,
        constraint = client_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
        constraint = client_token_account.owner == client.key() @ EscrowError::Unauthorized
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub client: Pubkey,
    pub contractor: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    #[max_len(32)]
    pub invoice_id: String,
    pub amount: u64,
    pub deliverable_hash: [u8; 32],
    pub submission_timestamp: i64,
    pub timeout_seconds: i64,
    pub status: EscrowStatus,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Initialized,
    Funded,
    Submitted,
    Released,
    Cancelled,
}

#[error_code]
pub enum EscrowError {
    #[msg("Unauthorized account for this operation")]
    Unauthorized,
    #[msg("Invoice ID cannot exceed 32 characters")]
    InvoiceIdTooLong,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Timeout duration must be positive")]
    InvalidTimeout,
    #[msg("Operation invalid in the current escrow state")]
    InvalidStatus,
    #[msg("Timeout period has not yet elapsed")]
    TimeoutNotElapsed,
    #[msg("Cannot cancel an escrow in this state")]
    CannotCancel,
    #[msg("Provided token account does not match expected escrow mint")]
    InvalidMint,
    #[msg("Provided vault does not match the stored vault account")]
    InvalidVault,
}