import { test as setup } from '@playwright/test';
import { OWNER_CREDS, ADMIN_CREDS, KASIR_CREDS } from './fixtures';

// We don't persist state files; tests log in directly.
setup('setup placeholder', async () => {
  void OWNER_CREDS;
  void ADMIN_CREDS;
  void KASIR_CREDS;
});
