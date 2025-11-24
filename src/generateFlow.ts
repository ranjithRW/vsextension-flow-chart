import * as fs from 'fs';
import * as path from 'path';

type FileNode = {
    filePath: string;
    relPath: string;
    imports: Set<string>;
    functions: string[];
    classes: string[];
};

const IGNORES = ['node_modules', '.git', '.vscode', 'out', 'dist', 'build'];
const TEXT_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.md', '.txt'];

function shouldIgnore(p: string) {
    return IGNORES.some(i => p.includes(i));
}

function getAllFiles(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (shouldIgnore(full)) continue;
        if (stat && stat.isDirectory()) {
            results.push(...getAllFiles(full));
        } else {
            const ext = path.extname(full).toLowerCase();
            if (TEXT_EXTS.includes(ext) || ext === '') results.push(full);
        }
    }
    return results;
}

function extractImportsAndSymbols(content: string): { imports: string[]; functions: string[]; classes: string[] } {
    const imports: string[] = [];

    // ES imports
    const importRe = /import\s+(?:[^'";]+from\s+)?['"]([^'"]+)['"];?/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
        imports.push(m[1]);
    }

    // CommonJS require
    const requireRe = /require\(['"]([^'"]+)['"]\)/g;
    while ((m = requireRe.exec(content)) !== null) {
        imports.push(m[1]);
    }

    // Simple function and class extraction (best-effort)
    const functions: string[] = [];
    const functionRe = /function\s+([a-zA-Z0-9_]+)\s*\(|const\s+([a-zA-Z0-9_]+)\s*=\s*\(?\s*\)?\s*=>/g;
    while ((m = functionRe.exec(content)) !== null) {
        const name = m[1] || m[2];
        if (name) functions.push(name);
    }

    const classes: string[] = [];
    const classRe = /class\s+([a-zA-Z0-9_]+)/g;
    while ((m = classRe.exec(content)) !== null) {
        classes.push(m[1]);
    }

    return { imports, functions, classes };
}

function resolveImport(fromFile: string, imp: string, root: string): string | null {
    // Only resolve relative imports (./ or ../) to files inside the workspace
    if (imp.startsWith('.') || imp.startsWith('/')) {
        // Try various extensions
        const base = path.resolve(path.dirname(fromFile), imp);
        const candidates = [base, base + '.ts', base + '.js', base + '.tsx', base + '.jsx', path.join(base, 'index.ts'), path.join(base, 'index.js')];
        for (const c of candidates) {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
        }
    }
    return null;
}

function makeId(s: string) {
    return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
}

function buildMermaid(nodes: FileNode[], root: string): string {
    const byPath = new Map(nodes.map(n => [path.resolve(n.filePath), n]));

    let out = 'flowchart TD\n';

    // Create file nodes as subgraphs with their functions/classes
    for (const n of nodes) {
        const id = makeId(n.relPath);
        out += `    subgraph ${id}[${n.relPath}]\n`;
        for (const fn of n.functions.slice(0, 8)) {
            const nid = makeId(n.relPath + '_' + fn);
            out += `        ${nid}["fn: ${fn}"]\n`;
        }
        for (const c of n.classes.slice(0, 8)) {
            const cid = makeId(n.relPath + '_' + c);
            out += `        ${cid}["class: ${c}"]\n`;
        }
        out += '    end\n';
    }

    // Create edges for imports (file -> imported file)
    for (const n of nodes) {
        const from = makeId(n.relPath);
        for (const imp of n.imports) {
            const resolved = resolveImport(n.filePath, imp, root);
            if (resolved) {
                const targetNode = byPath.get(path.resolve(resolved));
                if (targetNode) {
                    const to = makeId(targetNode.relPath);
                    out += `    ${from} --> ${to}\n`;
                }
            } else {
                // external import - show as external node
                if (!imp.startsWith('.')) {
                    const extId = makeId('ext_' + imp);
                    out += `    ${from} --> ${extId}["${imp}"]\n`;
                }
            }
        }
    }

    return out;
}

function main() {
    const root = process.cwd();
    console.log('Scanning workspace:', root);

    const files = getAllFiles(root);
    const nodes: FileNode[] = [];

    for (const f of files) {
        try {
            const content = fs.readFileSync(f, 'utf-8');
            const { imports, functions, classes } = extractImportsAndSymbols(content);
            nodes.push({ filePath: f, relPath: path.relative(root, f), imports: new Set(imports), functions, classes });
        } catch (err) {
            // skip unreadable
        }
    }

    if (nodes.length === 0) {
        console.error('No files found to analyze.');
        process.exit(1);
    }

    const mermaid = buildMermaid(nodes, root);

    const outFile = path.join(root, 'wholeflow.mmd');
    fs.writeFileSync(outFile, '```mermaid\n' + mermaid + '\n```\n', 'utf-8');
    console.log('Wrote flow to', outFile);
    console.log('You can open this file in VS Code or paste the Mermaid block into a Mermaid live editor.');
}

if (require.main === module) main();
