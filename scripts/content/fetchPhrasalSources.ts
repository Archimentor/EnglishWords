import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PHRASAL_CONTENT_SOURCES } from './buildPhrasalCatalog'
import { fetchContentSources } from './fetchSources'

export async function fetchPhrasalContentSources(): Promise<void> {
  await fetchContentSources(fetch, PHRASAL_CONTENT_SOURCES)
}

const invokedPath = process.argv[1]

if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await fetchPhrasalContentSources()
}
