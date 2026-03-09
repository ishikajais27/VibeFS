import * as fs from 'fs'
import * as path from 'path'
import { TemplateTree } from '../templates'

export async function createStructure(
  basePath: string,
  tree: TemplateTree,
): Promise<void> {
  for (const [name, entry] of Object.entries(tree)) {
    const fullPath = path.join(basePath, name)

    if (entry.type === 'folder') {
      fs.mkdirSync(fullPath, { recursive: true })
      await createStructure(fullPath, entry.children)
    } else {
      fs.writeFileSync(fullPath, entry.content, 'utf-8')
    }
  }
}
