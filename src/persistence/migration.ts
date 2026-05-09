// Migration framework for schema version upgrades.
// NOTE: The actual migration logic lives inline in repository.ts's upgrade()
// callback. This module keeps CURRENT_VERSION in sync with schema.ts.

export const CURRENT_VERSION = 5;

export interface Migration {
  version: number;
  migrate: (db: IDBDatabase) => void;
}

export const migrations: Migration[] = [];
