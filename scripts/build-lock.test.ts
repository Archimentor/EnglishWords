import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import {
  acquireBuildLock,
  acquireBuildLocks,
  buildLockPathForDataRoot,
  releaseBuildLocks,
} from './build-lock'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'english-words-build-lock-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('build lock', () => {
  it('places the default-style lock beside the data root with an absolute Windows-safe path', async () => {
    const directory = await makeTemporaryDirectory()
    const dataRoot = join(directory, 'public with spaces', 'data')
    const lockPath = buildLockPathForDataRoot(dataRoot)

    expect(lockPath).toBe(resolve(directory, 'public with spaces', '.content-build.lock'))
    expect(dirname(lockPath)).toBe(dirname(resolve(dataRoot)))
    expect(lockPath.startsWith(`${resolve(dataRoot)}${sep}`)).toBe(false)
  })

  it('fails closed on concurrent or stale acquisition and preserves the existing bytes', async () => {
    const directory = await makeTemporaryDirectory()
    const lockPath = join(directory, '.content-build.lock')
    const firstLock = await acquireBuildLock(lockPath)
    const firstBytes = await readFile(lockPath, 'utf8')

    await expect(acquireBuildLock(lockPath)).rejects.toThrow(
      /Build lock already exists.*Stale locks are not removed automatically/u,
    )
    expect(await readFile(lockPath, 'utf8')).toBe(firstBytes)

    await firstLock.release()
    const nextLock = await acquireBuildLock(lockPath)
    await nextLock.release()
  })

  it('does not delete a lock whose ownership bytes changed', async () => {
    const directory = await makeTemporaryDirectory()
    const lockPath = join(directory, '.content-build.lock')
    const lock = await acquireBuildLock(lockPath)
    const replacement = '{"pid":123,"startedAt":"stale","token":"foreign"}\n'
    await writeFile(lockPath, replacement, 'utf8')

    await expect(lock.release()).rejects.toThrow(/ownership changed/u)
    expect(await readFile(lockPath, 'utf8')).toBe(replacement)
  })

  it('releases earlier locks if a later compatibility lock already exists', async () => {
    const directory = await makeTemporaryDirectory()
    const outerLockPath = join(directory, 'public', '.content-build.lock')
    const legacyLockPath = join(directory, 'public', 'data', '.content-build.lock')
    const staleBytes = '{"pid":123,"startedAt":"stale"}\n'
    await mkdir(dirname(legacyLockPath), { recursive: true })
    await writeFile(legacyLockPath, staleBytes, { encoding: 'utf8', flag: 'wx' })

    await expect(acquireBuildLocks([outerLockPath, legacyLockPath])).rejects.toThrow(
      /Build lock already exists/u,
    )
    await expect(readFile(outerLockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(legacyLockPath, 'utf8')).toBe(staleBytes)
  })

  it('releases a set in reverse acquisition order', async () => {
    const directory = await makeTemporaryDirectory()
    const paths = [join(directory, 'a.lock'), join(directory, 'b.lock')]
    const locks = await acquireBuildLocks(paths)

    await releaseBuildLocks(locks)

    await Promise.all(paths.map(async (path) => {
      await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }))
  })
})
