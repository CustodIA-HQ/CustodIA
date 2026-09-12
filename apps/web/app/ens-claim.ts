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
