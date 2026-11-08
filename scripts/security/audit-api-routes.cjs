const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const api = path.join(root, 'app', 'api');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'route.ts' || entry.name === 'route.js') files.push(full);
  }
}
walk(api);
const rows = files.sort().map(file => {
  const source = fs.readFileSync(file, 'utf8');
  const checks = {
    firebaseTokenVerification: /verifyIdToken\s*\(/.test(source),
    featureAuthorization: /requireFeatureAccess|require-feature-access/.test(source),
    adminAuthorization: /requireAdmin|isAllowlistedAdmin|adminAuth/.test(source),
    rateLimiting: /enforceRateLimit|enforceIpRateLimit|rate-limit/.test(source),
    sameOrigin: /enforceSameOrigin/.test(source),
    boundedJson: /readJsonBody/.test(source),
  };
  return { route: path.relative(root, file).replace(/\\/g, '/'), ...checks };
});
console.log('STATIC API SECURITY INVENTORY');
console.log('These are pattern indicators only, NOT proof that a route is secure. Review each handler and every HTTP method.\n');
for (const row of rows) {
  const flags = Object.entries(row).slice(1).map(([k,v]) => `${v ? '[+]':'[ ]'} ${k}`).join(' | ');
  console.log(`${row.route}\n  ${flags}`);
}
console.log(`\nScanned ${rows.length} API route files.`);
console.log('A missing indicator may be intentional for public routes; a present indicator may still be incorrectly ordered or scoped.');
