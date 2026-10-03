// Container health check: exit 0 when the app answers /api/health with a seeded database.
fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`)
  .then(async (r) => process.exit(r.ok && (await r.json()).data?.ayat > 0 ? 0 : 1))
  .catch(() => process.exit(1));
