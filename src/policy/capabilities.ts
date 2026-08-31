export type Capability =
  | "research.public_web"
  | "content.draft"
  | "content.publish_authorized"
  | "product.design"
  | "product.build"
  | "commerce.create_offer"
  | "customer.respond_authorized"
  | "finance.record_revenue"
  | "finance.spend_within_budget"
  | "finance.transfer_funds"
  | "finance.withdraw_funds"
  | "finance.open_account"
  | "finance.borrow_or_credit"
  | "legal.sign_contract"
  | "identity.submit_kyc"
  | "identity.change_account_owner"
  | "identity.forge_document"
  | "identity.impersonate_human"
  | "security.exfiltrate_credentials"
  | "security.bypass_platform_controls";

export const ALWAYS_DENY = new Set<Capability>([
  "identity.forge_document",
  "identity.impersonate_human",
  "security.exfiltrate_credentials",
  "security.bypass_platform_controls",
]);

export const OWNER_APPROVAL_REQUIRED = new Set<Capability>([
  "finance.transfer_funds",
  "finance.withdraw_funds",
  "finance.open_account",
  "finance.borrow_or_credit",
  "legal.sign_contract",
  "identity.submit_kyc",
  "identity.change_account_owner",
]);

export const AUTONOMOUSLY_ELIGIBLE = new Set<Capability>([
  "research.public_web",
  "content.draft",
  "content.publish_authorized",
  "product.design",
  "product.build",
  "commerce.create_offer",
  "customer.respond_authorized",
  "finance.record_revenue",
  "finance.spend_within_budget",
]);
