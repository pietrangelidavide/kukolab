import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doorFor, entry, entryOf, appHref, passwordLogin, staffHref } from '../src/config';
import type { Role } from '../src/lib/types';
import { ENTRIES, entryHtml, entryManifest } from '../scripts/lib/app.mjs';

const setAssets = (a: unknown) => { (globalThis as unknown as { window: unknown }).window = { KUKO_ASSETS: a }; };

test('ogni ruolo ha la sua porta: i clienti nell\'app, tutti gli altri nel gestionale', () => {
  const roles: Role[] = ['client', 'owner', 'staff', 'trainer'];
  assert.deepEqual(roles.map(entryOf), ['client', 'staff', 'staff', 'staff']);
});

test('la porta aperta la decide la pagina d\'ingresso; senza indicazione è l\'app dei clienti', () => {
  setAssets(undefined);
  assert.equal(entry(), 'client');
  setAssets({ mode: 'staff' });
  assert.equal(entry(), 'staff');
  setAssets({ mode: 'client', logo: 'x' });
  assert.equal(entry(), 'client');
});

test('indirizzi delle porte: predefiniti, cambiabili e vuoti nelle anteprime senza collegamenti', () => {
  setAssets({});
  assert.equal(appHref(), '/app/');
  assert.equal(staffHref(), '/gestionale/');
  assert.equal(doorFor('client'), '/app/');
  assert.equal(doorFor('owner'), '/gestionale/');
  setAssets({ app: 'app.html', staff: '' });
  assert.equal(doorFor('client'), 'app.html');
  assert.equal(doorFor('trainer'), '');
});

test('le pagine d\'ingresso condividono il codice ma hanno titolo, icona installabile e porta propri', () => {
  const app = entryHtml('client');
  const gest = entryHtml('staff');
  for (const html of [app, gest]) {
    assert.match(html, /src="\/app\/app\.js"/); // un solo codice per tutti e due
    assert.match(html, /href="\/app\/app\.css"/);
    assert.match(html, /noindex/);
  }
  assert.match(app, /<title>KUKO LAB \| Prenotazioni<\/title>/);
  assert.match(gest, /<title>KUKO LAB \| Gestionale<\/title>/);
  assert.match(app, /KUKO_ASSETS=\{mode:"client"\}/);
  assert.match(gest, /KUKO_ASSETS=\{mode:"staff"\}/);
  assert.match(app, /href="\/app\/manifest\.webmanifest"/);
  assert.match(gest, /href="\/gestionale\/manifest\.webmanifest"/);
});

test("l'accesso con password per le utenze di prova si accende solo con KUKO_PASSWORD_LOGIN=1", () => {
  const before = process.env.KUKO_PASSWORD_LOGIN;
  try {
    delete process.env.KUKO_PASSWORD_LOGIN;
    assert.doesNotMatch(entryHtml('staff'), /password:true/);
    process.env.KUKO_PASSWORD_LOGIN = '1';
    assert.match(entryHtml('staff'), /KUKO_ASSETS=\{mode:"staff",password:true\}/);
    assert.match(entryHtml('client'), /KUKO_ASSETS=\{mode:"client",password:true\}/);
  } finally {
    if (before === undefined) delete process.env.KUKO_PASSWORD_LOGIN; else process.env.KUKO_PASSWORD_LOGIN = before;
  }
  setAssets({}); assert.equal(passwordLogin(), false);
  setAssets({ password: true }); assert.equal(passwordLogin(), true);
});

test('il gestionale si installa a parte: manifest con il suo avvio e il suo ambito', () => {
  const a = JSON.parse(entryManifest('client'));
  const g = JSON.parse(entryManifest('staff'));
  assert.equal(a.start_url, '/app/'); assert.equal(a.scope, '/app/');
  assert.equal(g.start_url, '/gestionale/'); assert.equal(g.scope, '/gestionale/');
  assert.notEqual(a.name, g.name);
  assert.deepEqual(Object.keys(ENTRIES), ['client', 'staff']);
});
