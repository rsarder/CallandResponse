import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const resultsDir = resolve('test-results', 'browser');
await mkdir(resultsDir, { recursive: true });
const artifact = name => resolve(resultsDir, name);

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
const externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
page.on('request', request => { if (/^https?:/.test(request.url()) && !/^http:\/\/localhost:5173\//.test(request.url())) externalRequests.push(request.url()); });

async function openEmpty() {
  await page.goto(`http://localhost:5173/?test=${Date.now()}-${Math.random()}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /create a box/i }).waitFor();
  if (!await page.getByText(/Your scene is empty/i).isVisible()) throw new Error('Fresh browser scenario did not start with an empty scene');
}

async function saveScene(name) {
  const path = artifact(`${name}.scene.json`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save project/i }).click();
  const download = await downloadPromise;
  await download.saveAs(path);
  return { path, scene: JSON.parse(await readFile(path, 'utf8')) };
}

async function selectRows(names) {
  await page.getByRole('button', { name: names[0] }).click();
  for (const name of names.slice(1)) await page.getByRole('button', { name }).click({ modifiers: ['Shift'] });
}

async function contextAction(rowName, action) {
  await page.getByRole('button', { name: rowName }).click({ button: 'right' });
  await page.getByRole('button', { name: new RegExp(`^${action}$`, 'i') }).click();
}

try {
  // Conventional transforms and an actual Shape-mode handle drag.
  await openEmpty();
  await page.getByRole('button', { name: /create a box/i }).click();
  await page.getByRole('button', { name: /Box 1 box/i }).waitFor();
  await page.getByLabel('Width').fill('60'); await page.getByLabel('Width').press('Tab');
  await page.getByRole('button', { name: /Shape Edit geometry/i }).click();
  await page.getByRole('button', { name: /^Front$/i }).click();
  await page.waitForTimeout(250);
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Viewport canvas missing');
  await page.screenshot({ path: artifact('shape-before.png') });
  // Front preset: the selected object's +X arrow is the red handle at the right edge.
  const handleX = canvasBox.x + canvasBox.width * 0.65;
  const handleY = canvasBox.y + canvasBox.height * 0.385;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX + 70, handleY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const afterHandle = await saveScene('browser-after-handle');
  const handledBox = afterHandle.scene.objects.find(object => object.name === 'Box 1');
  if (!handledBox || handledBox.shape.kind !== 'box' || handledBox.shape.sizeMm[0] <= 60) throw new Error('Shape handle did not increase box width');
  await page.screenshot({ path: artifact('shape-after.png') });
  await page.getByRole('button', { name: /Undo/i }).click();
  const afterUndo = await saveScene('browser-after-undo');
  if (afterUndo.scene.objects[0].shape.sizeMm[0] !== 60) throw new Error('Undo did not restore pre-drag dimensions');
  await page.getByRole('button', { name: /Redo/i }).click();
  const afterRedo = await saveScene('browser-after-redo');
  if (afterRedo.scene.objects[0].shape.sizeMm[0] <= 60) throw new Error('Redo did not restore Shape-mode drag');
  await page.getByRole('button', { name: /Object Transform objects/i }).click();
  await page.getByLabel(/^X$/).fill('12'); await page.getByLabel(/^X$/).press('Tab');
  await page.getByLabel('Y rotation').fill('25'); await page.getByLabel('Y rotation').press('Tab');
  await page.getByLabel('X scale').fill('1.25'); await page.getByLabel('X scale').press('Tab');

  // A sphere-family primitive has independent canonical radii and editable axis handles.
  await openEmpty();
  await page.getByRole('button', { name: /Sphere \+/i }).click();
  await page.getByLabel('X radius').fill('30'); await page.getByLabel('X radius').press('Tab');
  await page.getByLabel('Y radius').fill('15'); await page.getByLabel('Y radius').press('Tab');
  await page.getByLabel('Z radius').fill('10'); await page.getByLabel('Z radius').press('Tab');
  await page.getByRole('button', { name: /Shape Edit geometry/i }).click();
  await page.getByRole('button', { name: /^Front$/i }).click();
  await page.waitForTimeout(250);
  const ellipsoidCanvas = await page.locator('canvas').boundingBox();
  if (!ellipsoidCanvas) throw new Error('Ellipsoid viewport canvas missing');
  await page.screenshot({ path: artifact('ellipsoid-handles.png') });
  const ellipsoidHandleX = ellipsoidCanvas.x + ellipsoidCanvas.width * 0.65;
  const ellipsoidHandleY = ellipsoidCanvas.y + ellipsoidCanvas.height * 0.385;
  await page.mouse.move(ellipsoidHandleX, ellipsoidHandleY);
  await page.mouse.down();
  await page.mouse.move(ellipsoidHandleX + 45, ellipsoidHandleY, { steps: 8 });
  await page.mouse.up();
  const ellipsoid = (await saveScene('browser-ellipsoid')).scene.objects[0];
  if (ellipsoid.shape.kind !== 'sphere' || ellipsoid.shape.radiiMm[0] <= 30 || ellipsoid.shape.radiiMm[1] !== 15 || ellipsoid.shape.radiiMm[2] !== 10) throw new Error('Ellipsoid axis handle did not edit only the selected radius');

  // Group, move the group, and explicitly ungroup while preserving visible positions.
  await openEmpty();
  await page.getByRole('button', { name: /create a box/i }).click();
  await page.getByRole('button', { name: /Sphere \+/i }).click();
  await page.getByLabel(/^X$/).fill('20'); await page.getByLabel(/^X$/).press('Tab');
  await selectRows([/Box 1.*box/i, /Sphere 1.*sphere/i]);
  await contextAction(/Sphere 1.*sphere/i, 'Group');
  const groupRow = page.getByRole('button', { name: /EmptyObject 1 empty/i });
  await groupRow.waitFor();
  await page.screenshot({ path: artifact('grouped.png') });
  await page.getByLabel(/^X$/).fill('15'); await page.getByLabel(/^X$/).press('Tab');
  await contextAction(/EmptyObject 1 empty/i, 'Ungroup');
  await page.getByRole('button', { name: /EmptyObject 1 empty/i }).waitFor({ state: 'detached' });
  const ungrouped = await saveScene('browser-ungrouped');
  const ungroupedBox = ungrouped.scene.objects.find(object => object.name === 'Box 1');
  const ungroupedSphere = ungrouped.scene.objects.find(object => object.name === 'Sphere 1');
  if (ungroupedBox.parentId || ungroupedSphere.parentId) throw new Error('Ungroup left stale parent references');
  if (Math.abs(ungroupedBox.positionMm[0] - 5) > 0.01 || Math.abs(ungroupedSphere.positionMm[0] - 25) > 0.01) throw new Error('Ungroup did not preserve moved world positions');

  // Round-primitive Boolean, result manipulation, and a chained Boolean result.
  await openEmpty();
  await page.getByRole('button', { name: /Sphere \+/i }).click();
  await page.getByRole('button', { name: /Cylinder \+/i }).click();
  await page.getByLabel(/^X$/).fill('10'); await page.getByLabel(/^X$/).press('Tab');
  await selectRows([/Sphere 1.*sphere/i, /Cylinder 1.*cylinder/i]);
  await contextAction(/Cylinder 1.*cylinder/i, 'Union');
  await page.getByText('Union preview', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Apply$/i }).click();
  const firstMeshRow = page.getByRole('button', { name: /Sphere 1 Union mesh/i });
  await firstMeshRow.waitFor();
  await page.locator('.tool-group button').filter({ hasText: 'Move' }).click();
  await page.screenshot({ path: artifact('boolean-move-gizmo.png') });
  await page.locator('.tool-group button').filter({ hasText: 'Rotate' }).click();
  await page.screenshot({ path: artifact('boolean-rotate-gizmo.png') });
  await page.locator('.tool-group button').filter({ hasText: 'Scale' }).click();
  await page.screenshot({ path: artifact('boolean-scale-gizmo.png') });
  await page.getByLabel(/^X$/).fill('8'); await page.getByLabel(/^X$/).press('Tab');
  await page.getByLabel('Z scale').fill('1.2'); await page.getByLabel('Z scale').press('Tab');
  await page.getByRole('button', { name: /Box \+/i }).click();
  await page.getByLabel(/^X$/).fill('16'); await page.getByLabel(/^X$/).press('Tab');
  await selectRows([/Sphere 1 Union.*mesh/i, /Box 1.*box/i]);
  await contextAction(/Box 1.*box/i, 'Subtract');
  await page.getByText('Subtract preview', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Apply$/i }).click();
  const chainedRow = page.getByRole('button', { name: /Sphere 1 Union Cut mesh/i });
  await chainedRow.waitFor();
  await page.screenshot({ path: artifact('boolean-chained.png') });
  const chained = await saveScene('browser-boolean-chained');
  if (chained.scene.schemaVersion !== 2 || chained.scene.objects.length !== 1 || chained.scene.objects[0].shape.kind !== 'mesh') throw new Error('Chained Boolean did not produce one v2 mesh');
  const result = chained.scene.objects[0];
  if (result.shape.vertices.length >= result.shape.triangles.length * 3) throw new Error('Boolean result was serialized as redundant triangle soup');
  if (result.positionMm.every(value => value === 0)) throw new Error('Boolean result did not receive a meaningful local pivot');

  // Persist a mixed scene containing a Boolean mesh, a primitive, and hierarchy.
  await page.getByRole('button', { name: /Box \+/i }).click();
  await selectRows([/Sphere 1 Union Cut.*mesh/i, /Box 1.*box/i]);
  await contextAction(/Box 1.*box/i, 'Group');
  await page.getByRole('button', { name: /EmptyObject 1 empty/i }).waitFor();
  const mixed = await saveScene('browser-mixed');
  if (mixed.scene.objects.length !== 3 || !mixed.scene.objects.some(object => object.shape.kind === 'mesh') || !mixed.scene.objects.some(object => object.shape.kind === 'box')) throw new Error('Mixed grouped scene was not serialized completely');

  // Save/reload uses the native v2 document without a private store import.
  await page.getByRole('button', { name: /Delete/i }).click();
  await page.getByText(/Your scene is empty/i).waitFor();
  await page.locator('input[type=file]').setInputFiles(mixed.path);
  await chainedRow.waitFor();
  const reopened = await saveScene('browser-reopened');
  if (JSON.stringify(reopened.scene.objects) !== JSON.stringify(mixed.scene.objects)) throw new Error('Native JSON round trip changed scene objects');

  // Invalid load must not corrupt the current scene.
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: /Dismiss error/i }).click();
  const afterInvalid = await saveScene('browser-after-invalid');
  if (JSON.stringify(afterInvalid.scene.objects) !== JSON.stringify(mixed.scene.objects)) throw new Error('Invalid JSON corrupted the scene');

  if (externalRequests.length) throw new Error(`External requests detected: ${externalRequests.join(', ')}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('Browser workflows passed: box and ellipsoid shape handles, history, group/move/ungroup, round and chained Booleans, gizmo screenshots, mixed-scene save/load, and invalid-load safety.');
} finally {
  await browser.close();
}
