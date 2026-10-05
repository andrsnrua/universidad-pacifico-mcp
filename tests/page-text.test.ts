import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToText } from '../src/downloads/course-materials.js';

/**
 * A course page's body was read only to harvest file links and then thrown away, so the lecturer's
 * written instructions — what to hand in, the length limit, the marking criteria — existed nowhere
 * on the student's machine and could not be searched.
 */

test('paragraphs are separated the same way however the HTML was formatted', () => {
  // The first version let stray newlines in the source decide the spacing, so two identical pages
  // could come out differently.
  const tight = htmlToText('<p>Lea el capítulo 3.</p><p>Entregue el viernes.</p>');
  const loose = htmlToText('<p>Lea el capítulo 3.</p>\n\n\n<p>   Entregue el viernes.   </p>');
  assert.equal(tight, 'Lea el capítulo 3.\n\nEntregue el viernes.');
  assert.equal(loose, tight);
});

test('a list of deliverables keeps one item per line, with no gap above it', () => {
  const text = htmlToText('<p>Entregables:</p><ul><li>Notebook</li><li>Informe de 5 páginas</li></ul>');
  assert.equal(text, 'Entregables:\n- Notebook\n- Informe de 5 páginas');
});

test('a criteria table is readable rather than a wall of words', () => {
  const text = htmlToText('<table><tr><td>Análisis</td><td>40%</td></tr><tr><td>Redacción</td><td>20%</td></tr></table>');
  assert.match(text, /Análisis \| 40%/);
  assert.match(text, /Redacción \| 20%/);
});

test('accents survive whether written as decimal, hexadecimal or by name', () => {
  // Blackboard emits all three depending on how the text was pasted; only decimals were handled,
  // so `gr&#xe1;ficos` stayed in the saved file verbatim.
  assert.equal(htmlToText('<p>M&#225;ximo 5 p&#225;ginas</p>'), 'Máximo 5 páginas');
  assert.equal(htmlToText('<p>2 gr&#xe1;ficos</p>'), '2 gráficos');
  assert.equal(htmlToText('<p>se&ntilde;or Mu&ntilde;oz</p>'), 'señor Muñoz');
  assert.equal(htmlToText('<p>&iquest;Cu&aacute;ndo? &hellip;</p>'), '¿Cuándo? …');
});

test('markup symbols are decoded, not left as entities', () => {
  assert.equal(htmlToText('<p>Usa &quot;comillas&quot; y &lt;etiquetas&gt; &amp; s&iacute;mbolos</p>'), 'Usa "comillas" y <etiquetas> & símbolos');
});

test('an unknown entity is left alone rather than mangled', () => {
  assert.equal(htmlToText('<p>Precio &notarealentity; final</p>'), 'Precio &notarealentity; final');
});

test('scripts and styles never reach the saved file', () => {
  const text = htmlToText('<style>.x{color:red}</style><p>Instrucciones</p><script>alert(1)</script>');
  assert.equal(text, 'Instrucciones');
});

test('line breaks written by the lecturer are respected', () => {
  assert.equal(htmlToText('Primera línea<br>Segunda línea'), 'Primera línea\nSegunda línea');
});

test('a page with no real text produces nothing to save', () => {
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText('<p>&nbsp;</p><div></div>'), '');
});
