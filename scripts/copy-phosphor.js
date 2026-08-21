const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(__dirname, '../node_modules/@phosphor-icons/web/src');
const targetRoot = path.resolve(__dirname, '../pwa/phosphor');

for (const weight of ['regular', 'fill', 'bold']) {
    const source = path.join(sourceRoot, weight);
    const target = path.join(targetRoot, weight);
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(path.join(source, 'style.css'), path.join(target, 'style.css'));

    const fontName = weight === 'regular' ? 'Phosphor.woff2'
        : weight === 'fill' ? 'Phosphor-Fill.woff2'
        : 'Phosphor-Bold.woff2';
    fs.copyFileSync(path.join(source, fontName), path.join(target, fontName));
}
