import { composeChampionFile } from './champion-file.js';
import { restoreProjectBackup, showRestoreFailure } from './backup-coordinator.js';

export let restoreActive = false;
// Cloud codes and old City files are deliberately restored into a new project:
// their smaller snapshot cannot inherit an unrelated wallet or learning book.
export async function restoreChampion(state, snapshot, suspend = () => {}) {
  if (restoreActive) return;
  restoreActive = true;
  try {
    await restoreProjectBackup(composeChampionFile(state, 'Restored City snapshot'));
    suspend(); location.reload();
  } catch (error) {
    restoreActive = false;
    showRestoreFailure(error, composeChampionFile(state, 'Restored City snapshot'));
  }
}
