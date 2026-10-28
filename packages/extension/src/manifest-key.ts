/**
 * Public half of the extension's RSA key. It pins the extension ID to
 * EXTENSION_ID in packages/core/src/constants.ts, which the helper's Native
 * Messaging manifest whitelists (ADR-0001). Never change it: every installed
 * helper would stop working. The private half is not needed for unpacked
 * installs and is not in the repo.
 */
export const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp3d676Cr9yveuH/bcuNYoIqH/sZOCR6/68OaL3YhJV43INE6jwBhjsBM5DuNWBv7qYzqKC/EEKwtZaYV5/A6wT+QouM8X1dzzzk9h8tK1atz0ah465YzoPCBKO1czaDSKmtQFe88Jm7+yYd8Qi0BXS7MJjxzveJenjtqwOCIZDGQtMAOipu7Dyu8TCKRkU4lLpD1GGszYa09hrQOKB1A4ETmC7wemrGgaYB9WTWtrMPh1cPs8MI282C0O1npGO+uM/uuorBNTEpukExIoqim4tjW+m89fXSiyj4m33/JWhexEiPjutvUQFzK2mlm/edeUyoRijivvWYly/8a6WuvOwIDAQAB';
