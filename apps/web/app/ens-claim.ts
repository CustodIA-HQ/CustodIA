export const claimMessage = (wallet: string, name: string): string =>
  [
    "CustodIA ENS claim",
    "",
    `Wallet: ${wallet}`,
    `Name: ${name}`,
    "",
    "I confirm this wallet owns this ENS identity.",
    "Task workflows will be published as subnames of this name.",
  ].join("\n");

export const releaseMessage = (wallet: string, name: string): string =>
  [
    "CustodIA ENS release",
    "",
    `Wallet: ${wallet}`,
    `Name: ${name}`,
    "",
    "I release this ENS identity. Its records will be cleared and the name freed.",
    "This does not approve a transaction from my wallet or move funds.",
  ].join("\n");
