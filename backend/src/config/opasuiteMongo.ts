import { MongoClient, Db } from 'mongodb';

// Conexão somente leitura ao MongoDB do OpaSuite (PABX/omnichannel) — usada só
// pela auditoria de retenção, para validar a conversa real por trás de um
// protocolo citado na O.S., em vez de confiar cegamente na nota do operador.

let client: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

async function conectar(): Promise<Db> {
  if (!client) {
    client = new MongoClient(process.env.OPASUITE_MONGO_URI!, { serverSelectionTimeoutMS: 8000 });
  }
  await client.connect();
  return client.db(process.env.OPASUITE_MONGO_DB);
}

export function getOpaSuiteDb(): Promise<Db> {
  if (!dbPromise) dbPromise = conectar();
  return dbPromise;
}
