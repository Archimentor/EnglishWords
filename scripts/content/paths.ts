import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTENT_SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
export const CONTENT_REPOSITORY_ROOT = resolve(CONTENT_SCRIPT_DIRECTORY, '../..')
export const DEFAULT_CONTENT_CACHE_ROOT = join(CONTENT_REPOSITORY_ROOT, '.content-cache')
export const DEFAULT_CONTENT_DATA_ROOT = join(CONTENT_REPOSITORY_ROOT, 'public', 'data')
export const DEFAULT_MANUAL_STORY_ROOT = join(CONTENT_SCRIPT_DIRECTORY, 'manual-stories')
export const PHRASAL_GLOSS_MANIFEST_PATH = join(
  CONTENT_SCRIPT_DIRECTORY,
  'phrasal-glosses.json',
)
