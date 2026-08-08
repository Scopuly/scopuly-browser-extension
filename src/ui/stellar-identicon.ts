const MATRIX_SIZE = 7;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(input: string) {
  const charmap = new Map(BASE32_ALPHABET.split('').map((character, index) => [character, index]));
  const buffer: number[] = [];
  let shift = 8;
  let carry = 0;

  input.toUpperCase().split('').forEach((character) => {
    const symbol = charmap.get(character);
    if (symbol === undefined) return;

    shift -= 5;
    if (shift > 0) {
      carry |= symbol << shift;
    } else if (shift < 0) {
      buffer.push(carry | (symbol >> -shift));
      shift += 8;
      carry = (symbol << shift) & 0xff;
    } else {
      buffer.push(carry | symbol);
      shift = 8;
      carry = 0;
    }
  });

  if (shift !== 8 && carry !== 0) buffer.push(carry);
  return buffer;
}

function bitAt(position: number, bytes: number[]) {
  const byte = bytes[Math.floor(position / 8)] || 0;
  return (byte & (1 << (7 - position % 8))) === 0 ? 0 : 1;
}

function colorFromByte(byte: number) {
  const hue = (byte / 255) * 360;
  return `hsl(${hue} 64% 45%)`;
}

export function createStellarIdenticon(address: string, size = 49) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'stellar-identicon';
  canvas.setAttribute('aria-label', 'Unique account identicon');

  const bytes = decodeBase32(address).slice(2, 16);
  const context = canvas.getContext('2d');
  if (!context || bytes.length < 7) return canvas;

  context.imageSmoothingEnabled = false;
  context.fillStyle = colorFromByte(bytes[0] || 0);
  const columns = Math.ceil(MATRIX_SIZE / 2);
  const cellSize = size / MATRIX_SIZE;

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < MATRIX_SIZE; row += 1) {
      if (!bitAt(column + row * columns, bytes.slice(1))) continue;

      context.fillRect(cellSize * column, cellSize * row, cellSize, cellSize);
      context.fillRect(
        cellSize * (MATRIX_SIZE - column - 1),
        cellSize * row,
        cellSize,
        cellSize
      );
    }
  }

  return canvas;
}
