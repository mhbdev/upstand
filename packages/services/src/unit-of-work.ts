import type { DatabaseExecutor, DatabaseTransactionClient } from "@upstand/db";

export type TransactionCallback<T> = (
  tx: DatabaseTransactionClient,
) => Promise<T>;

export class UnitOfWork {
  constructor(private readonly db: DatabaseExecutor) {}

  transaction<T>(callback: TransactionCallback<T>) {
    return this.db.transaction(callback);
  }
}
