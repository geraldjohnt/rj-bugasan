/*
 * Security rules tests — run against the Firestore emulator: `npm run test:rules`.
 */
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const OWNER = { uid: 'owner1', email: 'owner@example.com' };
const STRANGER = { uid: 'stranger', email: 'stranger@example.com' };
const as = (u) => env.authenticatedContext(u.uid, { email: u.email }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function bootstrapBatch(db, u, { username = 'rjowner', email = u.email, role = 'owner', skip = [] } = {}) {
  const b = db.batch();
  if (!skip.includes('bootstrap')) b.set(db.doc('settings/bootstrap'), { ownerUid: u.uid, createdAt: new Date() });
  if (!skip.includes('user')) b.set(db.doc(`users/${u.uid}`), { username, displayName: 'Owner', role, active: true, preferences: null, createdAt: new Date() });
  if (!skip.includes('username')) b.set(db.doc(`usernames/${username}`), { email, uid: u.uid });
  return b.commit();
}
async function seedOwner({ active = true } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('settings/bootstrap').set({ ownerUid: OWNER.uid });
    await db.doc(`users/${OWNER.uid}`).set({ username: 'rjowner', displayName: 'Owner', role: 'owner', active, preferences: null });
    await db.doc('usernames/rjowner').set({ email: OWNER.email, uid: OWNER.uid });
    await db.doc('settings/general').set({ businessName: 'RJ' });
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rj-ims', firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// ---- Before setup
test('anyone can check whether setup is needed and look up a username', async () => {
  await assertSucceeds(anon().doc('settings/bootstrap').get());
  await assertSucceeds(anon().doc('usernames/rjowner').get());
});
test('usernames can never be listed', async () => {
  await seedOwner();
  await assertFails(anon().collection('usernames').get());
  await assertFails(as(OWNER).collection('usernames').get());
});
test('signed-out users cannot read settings or users', async () => {
  await seedOwner();
  await assertFails(anon().doc('settings/general').get());
  await assertFails(anon().doc(`users/${OWNER.uid}`).get());
});

// ---- Bootstrap
test('first-time setup succeeds as one batch', async () => {
  await assertSucceeds(bootstrapBatch(as(OWNER), OWNER));
});
test('setup pieces alone are rejected (no partial owner)', async () => {
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { skip: ['bootstrap'] }));
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { skip: ['user', 'username'] }));
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { skip: ['bootstrap', 'user'] }));
});
test('setup cannot name someone else as owner or use a fake email', async () => {
  const db = as(STRANGER);
  const b = db.batch();
  b.set(db.doc('settings/bootstrap'), { ownerUid: OWNER.uid });
  b.set(db.doc(`users/${STRANGER.uid}`), { username: 'x', displayName: 'x', role: 'owner', active: true, preferences: null });
  await assertFails(b.commit());
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { email: 'someone-else@example.com' }));
});
test('setup cannot create a non-owner or add extra fields', async () => {
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { role: 'staff' }));
  const db = as(OWNER); const b = db.batch();
  b.set(db.doc('settings/bootstrap'), { ownerUid: OWNER.uid, extra: true });
  b.set(db.doc(`users/${OWNER.uid}`), { username: 'rjowner', displayName: 'O', role: 'owner', active: true, preferences: null });
  b.set(db.doc('usernames/rjowner'), { email: OWNER.email, uid: OWNER.uid });
  await assertFails(b.commit());
});
test('invalid usernames are rejected', async () => {
  await assertFails(bootstrapBatch(as(OWNER), OWNER, { username: 'Bad Name' }));
});
test('after setup, nobody can run setup again or replace the owner', async () => {
  await seedOwner();
  await assertFails(bootstrapBatch(as(STRANGER), STRANGER, { username: 'stranger' }));
  await assertFails(as(OWNER).doc('settings/bootstrap').set({ ownerUid: STRANGER.uid }));
  await assertFails(as(OWNER).doc('settings/bootstrap').delete());
});

// ---- After setup
test('owner reads and writes business settings', async () => {
  await seedOwner();
  await assertSucceeds(as(OWNER).doc('settings/general').get());
  await assertSucceeds(as(OWNER).doc('settings/general').set({ businessName: 'RJ Bugasan Store' }));
  await assertFails(as(OWNER).doc('settings/general').delete());
});
test('a signed-up stranger (no profile) can read and write nothing', async () => {
  await seedOwner();
  await assertFails(as(STRANGER).doc('settings/general').get());
  await assertFails(as(STRANGER).doc('settings/general').set({ businessName: 'hacked' }));
  await assertFails(as(STRANGER).doc(`users/${OWNER.uid}`).get());
  await assertFails(as(STRANGER).doc(`users/${STRANGER.uid}`).set({ username: 's', role: 'owner', active: true }));
});
test('owner may change own preferences but not role, active flag or username', async () => {
  await seedOwner();
  const ref = as(OWNER).doc(`users/${OWNER.uid}`);
  await assertSucceeds(ref.update({ preferences: { theme: 'dark' } }));
  await assertFails(ref.update({ role: 'staff' }));
  await assertFails(ref.update({ active: false }));
  await assertFails(ref.update({ username: 'other' }));
  await assertFails(ref.delete());
});
test('a deactivated owner loses access', async () => {
  await seedOwner({ active: false });
  await assertFails(as(OWNER).doc('settings/general').get());
});
test('usernames cannot be changed or deleted after setup', async () => {
  await seedOwner();
  await assertFails(as(OWNER).doc('usernames/rjowner').set({ email: 'x@example.com', uid: OWNER.uid }));
  await assertFails(as(OWNER).doc('usernames/rjowner').delete());
  await assertFails(as(OWNER).doc('usernames/newname').set({ email: OWNER.email, uid: OWNER.uid }));
});
test('collections without rules yet are denied, even to the owner', async () => {
  await seedOwner();
  await assertFails(as(OWNER).doc('payments/PAY-2026-00001').get());
  await assertFails(as(OWNER).doc('sales/RJ-2026-00001').set({ totalC: 1 }));
  await assertFails(as(OWNER).doc('_spike/probe').get());
});
