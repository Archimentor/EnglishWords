import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { inspectContentSourceCaches, type ContentSourceCacheStatus } from './fetchSources'

export function hasUnverifiedCaches(statuses: readonly ContentSourceCacheStatus[]): boolean {
  return statuses.some((status) => !status.verified)
}

export function formatContentSourceReport(statuses: readonly ContentSourceCacheStatus[]): string {
  return JSON.stringify(statuses.map((status) => ({
    id: status.source.id,
    url: status.source.url,
    license: status.source.license,
    attribution: status.source.attribution,
    expectedSha256: status.source.sha256,
    cachePresent: status.cachePresent,
    verified: status.verified,
    verificationError: status.verificationError,
  })), null, 2)
}

async function main(): Promise<void> {
  const statuses = await inspectContentSourceCaches()
  console.log(formatContentSourceReport(statuses))

  if (hasUnverifiedCaches(statuses)) {
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]

if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main()
}
