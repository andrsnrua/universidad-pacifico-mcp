import assert from 'node:assert/strict';
import test from 'node:test';
import { activityDocument, activityWorthSaving, externalLinksDocument } from '../src/downloads/course-materials.js';

// La aplicación leía las actividades del boletín de notas y los archivos del árbol de contenidos,
// y nunca juntó las dos mitades: sabía que existía "Entrega 1" y cuándo vencía, pero no qué pedía.

test('el enunciado del profesor acaba en el documento', () => {
  const document = activityDocument({
    name: 'Entrega 1',
    description: '<p>Suban el informe en <b>PDF</b>.</p><p>Máximo 10 páginas.</p>',
    score: { possible: 20 },
  });
  assert.match(document, /^# Entrega 1/);
  assert.match(document, /Suban el informe en PDF/);
  assert.match(document, /Máximo 10 páginas/);
  // El HTML del profesor no debe llegar crudo a un archivo que se va a leer y a indexar.
  assert.doesNotMatch(document, /<p>|<b>/);
});

test('los datos que hacen falta para decidir van arriba, no enterrados', () => {
  const document = activityDocument({
    name: 'Trabajo #2',
    description: 'Entrega grupal.',
    grading: { due: '2026-09-04T04:59:00.000Z', attemptsAllowed: 2 },
    score: { possible: 20 },
  });
  assert.match(document, /Fecha de entrega \(Lima\):/);
  assert.match(document, /3 de/, 'La fecha UTC del 4 debe mostrarse como el 3 en Lima, independientemente de la zona del equipo.');
  assert.match(document, /20 puntos/);
  assert.match(document, /Intentos permitidos: 2/);
});

test('una fecha inservible no se inventa', () => {
  const document = activityDocument({ name: 'Sin fecha', description: 'Algo', grading: { due: 'no-es-una-fecha' } });
  assert.doesNotMatch(document, /Fecha de entrega/);
  assert.doesNotMatch(document, /Invalid Date|1970/);
});

test('una actividad sin enunciado lo dice, en vez de fingir que lo hay', () => {
  const document = activityDocument({ name: 'Asistencia', score: { possible: 100 } });
  assert.match(document, /no se recibieron indicaciones/i);
  assert.doesNotMatch(document, /profesor no escribió/i);
});

test('se guarda si hay enunciado o si hay archivos, no si no hay nada', () => {
  assert.equal(activityWorthSaving('<p>Suban el PDF aquí.</p>', 0), true);
  assert.equal(activityWorthSaving(undefined, 2), true, 'con archivos hace falta la carpeta');
  assert.equal(activityWorthSaving('', 0), false);
  assert.equal(activityWorthSaving('<p></p>', 0), false, 'HTML vacío no es un enunciado');
});

test('los enlaces del profesor quedan por escrito y se pueden pulsar', () => {
  const document = externalLinksDocument('Historia Economica', [
    { title: 'Entregue aquí las actividades en clase', url: 'https://example.edu/entrega' },
    { title: 'Sin destino' },
  ]);
  assert.match(document, /\[Entregue aquí las actividades en clase\]\(https:\/\/example\.edu\/entrega\)/);
  // Un enlace sin URL no es un enlace: no se escribe una entrada rota.
  assert.doesNotMatch(document, /Sin destino/);
});
