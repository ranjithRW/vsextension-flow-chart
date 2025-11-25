const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const root = process.cwd();
const inputFenced = path.join(root, 'wholeflow.mmd');
const inputRaw = path.join(root, 'wholeflow_raw.mmd');
const outSvg = path.join(root, 'wholeflow.svg');

if (!fs.existsSync(inputFenced)) {
    console.error('Error: wholeflow.mmd not found in the workspace root. Run `npm run generate-flow` first.');
    process.exit(1);
}

const fenced = fs.readFileSync(inputFenced, 'utf8');

// Strip triple-backtick fences and optional language marker
const match = fenced.match(/```\s*mermaid\s*\n([\s\S]*?)\n```/i);
let mermaidText = '';
if (match && match[1]) {
    mermaidText = match[1];
} else {
    // Fallback: try to remove any ``` fences
    mermaidText = fenced.replace(/```/g, '').trim();
}

if (!mermaidText || mermaidText.trim().length === 0) {
    console.error('No mermaid content found in wholeflow.mmd');
    process.exit(1);
}

fs.writeFileSync(inputRaw, mermaidText, 'utf8');
console.log('Wrote', inputRaw);

// Create a temporary mermaid config to increase allowed text size
const tempConfigName = 'mmdc-temp-config.json';
const tempConfigPath = path.join(root, tempConfigName);
const mermaidConfig = {
    maxTextSize: 1000000
};
try {
    fs.writeFileSync(tempConfigPath, JSON.stringify(mermaidConfig), 'utf8');
    console.log('Wrote temporary mermaid config:', tempConfigPath);
} catch (e) {
    console.warn('Could not write temporary mermaid config, continuing without it:', e.message);
}

// Run mmdc via npx so users don't have to install globally
// First try using `npm exec mmdc` (robust when workspace path contains spaces)
console.log('Trying `npm exec mmdc` (this will download/run the CLI if necessary)...');
// prefer passing the temporary config file so mmdc increases maxTextSize
let res = spawnSync('npm', ['exec', '--', 'mmdc', '-i', inputRaw, '-o', outSvg, '--configFile', tempConfigPath], { stdio: 'inherit', shell: true });
if (!res.error && res.status === 0) {
    console.log('Generated SVG:', outSvg);
    process.exit(0);
}

// If npm exec failed, try a local binary if present
const localMmdc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');
if (fs.existsSync(localMmdc)) {
    console.log('Found local mmdc at', localMmdc);
    if (process.platform === 'win32') {
        // Use cmd /c with quoted command to handle spaces in path and include config
        const cmd = `"${localMmdc}" -i "${inputRaw}" -o "${outSvg}" --configFile "${tempConfigPath}"`;
        res = spawnSync('cmd', ['/c', cmd], { stdio: 'inherit', shell: true });
    } else {
        res = spawnSync(localMmdc, ['-i', inputRaw, '-o', outSvg, '--configFile', tempConfigPath], { stdio: 'inherit' });
    }

    if (res && res.error) {
        console.error('Failed to run local mmdc:', res.error);
        process.exit(1);
    }
    if (res && res.status === 0) {
        console.log('Generated SVG:', outSvg);
        // cleanup temp config
        try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch (e) {}
        process.exit(0);
    }
    if (res && res.status) {
        console.error('mmdc exited with code', res.status);
        // cleanup temp config
        try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch (e) {}
        process.exit(res.status || 1);
    }
}

console.error('\nFailed to run Mermaid CLI automatically.');
console.error('You can install it locally and run it, for example:');
console.error('  npm install -D @mermaid-js/mermaid-cli');
console.error('  npx mmdc -i wholeflow_raw.mmd -o wholeflow.svg --configFile mmdc-temp-config.json');
// try to cleanup temp config if present
try { if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath); } catch (e) {}
process.exit(res && res.status ? res.status : 1);
