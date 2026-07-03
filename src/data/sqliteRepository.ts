import { createLocalRepository, type KeyValueStorage, type LocalRepository } from './localRepository'

export function createSqliteShapedRepository(storage: KeyValueStorage): LocalRepository {
  return createLocalRepository(storage)
}
