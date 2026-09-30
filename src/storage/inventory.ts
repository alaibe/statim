type RetentionAreas = {
  account: readonly string[];
  device: readonly string[];
};

export type Medium = 'vault' | 'files' | 'database';

export const STORAGE_INVENTORY = {
  vault: {
    account: ['account.'],
    device: ['accounts.', 'security.'],
  },
  files: {
    account: ['attachments', 'gifs', 'stickers', 'tdlib', 'matrix'],
    device: [],
  },
  database: {
    account: ['account-{account}.db'],
    device: [],
  },
} as const satisfies Record<Medium, RetentionAreas>;

export const OWNED_DIRECTORIES = STORAGE_INVENTORY.files.account;
export type FileArea = (typeof OWNED_DIRECTORIES)[number];
