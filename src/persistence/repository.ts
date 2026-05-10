import { openDB, type IDBPDatabase } from 'idb';
import type { StoreNames, StoreValue, IndexNames, IndexKey } from 'idb';
import { type ParallaxDB, DB_NAME, DB_VERSION } from './schema';

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<ParallaxDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ParallaxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ParallaxDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
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

        if (oldVersion < 3) {
          // Remove deprecated lanePlans store (cast needed — store no longer in schema type)
          if ((db.objectStoreNames as DOMStringList).contains('lanePlans')) {
            (db as unknown as { deleteObjectStore(name: string): void }).deleteObjectStore('lanePlans');
          }
        }

        if (oldVersion < 4) {
          const voiceNotes = db.createObjectStore('voiceNotes', { keyPath: 'id' });
          voiceNotes.createIndex('by-session', 'sessionId');
          voiceNotes.createIndex('by-node', 'nodeId');

          db.createObjectStore('voiceNoteBlobs', { keyPath: 'id' });
        }

        if (oldVersion < 5) {
          // Add by-session index to voiceNoteBlobs (store exists from v4).
          // Use the upgrade transaction passed in by idb — db.transaction(name,
          // 'versionchange') is invalid; only 'readonly'/'readwrite' are valid
          // modes and a new transaction can't be opened during a versionchange.
          const blobsStore = transaction.objectStore('voiceNoteBlobs');
          blobsStore.createIndex('by-session', 'sessionId');

          // Backfill sessionId on pre-v5 blobs by looking up the matching
          // voiceNote (same id is used as the primary key for both rows).
          // Without this, legacy rows never appear in the by-session index
          // and become permanent orphans that session-deletion can't reach.
          const notesStore = transaction.objectStore('voiceNotes');
          let cursor = await blobsStore.openCursor();
          while (cursor) {
            const blob = cursor.value as { id: string; sessionId?: string; blob: Blob };
            if (!blob.sessionId) {
              const note = await notesStore.get(blob.id);
              if (note) {
                await cursor.update({
                  id: blob.id,
                  sessionId: note.sessionId,
                  blob: blob.blob,
                });
              }
              // No matching note → blob is already orphaned. Leave it: a
              // migration that silently deletes data is more dangerous than
              // a small permanent leak that explicit cleanup tooling can fix.
            }
            cursor = await cursor.continue();
          }
        }
      },
    }).catch((err) => {
      // Reset the promise on failure so subsequent calls can retry
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/** Insert or update an entity in a store. Returns the key. */
export async function putEntity<Name extends StoreNames<ParallaxDB>>(
  storeName: Name,
  entity: StoreValue<ParallaxDB, Name>,
): Promise<string> {
  const db = await getDB();
  // StoreKey<ParallaxDB, Name> is always `string` for our schema, but idb
  // returns IDBValidKey. We cast to keep the call-site ergonomic.
  const key = (await db.put(storeName, entity)) as string;
  return key;
}

/** Retrieve a single entity by primary key. Returns `undefined` if not found. */
export async function getEntity<Name extends StoreNames<ParallaxDB>>(
  storeName: Name,
  key: string,
): Promise<StoreValue<ParallaxDB, Name> | undefined> {
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
  Name extends StoreNames<ParallaxDB>,
  Idx extends IndexNames<ParallaxDB, Name>,
>(
  storeName: Name,
  indexName: Idx,
  key: IndexKey<ParallaxDB, Name, Idx>,
): Promise<StoreValue<ParallaxDB, Name>[]> {
  const db = await getDB();
  return db.getAllFromIndex(storeName, indexName, key);
}

/** Delete a single entity by primary key. */
export async function deleteEntity<Name extends StoreNames<ParallaxDB>>(
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
  session: StoreValue<ParallaxDB, 'sessions'>;
  lanes: StoreValue<ParallaxDB, 'lanes'>[];
  nodes: StoreValue<ParallaxDB, 'nodes'>[];
  edges: StoreValue<ParallaxDB, 'edges'>[];
  promotions: StoreValue<ParallaxDB, 'promotions'>[];
  unifiedPlans: StoreValue<ParallaxDB, 'unifiedPlans'>[];
  dialogueTurns: StoreValue<ParallaxDB, 'dialogueTurns'>[];
  planTalkTurns: StoreValue<ParallaxDB, 'planTalkTurns'>[];
  voiceNotes: StoreValue<ParallaxDB, 'voiceNotes'>[];
}

/**
 * Load a complete session and all related entities in parallel.
 * Throws if the session itself is not found.
 */
export async function loadSessionEnvelope(
  sessionId: string,
): Promise<SessionEnvelope> {
  const db = await getDB();

  const [session, lanes, nodes, edges, promotions, unifiedPlans, dialogueTurns, planTalkTurns, voiceNotes] =
    await Promise.all([
      db.get('sessions', sessionId),
      db.getAllFromIndex('lanes', 'by-session', sessionId),
      db.getAllFromIndex('nodes', 'by-session', sessionId),
      db.getAllFromIndex('edges', 'by-session', sessionId),
      db.getAllFromIndex('promotions', 'by-session', sessionId),
      db.getAllFromIndex('unifiedPlans', 'by-session', sessionId),
      db.getAllFromIndex('dialogueTurns', 'by-session', sessionId),
      db.getAllFromIndex('planTalkTurns', 'by-session', sessionId),
      db.getAllFromIndex('voiceNotes', 'by-session', sessionId),
    ]);

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return { session, lanes, nodes, edges, promotions, unifiedPlans, dialogueTurns, planTalkTurns, voiceNotes };
}
