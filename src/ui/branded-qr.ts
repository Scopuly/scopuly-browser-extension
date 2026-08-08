import QRCode from 'qrcode';

const QR_CANVAS_TARGET_SIZE = 640;
const QR_QUIET_ZONE_MODULES = 4;
const QR_DOT_SCALE = .86;
const QR_DARK = '#11121a';
const QR_BRAND = '#526bf0';

type CornerRadii = [number, number, number, number];

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | CornerRadii
) {
  const source = typeof radius === 'number'
    ? [radius, radius, radius, radius]
    : radius;
  const [topLeft, topRight, bottomRight, bottomLeft] = source.map((value) => (
    Math.min(value, width / 2, height / 2)
  ));
  context.beginPath();
  context.moveTo(x + topLeft, y);
  context.lineTo(x + width - topRight, y);
  context.quadraticCurveTo(x + width, y, x + width, y + topRight);
  context.lineTo(x + width, y + height - bottomRight);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - bottomRight,
    y + height
  );
  context.lineTo(x + bottomLeft, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
  context.lineTo(x, y + topLeft);
  context.quadraticCurveTo(x, y, x + topLeft, y);
  context.closePath();
  context.fill();
}

function isFinderModule(row: number, column: number, size: number) {
  return (row < 7 && column < 7)
    || (row < 7 && column >= size - 7)
    || (row >= size - 7 && column < 7);
}

function drawFinder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  moduleSize: number,
  squareCorner: 0 | 1 | 2 | 3
) {
  const outerRadii: CornerRadii = [1.35, 1.35, 1.35, 1.35]
    .map((value, index) => (index === squareCorner ? 0 : value * moduleSize)) as CornerRadii;
  const innerRadii: CornerRadii = [.12, .12, .12, .12]
    .map((value, index) => (index === squareCorner ? 0 : value * moduleSize)) as CornerRadii;
  context.fillStyle = QR_BRAND;
  roundedRect(context, x, y, moduleSize * 7, moduleSize * 7, outerRadii);
  context.fillStyle = '#ffffff';
  roundedRect(
    context,
    x + moduleSize,
    y + moduleSize,
    moduleSize * 5,
    moduleSize * 5,
    outerRadii.map((value) => Math.max(0, value - moduleSize)) as CornerRadii
  );
  context.fillStyle = QR_DARK;
  roundedRect(
    context,
    x + moduleSize * 2,
    y + moduleSize * 2,
    moduleSize * 3,
    moduleSize * 3,
    innerRadii
  );
}

async function loadBrandCoin() {
  const image = new Image();
  image.src = 'brand/scopuly-coin-source.png';
  await image.decode();
  return image;
}

export async function renderBrandedQr(value: string) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const totalModules = count + QR_QUIET_ZONE_MODULES * 2;
  const moduleSize = Math.max(1, Math.floor(QR_CANVAS_TARGET_SIZE / totalModules));
  const canvasSize = totalModules * moduleSize;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to render the Scopuly pairing QR code.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.fillStyle = QR_DARK;
  const offset = QR_QUIET_ZONE_MODULES * moduleSize;
  const logoClearRadius = 4;
  const center = (count - 1) / 2;
  const dotSize = moduleSize * QR_DOT_SCALE;
  const dotInset = (moduleSize - dotSize) / 2;

  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!qr.modules.get(row, column) || isFinderModule(row, column, count)) continue;
      if (Math.abs(row - center) <= logoClearRadius
        && Math.abs(column - center) <= logoClearRadius) continue;
      roundedRect(
        context,
        offset + column * moduleSize + dotInset,
        offset + row * moduleSize + dotInset,
        dotSize,
        dotSize,
        moduleSize * .28
      );
    }
  }

  drawFinder(context, offset, offset, moduleSize, 2);
  drawFinder(context, offset + (count - 7) * moduleSize, offset, moduleSize, 3);
  drawFinder(context, offset, offset + (count - 7) * moduleSize, moduleSize, 1);

  const coin = await loadBrandCoin();
  const logoSize = moduleSize * 7;
  const logoX = (canvasSize - logoSize) / 2;
  const logoY = (canvasSize - logoSize) / 2;
  context.drawImage(coin, logoX, logoY, logoSize, logoSize);

  return canvas.toDataURL('image/png');
}
