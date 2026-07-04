// Ensures e2e tests run against the dedicated nexo_test database and never
// touch the developer's local `nexo` database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://nexo:nexo_dev_password@localhost:5432/nexo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_REFRESH_TTL = '30d';
