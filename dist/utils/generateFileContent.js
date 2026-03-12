"use strict";
// ─── generateFileContent.ts ───────────────────────────────────────────────────
// Uses pollinations.ai text API — completely free, no API key required.
// Drop this file into your src/utils/ folder.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFileContent = generateFileContent;
exports.buildTreeSummary = buildTreeSummary;
const POLLINATIONS_URL = 'https://text.pollinations.ai/';
/**
 * Given a file path (e.g. "src/components/Button.tsx") and the overall
 * project tree as a string, returns simple starter code for that file.
 */
async function generateFileContent(filePath, projectTreeSummary) {
    const prompt = `You are a code generator. Generate simple, clean starter code for the file: "${filePath}"

Project structure context:
${projectTreeSummary}

Rules:
- Output ONLY the raw file content, no markdown, no code fences, no explanation
- Write minimal but functional starter code appropriate for the file type and name
- Use the file extension to determine the language
- Keep it short (under 60 lines)
- If it's a config file (json, yaml, toml), output valid config
- If it's a style file (css, scss), output basic styles
- If it's a markup file (html), output a minimal valid document
- If it's a README.md, output a brief project description based on the folder name
- If unsure, output a short comment explaining what the file is for`;
    try {
        const encodedPrompt = encodeURIComponent(prompt);
        const url = `${POLLINATIONS_URL}${encodedPrompt}?model=openai&seed=42&private=true`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'text/plain' },
            signal: AbortSignal.timeout(15000), // 15s timeout per file
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const content = await response.text();
        return content.trim();
    }
    catch {
        // Fallback: return a simple comment so the file isn't empty
        return generateFallbackContent(filePath);
    }
}
/**
 * Builds a short human-readable summary of the tree for the AI prompt.
 * Limits to 30 lines so the prompt stays small.
 */
function buildTreeSummary(tree, prefix = '', depth = 0, lines = []) {
    if (depth > 4 || lines.length > 30)
        return lines.join('\n');
    for (const [name, entry] of Object.entries(tree)) {
        const e = entry;
        if (e.type === 'folder') {
            lines.push(`${prefix}${name}/`);
            if (e.children)
                buildTreeSummary(e.children, prefix + '  ', depth + 1, lines);
        }
        else {
            lines.push(`${prefix}${name}`);
        }
    }
    return lines.join('\n');
}
// ─── Fallback content by extension ───────────────────────────────────────────
function generateFallbackContent(filePath) {
    const name = filePath.split('/').pop() ?? filePath;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const fallbacks = {
        ts: `// ${name}\n\nexport {}\n`,
        tsx: `// ${name}\nimport React from 'react'\n\nexport default function Component() {\n  return <div>${name}</div>\n}\n`,
        js: `// ${name}\n`,
        jsx: `// ${name}\nexport default function Component() {\n  return <div>${name}</div>\n}\n`,
        css: `/* ${name} */\n`,
        scss: `// ${name}\n`,
        html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <title>App</title>\n</head>\n<body>\n</body>\n</html>\n`,
        json: `{}\n`,
        md: `# ${name.replace('.md', '')}\n`,
        yaml: `# ${name}\n`,
        yml: `# ${name}\n`,
        env: `# Environment variables\n`,
        gitignore: `node_modules/\ndist/\n.env\n`,
        toml: `# ${name}\n`,
        py: `# ${name}\n`,
        go: `package main\n`,
        rs: `// ${name}\n`,
        java: `// ${name}\n`,
    };
    return fallbacks[ext] ?? `// ${name}\n`;
}
