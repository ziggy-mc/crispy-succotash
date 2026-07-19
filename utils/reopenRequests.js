/**
 * In-memory set of bugIds that currently have a pending reopen request.
 * Prevents a reporter from submitting multiple requests for the same bug.
 * Cleared when staff approves or denies the request.
 */
const pendingReopens = new Set();

module.exports = { pendingReopens };