/**
 * Test Utilities
 *
 * Shared utils for writing tests
 */

// DEFAULT env is better-sqlite3
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'testing';
}

// Require overrides - these add globals for tests
require('./overrides');

// Require assertions - adds custom should assertions
require('./assertions');

module.exports.db = require('./db');
