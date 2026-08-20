import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export const DEFAULT_CONTENT_DATA_ROOT = resolve('public/data')

export function buildLockPathForDataRoot(
  dataRoot = DEFAULT_CONTENT_DATA_ROOT,
): string {
  return join(dirname(resolve(dataRoot)), '.content-build.lock')
}

export const DEFAULT_BUILD_LOCK_PATH = buildLockPathForDataRoot()
export const LEGACY_CONTENT_BUILD_LOCK_PATH = join(
  DEFAULT_CONTENT_DATA_ROOT,
  '.content-build.lock',
)

export interface BuildLock {
  readonly path: string
  release(): Promise<void>
}

interface LockMetadata {
  pid: number
  startedAt: string
  token: string
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isExistingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

async function closeAndRemoveOwnedLock(
  handle: FileHandle,
  lockPath: string,
): Promise<unknown[]> {
  const failures: unknown[] = []
  try {
    await handle.close()
  } catch (error) {
    failures.push(error)
    return failures
  }

  try {
    await unlink(lockPath)
  } catch (error) {
    if (!isMissingFile(error)) failures.push(error)
  }
  return failures
}

function lockConflictError(lockPath: string, cause: unknown): Error {
  return new Error(
    `Build lock already exists at ${lockPath}. Another build may be running. `
      + 'Stale locks are not removed automatically; verify that no build is active '
      + 'before removing the lock manually.',
    { cause },
  )
}

export async function acquireBuildLock(
  lockPath = DEFAULT_BUILD_LOCK_PATH,
): Promise<BuildLock> {
  const resolvedLockPath = resolve(lockPath)
  await mkdir(dirname(resolvedLockPath), { recursive: true })

  let handle: FileHandle
  try {
    handle = await open(resolvedLockPath, 'wx')
  } catch (error) {
    if (isExistingFile(error)) throw lockConflictError(resolvedLockPath, error)
    throw error
  }

  const metadata: LockMetadata = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  }
  const serializedMetadata = `${JSON.stringify(metadata)}\n`

  try {
    await handle.writeFile(serializedMetadata, 'utf8')
    await handle.sync()
  } catch (error) {
    const cleanupFailures = await closeAndRemoveOwnedLock(handle, resolvedLockPath)
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        `Failed to initialize and clean up build lock ${resolvedLockPath}`,
        { cause: error },
      )
    }
    throw error
  }

  let handleClosed = false
  let releasePromise: Promise<void> | undefined

  async function release(): Promise<void> {
    let observedMetadata: string
    try {
      observedMetadata = await readFile(resolvedLockPath, 'utf8')
    } catch (error) {
      if (!handleClosed) {
        await handle.close()
        handleClosed = true
      }
      throw new Error(
        `Build lock ownership could not be verified at ${resolvedLockPath}; `
          + 'the lock was not removed.',
        { cause: error },
      )
    }

    if (observedMetadata !== serializedMetadata) {
      if (!handleClosed) {
        await handle.close()
        handleClosed = true
      }
      throw new Error(
        `Build lock ownership changed at ${resolvedLockPath}; the lock was not removed.`,
      )
    }

    if (!handleClosed) {
      await handle.close()
      handleClosed = true
    }

    const metadataAfterClose = await readFile(resolvedLockPath, 'utf8')
    if (metadataAfterClose !== serializedMetadata) {
      throw new Error(
        `Build lock ownership changed at ${resolvedLockPath}; the lock was not removed.`,
      )
    }

    await unlink(resolvedLockPath)
  }

  return {
    path: resolvedLockPath,
    release() {
      releasePromise ??= release()
      return releasePromise
    },
  }
}

export async function acquireBuildLocks(
  lockPaths: readonly string[],
): Promise<BuildLock[]> {
  const uniquePaths = [...new Set(lockPaths.map((path) => resolve(path)))]
  const locks: BuildLock[] = []

  try {
    for (const lockPath of uniquePaths) {
      locks.push(await acquireBuildLock(lockPath))
    }
    return locks
  } catch (error) {
    const cleanupFailures: unknown[] = []
    for (const lock of locks.reverse()) {
      try {
        await lock.release()
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError)
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        'Build lock acquisition failed and previously acquired locks could not all be released.',
        { cause: error },
      )
    }
    throw error
  }
}

export async function releaseBuildLocks(
  locks: readonly BuildLock[],
): Promise<void> {
  const failures: unknown[] = []
  for (const lock of [...locks].reverse()) {
    try {
      await lock.release()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more build locks could not be released.')
  }
}
