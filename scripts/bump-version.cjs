// Updates version in tauri.conf.json and Cargo.toml.
// Usage: node scripts/bump-version.js <version>
const fs = require('fs')

const ver = process.argv[2]
if (!ver || !/^\d+\.\d+\.\d+/.test(ver)) {
  console.error('Usage: node scripts/bump-version.js <semver>')
  process.exit(1)
}

function patch(file, pattern, replacement) {
  let s = fs.readFileSync(file, 'utf8')
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1) // strip BOM
  const updated = s.replace(pattern, replacement)
  if (updated === s) {
    console.error(`  WARN: pattern not matched in ${file}`)
    process.exit(1)
  }
  fs.writeFileSync(file, updated, 'utf8')
  console.log(`  ${file} -> ${ver}`)
}

patch('src-tauri/tauri.conf.json', /"version":\s*"[^"]+"/, `"version": "${ver}"`)
patch('src-tauri/Cargo.toml',      /^version = "[^"]+"/m,  `version = "${ver}"`)
