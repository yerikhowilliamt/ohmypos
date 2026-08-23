import { execSync } from 'child_process';
import allowlistData from '../audit-allowlist.json' with { type: 'json' };

const allowedIds = new Set(allowlistData.allowlist.map((item) => item.id));

function checkAdvisories(advisories) {
  const unallowed = [];
  for (const [id, advisory] of Object.entries(advisories || {})) {
    const ghsaId = advisory.github_advisory_id || id;
    if (!allowedIds.has(ghsaId)) {
      unallowed.push(`${ghsaId} (${advisory.module_name}): ${advisory.title}`);
    }
  }
  return unallowed;
}

try {
  const output = execSync('pnpm audit --json', { encoding: 'utf-8' });
  const report = JSON.parse(output);
  const unallowed = checkAdvisories(report.advisories);

  if (unallowed.length > 0) {
    console.error('Security audit found unapproved vulnerabilities:');
    unallowed.forEach((u) => console.error(` - ${u}`));
    process.exit(1);
  } else {
    console.log('pnpm audit passed with verified allowlist.');
  }
} catch (error) {
  if (error.stdout) {
    try {
      const report = JSON.parse(error.stdout);
      const unallowed = checkAdvisories(report.advisories);

      if (unallowed.length > 0) {
        console.error('Security audit found unapproved vulnerabilities:');
        unallowed.forEach((u) => console.error(` - ${u}`));
        process.exit(1);
      } else {
        console.log('pnpm audit passed with verified allowlist.');
      }
    } catch {
      console.error(error.message);
      process.exit(1);
    }
  } else {
    console.error(error.message);
    process.exit(1);
  }
}
