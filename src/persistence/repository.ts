import { openDB, type IDBPDatabase } from 'idb';
import type { StoreNames, StoreValue, IndexNames, IndexKey } from 'idb';
import { type FudaDB, DB_NAME, DB_VERSION } from './schema';

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<FudaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<FudaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FudaDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // v1 stores
          db.createObjectStore('sessions', { keyPath: 'id' });

          const lanes = db.createObjectStore('lanes', { keyPath: 'id' });
          lanes.createIndex('by-session', 'sessionId');

          const nodes = db.createObjectStore('nodes', { keyPath: 'id' });
          nodes.createIndex('by-session', 'sessionId');
          nodes.createIndex('by-lane', 'laneId');

          const edges = db.createObjectStore('edges', { keyPath: 'id' });
          edges.createIndex('by-session', 'sessionId');

          const promotions = db.createObjectStore('promotions', { keyPath: 'id' });
          promotions.createIndex('by-session', 'sessionId');
          promotions.createIndex('by-lane', 'laneId');

          const lanePlans = db.createObjectStore('lanePlans', { keyPath: 'id' });
          lanePlans.createIndex('by-session', 'sessionId');
          lanePlans.createIndex('by-lane', 'laneId');

          const unifiedPlans = db.createObjectStore('unifiedPlans', { keyPath: 'id' });
          unifiedPlans.createIndex('by-session', 'sessionId');

          const dialogueTurns = db.createObjectStore('dialogueTurns', { keyPath: 'id' });
          dialogueTurns.createIndex('by-session', 'sessionId');
          dialogueTurns.createIndex('by-node', 'nodeId');

          const jobs = db.createObjectStore('jobs', { keyPath: 'id' });
          jobs.createIndex('by-session', 'sessionId');
        }

        if (oldVersion < 2) {
          const planTalkTurns = db.createObjectStore('planTalkTurns', { keyPath: 'id' });
          planTalkTurns.createIndex('by-session', 'sessionId');
          planTalkTurns.createIndex('by-unified-plan', 'unifiedPlanId');
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/** Insert or update an entity in a store. Returns the key. */
export async function putEntity<Name extends StoreNames<FudaDB>>(
  storeName: Name,
  entity: StoreValue<FudaDB, Name>,
): Promise<string> {
  const db = await getDB();
  // StoreKey<FudaDB, Name> is always `string` for our schema, but idb
  // returns IDBValidKey. We cast to keep the call-site ergonomic.
  const key = (await db.put(storeName, entity)) as string;
  return key;
}

/** Retrieve a single entity by primary key. Returns `undefined` if not found. */
export async function getEntity<Name extends StoreNames<FudaDB>>(
  storeName: Name,
  key: string,
): Promise<StoreValue<FudaDB, Name> | undefined> {
  const db = await getDB();
  const entity = await db.get(storeName, key);
  // Basic sanity check: every entity must have an `id` field.
  if (entity && typeof (entity as Record<string, unknown>).id !== 'string') {
    return undefined;
  }
  return entity;
}

/** Retrieve all entities matching an index value. */
export async function getAllByIndex<
  Name extends StoreNames<FudaDB>,
  Idx extends IndexNames<FudaDB, Name>,
>(
  storeName: Name,
  indexName: Idx,
  key: IndexKey<FudaDB, Name, Idx>,
): Promise<StoreValue<FudaDB, Name>[]> {
  const db = await getDB();
  return db.getAllFromIndex(storeName, indexName, key);
}

/** Delete a single entity by primary key. */
export async function deleteEntity<Name extends StoreNames<FudaDB>>(
  storeName: Name,
  key: string,
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName, key);
}

// ---------------------------------------------------------------------------
// Session envelope loader
// ---------------------------------------------------------------------------

export interface SessionEnvelope {
  session: StoreValue<FudaDB, 'sessions'>;
  lanes: StoreValue<FudaDB, 'lanes'>[];
  nodes: StoreValue<FudaDB, 'nodes'>[];
  edges: StoreValue<FudaDB, 'edges'>[];
  promotions: StoreValue<FudaDB, 'promotions'>[];
  lanePlans: StoreValue<FudaDB, 'lanePlans'>[];
  unifiedPlans: StoreValue<FudaDB, 'unifiedPlans'>[];
  dialogueTurns: StoreValue<FudaDB, 'dialogueTurns'>[];
  planTalkTurns: StoreValue<FudaDB, 'planTalkTurns'>[];
}

/**
 * Load a complete session and all related entities in parallel.
 * Throws if the session itself is not found.
 */
export async function loadSessionEnvelope(
  sessionId: string,
): Promise<SessionEnvelope> {
  const db = await getDB();

  const [session, lanes, nodes, edges, promotions, lanePlans, unifiedPlans, dialogueTurns, planTalkTurns] =
    await Promise.all([
      db.get('sessions', sessionId),
      db.getAllFromIndex('lanes', 'by-session', sessionId),
      db.getAllFromIndex('nodes', 'by-session', sessionId),
      db.getAllFromIndex('edges', 'by-session', sessionId),
      db.getAllFromIndex('promotions', 'by-session', sessionId),
      db.getAllFromIndex('lanePlans', 'by-session', sessionId),
      db.getAllFromIndex('unifiedPlans', 'by-session', sessionId),
      db.getAllFromIndex('dialogueTurns', 'by-session', sessionId),
      db.getAllFromIndex('planTalkTurns', 'by-session', sessionId),
    ]);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return { session, lanes, nodes, edges, promotions, lanePlans, unifiedPlans, dialogueTurns, planTalkTurns };
}
