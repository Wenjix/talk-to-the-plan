// For v1, no migrations needed. This module provides the framework
// for future schema version upgrades.

export const CURRENT_VERSION = 2;

export interface Migration {
  version: number;
  migrate: (db: IDBDatabase) => void;
}

export const migrations: Migration[] = [];
