import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_COLORS, classColor, readableTextColor } from './class-colors';

test('8 kelas bawaan masing-masing punya warna unik', () => {
  const colors = Object.values(CLASS_COLORS);
  assert.equal(colors.length, 8);
  assert.equal(new Set(colors).size, 8);
});

test('kelas baru mendapat warna deterministik dari palet cadangan', () => {
  assert.equal(classColor('kelas_baru'), classColor('kelas_baru'));
  assert.match(classColor('kelas_baru'), /^#[0-9a-f]{6}$/);
  assert.equal(classColor('sign'), '#2563eb');
});

test('warna teks terbaca: gelap di atas hijau limau, putih di atas biru/merah', () => {
  assert.equal(readableTextColor(CLASS_COLORS.weeds), '#111827');
  assert.equal(readableTextColor(CLASS_COLORS.sign), '#ffffff');
  assert.equal(readableTextColor(CLASS_COLORS.pavedroad_pothole), '#ffffff');
  assert.equal(readableTextColor(CLASS_COLORS.pavedroad_crack), '#111827');
});
